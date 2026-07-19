import { GameState } from './game-state'
import { moveAircraft } from './movement'
import { processPhaseTransitions, checkAircraftRemoval } from './phase-transitions'
import { separationChecker, clearViolationFlags } from './separation'
import { runAiControllers } from './ai-controller'
import { spawnArrival, spawnDeparture, isSpawnPointClear } from './aircraft-factory'
import { findRunwayById, getAvailableGates, getArrivalSpawnPoints, selectActiveRunway } from './airport-loader'
import { GameEventType, AircraftPhase, RadioSpeaker } from './types'
import { eventBus } from './event-bus'
import { MVA_FT } from './constants'

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

    // 2. Movement
    moveAircraft(aircraft, dtSeconds, runway)

    // 3. Phase Transitions
    processPhaseTransitions(aircraft, runway, state.airport)

    // 4. MVA Violation Check (PRD §15)
    // The MVA is a vectoring floor: it only applies where the controller can
    // descend/vector someone into terrain (ENTERING/APPROACH). Everything
    // else legitimately occupies the 7,661–8,800 ft band — departures on
    // climb-out, go-arounds, final/landing traffic, and aircraft on the
    // ground (landed arrivals keep field elevation ~7,661 ft MSL, which
    // used to false-alert every rollout/taxi-in).
    if (aircraft.altitude < (state.airport?.mvaFt ?? MVA_FT) &&
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
      state.removeAircraft(aircraft.id)
      eventBus.emit(GameEventType.AIRCRAFT_REMOVED, { callsign: aircraft.callsign })
    }
  }

  // 6. Separation Checking
  separationChecker.checkSeparation(state.allAircraft(), nowMs)

  // 7. AI Controller Decisions — after separation checking so inViolation
  // flags are current for this tick (nextExpectedCommand's FINAL branch
  // checks it).
  runAiControllers(state, nowMs)

  // 8. Session Expiry Check
  if (state.isSessionExpired() && !state.sessionEnded) {
    state.sessionEnded = true
    eventBus.emit(GameEventType.SESSION_ENDED, { score: state.score, grade: state.getGrade() })
  }

  // 9. Flush queued events
  eventBus.flush()
}

function handleSpawning(state: GameState, nowMs: number): void {
  if (!state.airport) return

  // Initial spawn at start of session (1 departure, 1 arrival)
  if (state.aircraft.size === 0 && state.elapsedMs < 2000) {
    spawnOneArrival(state)
    spawnOneDeparture(state)
    state.lastSpawnTime = nowMs
    return
  }

  // Periodic spawn
  if (nowMs - state.lastSpawnTime >= state.difficulty.spawnIntervalMs) {
    if (state.aircraft.size < state.difficulty.maxAircraft) {
      // 50/50 chance for arrival or departure
      if (Math.random() > 0.5) {
        spawnOneArrival(state)
      } else {
        spawnOneDeparture(state)
      }
    }
    state.lastSpawnTime = nowMs
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
  const ac = spawnArrival(point)
  
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
  const ac = spawnDeparture(gate, runway)
  
  state.addAircraft(ac)
  eventBus.emit(GameEventType.AIRCRAFT_SPAWNED, { callsign: ac.callsign, flightType: 'departure' })
}
