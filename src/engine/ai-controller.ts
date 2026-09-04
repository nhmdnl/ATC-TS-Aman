import type { Aircraft } from './types'
import { AircraftPhase, CommandType, ControllerStation } from './types'
import type { GameState } from './game-state'
import { processCommand } from './commands/command-registry'
import { selectActiveRunway } from './airport-loader'
import { AI_MIN_DECISION_INTERVAL_MS } from './constants'

/**
 * Textbook next command for an AI-controlled aircraft.
 * Returns null when the phase advances on its own, is terminal, or the
 * one-shot command has already been issued.
 *
 * New TS3 phases:
 *  - AWAITING_PUSHBACK → PUSHBACK_APPROVED (AI ground auto-approves)
 *  - READY_TO_TAXI     → TAXI (same as old PARKED)
 *  - INBOUND_UNCONTROLLED → STANDBY (acknowledge "with you" call so the
 *    aircraft transitions to APPROACH and normal AI handling resumes)
 */
export function nextExpectedCommand(aircraft: Aircraft): CommandType | null {
  switch (aircraft.phase) {
    // ── Departure ────────────────────────────────────────────────────────
    case AircraftPhase.AT_GATE:
      // Rotorcraft (T-014) liftoff straight from the pad — AI tower clears it
      if (aircraft.type.rotorcraft) return CommandType.CLEARED_TAKEOFF
      return null // waiting for pushback call timer — phase-transitions handles it

    case AircraftPhase.AWAITING_PUSHBACK:
      // AI Ground auto-approves pushback
      return aircraft.pendingPilotCall !== null ? CommandType.PUSHBACK_APPROVED : null

    case AircraftPhase.PUSHING_BACK:
      return null // time-driven in phase-transitions

    case AircraftPhase.READY_TO_TAXI:
      return CommandType.TAXI

    case AircraftPhase.HOLD_SHORT:
      return CommandType.LINE_UP_WAIT

    case AircraftPhase.LINE_UP:
      return CommandType.CLEARED_TAKEOFF

    case AircraftPhase.CLIMBING:
      return CommandType.CONTACT_DEPARTURE

    // ── Arrival ──────────────────────────────────────────────────────────
    case AircraftPhase.INBOUND_UNCONTROLLED:
      // AI Tower acknowledges "with you" call immediately
      return aircraft.pendingPilotCall !== null ? CommandType.STANDBY : null

    case AircraftPhase.APPROACH:
      if (!aircraft.clearedForApproach) return CommandType.CLEARED_APPROACH
      return aircraft.handedOff ? null : CommandType.CONTACT_TOWER

    case AircraftPhase.FINAL:
      // Never clear into a conflict; phase-transitions forces MISSED at threshold
      if (aircraft.inViolation || aircraft.clearedToLand) return null
      // Respect Golden Rule: don't clear to land if runway occupied
      return CommandType.CLEARED_LAND

    // ── Post-landing ─────────────────────────────────────────────────────
    case AircraftPhase.ROLLOUT:
      return aircraft.speed <= 60 && !aircraft.taxiRoute ? CommandType.EXIT_RUNWAY : null

    case AircraftPhase.VACATED:
      // AI Ground issues TAXI TO TERMINAL after pilot calls vacated
      return aircraft.pendingPilotCall !== null ? CommandType.TAXI : null

    default:
      return null
  }
}

/**
 * Station whose AI should act on this aircraft. Rotorcraft sitting at a pad
 * are tower-controlled (liftoff clearance), even though PHASE_CONTROLLER maps
 * AT_GATE to GROUND — without the override an AI-run tower would never touch
 * them and a player-run ground would have no liftoff button to press.
 */
function aiStationFor(aircraft: Aircraft): ControllerStation {
  if (aircraft.type.rotorcraft && aircraft.phase === AircraftPhase.AT_GATE) {
    return ControllerStation.TOWER
  }
  return aircraft.controller
}

/**
 * Precision runway this arrival has to be moved to before it can be cleared,
 * or null when no move is needed.
 *
 * `command-validators.ts` refuses CLEARED_APPROACH to a non-ILS end in IMC at
 * a field that has an ILS somewhere. The arrival's runway comes from wind at
 * spawn, so it can easily be the wrong one — and a rejected command never sets
 * `clearedForApproach`, never touches `lastCommandTime`, and leaves
 * `nextExpectedCommand` returning CLEARED_APPROACH again. Without this the AI
 * re-issues the same refused clearance every tick until the arrival overflies
 * the boundary and is removed. Mirrors the validator's condition exactly.
 */
function ilsRunwayToAssign(aircraft: Aircraft, state: GameState): string | null {
  if (aircraft.type.rotorcraft) return null
  const airport = state.airport
  if (!airport) return null
  if (state.getConditions() !== 'IMC') return null
  if (!airport.runways.some(r => r.ils?.available)) return null

  const assignedIsPrecision = airport.runways.some(
    r => r.id === aircraft.assignedRunway && r.ils?.available,
  )
  if (assignedIsPrecision) return null

  return selectActiveRunway(airport, state.wind, { requireIls: true })?.id ?? null
}

export function runAiControllers(state: GameState, nowMs: number): void {
  if (!state.airport) return

  for (const aircraft of state.allAircraft()) {
    if (state.playerStations.includes(aiStationFor(aircraft))) continue
    if (aircraft.readbackTimer !== null) continue
    if (nowMs - aircraft.lastCommandTime < AI_MIN_DECISION_INTERVAL_MS) continue

    const commandType = nextExpectedCommand(aircraft)
    if (commandType === null) continue

    // For CLEARED_LAND, check Golden Rule before AI issues it
    if (commandType === CommandType.CLEARED_LAND && aircraft.assignedRunway) {
      if (state.runwayOccupied.has(aircraft.assignedRunway)) continue
    }

    // Approach clearance carries the precision runway when IMC demands one,
    // so the clearance validates instead of being refused on repeat.
    const params: Record<string, string> = {}
    if (commandType === CommandType.CLEARED_APPROACH) {
      const runway = ilsRunwayToAssign(aircraft, state)
      if (runway) params.runway = runway
    }

    processCommand({ type: commandType, targetCallsign: aircraft.callsign, params }, state.airport)
  }
}
