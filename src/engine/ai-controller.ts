import type { Aircraft } from './types'
import { AircraftPhase, CommandType } from './types'
import type { GameState } from './game-state'
import { processCommand } from './commands/command-registry'
import { AI_MIN_DECISION_INTERVAL_MS } from './constants'

/**
 * The single, deterministic next command a reliable autopilot controller
 * would issue for this aircraft's current phase — the "textbook" action.
 * Returns null when there is nothing to do this tick: either the phase is
 * mid-transition and movement/phase-transitions will advance it on their
 * own (TAXI_OUT, TAKEOFF_ROLL, LANDING, ROLLOUT), or it's a terminal phase
 * (DEPARTED, ARRIVED, MISSED).
 *
 * Every command returned here is already legal for the phase per
 * PHASE_COMMANDS/CONTROLLER_COMMANDS in constants.ts, so it can never be
 * rejected by validateCommand.
 */
export function nextExpectedCommand(aircraft: Aircraft): CommandType | null {
  switch (aircraft.phase) {
    case AircraftPhase.PARKED:
      return CommandType.TAXI
    case AircraftPhase.HOLD_SHORT:
      return CommandType.LINE_UP_WAIT
    case AircraftPhase.LINE_UP:
      return CommandType.CLEARED_TAKEOFF
    case AircraftPhase.CLIMBING:
      return CommandType.CONTACT_DEPARTURE
    case AircraftPhase.APPROACH:
      return aircraft.clearedForApproach ? CommandType.CONTACT_TOWER : CommandType.CLEARED_APPROACH
    case AircraftPhase.FINAL:
      // The one safety-aware branch: never clear a landing into an active
      // conflict. Retried on a later tick once the violation clears.
      return aircraft.inViolation ? null : CommandType.CLEARED_LAND
    case AircraftPhase.TAXI_IN:
      return CommandType.CONTACT_GROUND
    default:
      return null
  }
}

/**
 * Runs one AI decision pass over every aircraft not on a player-controlled
 * station. Issues at most one command per aircraft per call, through the
 * same processCommand() pipeline the player uses, so AI actions get the
 * same readback delay, phraseology, and radio log entries a human-issued
 * command would.
 */
export function runAiControllers(state: GameState, nowMs: number): void {
  if (!state.airport) return

  for (const aircraft of state.allAircraft()) {
    if (state.playerStations.includes(aircraft.controller)) continue
    if (aircraft.readbackTimer !== null) continue
    if (nowMs - aircraft.lastCommandTime < AI_MIN_DECISION_INTERVAL_MS) continue

    const commandType = nextExpectedCommand(aircraft)
    if (commandType === null) continue

    processCommand({ type: commandType, targetCallsign: aircraft.callsign, params: {} }, state.airport)
  }
}
