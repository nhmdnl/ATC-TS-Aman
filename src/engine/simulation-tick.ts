import { GameState } from './game-state'
import { moveAircraft } from './movement'
import { processPhaseTransitions, checkAircraftRemoval, checkPilotCallRepeats } from './phase-transitions'
import { separationChecker, clearViolationFlags } from './separation'
import { runAiControllers } from './ai-controller'
import { updateEmergencies } from './emergencies'
import { predictConflicts } from './conflict-probe'
import { spawnArrival, spawnDeparture, isSpawnPointClear } from './aircraft-factory'
import { trafficScheduler } from './traffic-scheduler'
import type { ScheduledFlight } from './traffic-scheduler'
import { findRunwayById, findHelipadById, getAvailableGates, getArrivalSpawnPoints, selectActiveRunway, filterSuitableAircraftTypes } from './airport-loader'
import { GameEventType, AircraftPhase, RadioSpeaker, PilotCallType } from './types'
import { eventBus } from './event-bus'
import { MVA_FT } from './constants'
import hhasSchedule from '../data/airports/hhas.schedule.json'

/**
 * Main simulation tick function. Runs at 1 Hz.
 * @param state Game state (mutated in place)
 * @param dtSeconds Delta time in seconds since last tick (normally 1.0)
 */
export function tick(state: GameState, dtSeconds: number): void {
  if (state.paused || !state.airport || !state.sessionStarted) return

  const nowMs = Date.now()
  state.elapsedMs += (dtSeconds * 1000)

  // 1. Spawning Logic
  handleSpawning(state, nowMs)

  // Clear previous violation flags before checking separation
  const allAircraft = state.allAircraft()
  clearViolationFlags(allAircraft)

  for (const aircraft of allAircraft) {
    const runway = aircraft.assignedRunway ? findRunwayById(state.airport, aircraft.assignedRunway) : null
    const helipad = aircraft.assignedGate ? findHelipadById(state.airport, aircraft.assignedGate) : null

    // 2. Movement
    moveAircraft(aircraft, dtSeconds, runway, helipad)

    // 3. Phase Transitions
    processPhaseTransitions(aircraft, runway, state.airport, helipad)

    // 4. MVA Violation Check (PRD §15)
    // The MVA is a vectoring floor: it only applies where the controller can
    // descend/vector someone into terrain (ENTERING/APPROACH). Everything
    // else legitimately occupies the 7,661–8,800 ft band — departures on
    // climb-out, go-arounds, final/landing traffic, and aircraft on the
    // ground (landed arrivals keep field elevation ~7,661 ft MSL, which
    // used to false-alert every rollout/taxi-in).
    // Rotorcraft are exempt: they fly visual descents straight onto their
    // pad, well under any MVA, by design.
    if (!aircraft.type.rotorcraft &&
        aircraft.altitude < (state.airport?.mvaFt ?? MVA_FT) &&
        (aircraft.phase === AircraftPhase.ENTERING || aircraft.phase === AircraftPhase.APPROACH)) {

      // Alert once per aircraft — repeating every 10 s was radio spam
      // ponytail: single MVA floor per airport — per-quadrant from airport data when MVA varies by sector
      const mvaKey = `mva_${aircraft.id}`
      if (!(state as any)[mvaKey]) {
        state.addRadioMessage({
          timestamp: nowMs,
          speaker: 'CRITICAL',
          message: `${aircraft.callsign} LOW ALTITUDE ALERT. CHECK MVA.`,
          station: 'SYSTEM'
        })
        ;(state as any)[mvaKey] = true
      }
    }

    // 5. Cleanup
    if (checkAircraftRemoval(aircraft)) {
      // Detect missed handoff before removing from state
      const missedHandoff = aircraft.flightType === 'departure' &&
        aircraft.phase === AircraftPhase.DEPARTED &&
        !aircraft.handedOff &&
        state.playerStations.includes(aircraft.controller)
      state.removeAircraft(aircraft.id)
      eventBus.emit(GameEventType.AIRCRAFT_REMOVED, { callsign: aircraft.callsign, missedHandoff })
    }
  }

  // 6. Emergencies (fuel burn / NORDO) — before separation so a mayday
  //    aircraft's urgency flags are current for this tick
  updateEmergencies(state, dtSeconds)

  // 7. Separation Checking
  separationChecker.checkSeparation(state.allAircraft(), nowMs)

  // 8. Conflict prediction probe — after separation so currently-violating
  //    pairs (inViolation) are excluded from amber advisories
  predictConflicts(state.allAircraft())

  // 9. Pilot call repeat check (re-fires unacknowledged calls)
  if (state.airport) checkPilotCallRepeats(state.allAircraft(), state.airport)

  // 10. AI Controller Decisions — after separation checking so inViolation
  // flags are current for this tick (nextExpectedCommand's FINAL branch
  // checks it).
  runAiControllers(state, nowMs)

  // 11. Session Expiry Check
  if (state.isSessionExpired() && !state.sessionEnded) {
    state.sessionEnded = true
    eventBus.emit(GameEventType.SESSION_ENDED, { score: state.score, grade: state.getGrade() })
  }

  // 12. Flush queued events
  eventBus.flush()
}

