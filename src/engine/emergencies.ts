import type { Aircraft } from './types'
import { GameEventType, RadioSpeaker } from './types'
import { eventBus } from './event-bus'
import { gameState } from './game-state'
import {
  AIRBORNE_PHASES,
  LOW_FUEL_ARRIVAL_CHANCE,
  LOW_FUEL_TOTAL_MS,
  LOW_FUEL_DECLARE_MS,
  RADIO_FAILURE_CHANCE_PER_TICK,
  RADIO_FAILURE_DURATION_MS,
} from './constants'

/**
 * Emergencies-lite: two session hazards layered on top of the normal loop.
 *
 * Low fuel — some arrivals spawn fuel-critical. The pilot calls PAN PAN
 * minimum fuel when the clock runs low (advisory, amber); if the clock hits
 * zero while still airborne the pilot declares MAYDAY and the session takes
 * a one-time fuel_emergency score hit. Landing a declared low-fuel aircraft
 * safely earns fuel_priority_landed.
 *
 * Radio failure (NORDO) — an airborne aircraft under player control randomly
 * goes off the frequency for a fixed window: commands to it are rejected,
 * and the pilot restores contact when the window passes. Never assigned to
 * AI-controlled aircraft so the AI never spins against a blocked frequency.
 *
 * Runs once per tick from simulation-tick.ts, before the separation check.
 */

export function maybeAssignLowFuel(aircraft: Aircraft): void {
  if (aircraft.flightType !== 'arrival') return
  if (Math.random() >= LOW_FUEL_ARRIVAL_CHANCE) return
  // ±20% jitter so a queue of low-fuel arrivals rarely shares one deadline
  const jitter = 0.8 + Math.random() * 0.4
  aircraft.fuelMsRemaining = Math.round(LOW_FUEL_TOTAL_MS * jitter)
  aircraft.fuelDeclared = false
  aircraft.fuelEmergencyDeclared = false
}

export function updateEmergencies(state: import('./game-state').GameState, dtSeconds: number): void {
  const dtMs = dtSeconds * 1000

  for (const aircraft of state.allAircraft()) {
    const airborne = AIRBORNE_PHASES.has(aircraft.phase)
    updateFuel(aircraft, dtMs, airborne)
    updateRadioFailure(aircraft, airborne, state)
  }
}

function updateFuel(aircraft: Aircraft, dtMs: number, airborne: boolean): void {
  if (aircraft.fuelMsRemaining == null) return

  // Fuel only burns while airborne — on the ground or landed the clock stops
  if (!airborne) return
  aircraft.fuelMsRemaining = Math.max(0, aircraft.fuelMsRemaining - dtMs)

  if (!aircraft.fuelDeclared && aircraft.fuelMsRemaining <= LOW_FUEL_DECLARE_MS) {
    aircraft.fuelDeclared = true
    aircraft.urgent = true
    // Plain PILOT_CALL emission (no pendingPilotCall) — a PAN PAN is a
    // broadcast, not a request that blocks the phase machine on an ack
    eventBus.emit(GameEventType.PILOT_CALL, {
      callsign: aircraft.callsign,
      message: `PAN PAN, ${aircraft.callsign}, minimum fuel, ${Math.round(aircraft.fuelMsRemaining / 1000)} seconds remaining, requesting priority`,
    })
  }

  if (!aircraft.fuelEmergencyDeclared && aircraft.fuelMsRemaining <= 0) {
    aircraft.fuelEmergencyDeclared = true
    gameState.addRadioMessage({
      timestamp: Date.now(),
      speaker: 'CRITICAL' satisfies RadioSpeaker,
      message: `${aircraft.callsign} MAYDAY MAYDAY MAYDAY — FUEL EXHAUSTED. PRIORITY HANDLING REQUIRED.`,
      callsign: aircraft.callsign,
    })
    eventBus.emit(GameEventType.FUEL_EMERGENCY, { callsign: aircraft.callsign })
  }
}

function updateRadioFailure(aircraft: Aircraft, airborne: boolean, state: import('./game-state').GameState): void {
  const deadline = aircraft.radioFailureUntilMs ?? null

  if (deadline !== null && state.elapsedMs >= deadline) {
    // Contact restored
    aircraft.radioFailureUntilMs = null
    gameState.addRadioMessage({
      timestamp: Date.now(),
      speaker: 'PILOT' satisfies RadioSpeaker,
      message: `${state.airport?.metadata.name ?? 'Asmara'} ${stationWord(aircraft)}, ${aircraft.callsign}, radio restored, sorry, we had a transmitter issue, back on frequency.`,
      station: aircraft.callsign,
    })
    return
  }

  if (deadline !== null) return // failure already active
  if (aircraft.radioFailureUsed) return // one failure per aircraft per session
  if (!airborne) return
  // AI stations must never receive a NORDO aircraft — the AI would spin
  if (!state.playerStations.includes(aircraft.controller)) return
  if (Math.random() >= RADIO_FAILURE_CHANCE_PER_TICK) return

  aircraft.radioFailureUsed = true
  aircraft.radioFailureUntilMs = state.elapsedMs + RADIO_FAILURE_DURATION_MS
  gameState.addRadioMessage({
    timestamp: Date.now(),
    speaker: 'SYSTEM' satisfies RadioSpeaker,
    message: `${aircraft.callsign} squawking 7600 — radio failure suspected (NORDO). Aircraft continues on last clearance.`,
    callsign: aircraft.callsign,
  })
}

function stationWord(aircraft: Aircraft): string {
  switch (aircraft.controller) {
    case 'GROUND': return 'Ground'
    case 'APPROACH': return 'Approach'
    default: return 'Tower'
  }
}

/** True while the aircraft is inside an active NORDO window */
export function isNordo(aircraft: Aircraft, elapsedMs: number): boolean {
  const deadline = aircraft.radioFailureUntilMs
  return deadline !== undefined && deadline !== null && elapsedMs < deadline
}
