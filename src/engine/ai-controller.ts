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
 * own (ENTERING auto-transitions to APPROACH at 8 NM; TAXI_OUT, TAKEOFF_ROLL,
 * LANDING, ROLLOUT likewise; TAXI_IN is already under GROUND via
 * PHASE_CONTROLLER and taxis to its gate unaided), a terminal phase
 * (DEPARTED, ARRIVED, MISSED), or the phase's one command has already been
 * issued and satisfied (guards below — without them the AI would re-issue
 * idempotent commands every AI_MIN_DECISION_INTERVAL_MS forever, spamming
 * the radio log and per-command scoring).
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
      if (!aircraft.clearedForApproach) return CommandType.CLEARED_APPROACH
      // handedOff flips true when CONTACT_TOWER executes and never resets,
      // so it gates "tower handoff already done" for the rest of APPROACH.
      return aircraft.handedOff ? null : CommandType.CONTACT_TOWER
    case AircraftPhase.FINAL:
      // The one safety-aware branch: never clear a landing into an active
      // conflict. Retried on a later tick once the violation clears; if it
      // persists to the threshold, phase-transitions forces MISSED anyway.
      if (aircraft.inViolation || aircraft.clearedToLand) return null
      return CommandType.CLEARED_LAND
    // TAXI_IN: nothing to issue. The ROLLOUT→TAXI_IN transition already set
    // controller = GROUND (PHASE_CONTROLLER) and aimed the taxi at the gate,
    // so CONTACT_GROUND would be a pure no-op radio call here.
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
