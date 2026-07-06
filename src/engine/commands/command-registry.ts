import type { Command, CommandResult, Airport } from '../types'
import { GameEventType, ControllerStation } from '../types'
import { eventBus } from '../event-bus'
import { gameState } from '../game-state'
import { validateCommand } from './command-validators'
import { executeCommand } from './command-executor'
import { generatePhraseology } from './phraseology'
import { READBACK_DELAY_MIN_MS, READBACK_DELAY_MAX_MS, DEFAULT_FREQUENCIES } from '../constants'
import { getFrequency } from '../airport-loader'

/**
 * Validates, executes, and generates phraseology for a command.
 * Queues the actual execution after a simulated readback delay.
 */
export function processCommand(command: Command, airport: Airport): CommandResult {
  const aircraft = gameState.getAircraftByCallsign(command.targetCallsign)
  if (!aircraft) {
    return { success: false, error: 'Aircraft not found' }
  }

  // 1. Validation
  const validationError = validateCommand(command, aircraft, airport)
  if (validationError) {
    eventBus.emit(GameEventType.COMMAND_REJECTED, {
      callsign: aircraft.callsign,
      commandType: command.type,
      reason: validationError
    })
    return { success: false, error: validationError }
  }

  // 2. Phraseology Generation
  // Resolve station name for the controller
  const stationName = getStationName(aircraft.controller, airport)
  const phraseology = generatePhraseology(command, aircraft, airport, stationName)

  // 3. Emit Command Issued Event (immediately)
  eventBus.emit(GameEventType.COMMAND_ISSUED, {
    callsign: aircraft.callsign,
    commandType: command.type,
    phraseology
  })

  // 4. Delayed Execution (Simulate Pilot Readback & Reaction Time)
  const delay = Math.random() * (READBACK_DELAY_MAX_MS - READBACK_DELAY_MIN_MS) + READBACK_DELAY_MIN_MS
  
  // Set the timer on the aircraft so the UI knows it's pending
  aircraft.readbackTimer = delay
  
  // We use setTimeout here because it's a UI-level delay, though in a pure ECS we'd decrement it in tick()
  // Doing it here is simpler since execution is side-effect heavy
  setTimeout(() => {
    // Re-fetch aircraft in case it was removed during delay
    const ac = gameState.getAircraftByCallsign(command.targetCallsign)
    if (ac) {
      ac.readbackTimer = null
      executeCommand(command, ac, airport)
    }
  }, delay)

  return { success: true, phraseology }
}

function getStationName(controller: ControllerStation, airport: Airport): string {
  // First try airport frequencies
  const f = airport.frequencies.find(f => f.name.toUpperCase().includes(controller.toString().toUpperCase()))
  if (f) return f.callsign
  
  // Fallback
  return `Asmara ${controller.toString().charAt(0).toUpperCase() + controller.toString().slice(1).toLowerCase()}`
}