function handleSpawning(state: GameState, nowMs: number): void {
  if (!state.airport) return

  // Schedule-based traffic: advance through the HHAS schedule
  trafficScheduler.tick(state, hhasSchedule as ScheduledFlight[])

  // Fallback random spawning if schedule is exhausted and traffic is thin
  // (also covers airports with no schedule file)
  if (state.aircraft.size < 2 && state.elapsedMs > 30_000) {
    if (nowMs - state.lastSpawnTime >= state.difficulty.spawnIntervalMs) {
      if (Math.random() > 0.5) spawnOneArrival(state)
      else spawnOneDeparture(state)
      state.lastSpawnTime = nowMs
    }
  }
}

function spawnOneArrival(state: GameState): void {
  if (!state.airport) return
  // Skip entry points with traffic nearby — spawning there creates an
  // instant separation violation the player never had a chance to prevent
  const traffic = state.allAircraft()
  const points = getArrivalSpawnPoints(state.airport)
    .filter(p => isSpawnPointClear(p, traffic))
  if (points.length === 0) return // all entries blocked — retry next spawn cycle

  const point = points[Math.floor(Math.random() * points.length)]
  // Random arrivals stay fixed-wing — rotorcraft arrive via the authored
  // schedule, which assigns their helipad (T-014)
  const pool = filterSuitableAircraftTypes(state.airport, state.enabledAircraftClasses)
    .filter(t => !t.rotorcraft)
  const ac = spawnArrival(point, undefined, pool[Math.floor(Math.random() * pool.length)])

  // Assign the wind-favored active runway
  ac.assignedRunway = selectActiveRunway(state.airport, state.wind)?.id ?? null

  state.addAircraft(ac)
  eventBus.emit(GameEventType.AIRCRAFT_SPAWNED, { callsign: ac.callsign, flightType: 'arrival' })
}

function spawnOneDeparture(state: GameState): void {
  if (!state.airport) return
  const availableGates = getAvailableGates(state.airport, state.occupiedGateIds)
  if (availableGates.length === 0) return

  const gate = availableGates[Math.floor(Math.random() * availableGates.length)]
  // Departures use the same wind-favored runway as arrivals — never opposite ends
  const runway = selectActiveRunway(state.airport, state.wind)?.id ?? ''
  // Random departures stay fixed-wing — a rotorcraft at a gate would have no
  // pad to return to and skip the entire taxi chain (T-014)
  const pool = filterSuitableAircraftTypes(state.airport, state.enabledAircraftClasses)
    .filter(t => !t.rotorcraft)
  const ac = spawnDeparture(gate, runway, undefined, pool[Math.floor(Math.random() * pool.length)])

  state.addAircraft(ac)
  eventBus.emit(GameEventType.AIRCRAFT_SPAWNED, { callsign: ac.callsign, flightType: 'departure' })
}
