import type { Command, Aircraft, Airport } from '../types'
import { CommandType, ControllerStation } from '../types'
import { PHASE_COMMANDS } from '../constants'

/**
 * Validates a command against the aircraft state and airport data.
 * @returns An error string if invalid, or null if valid.
 */
export function validateCommand(command: Command, aircraft: Aircraft, airport: Airport): string | null {
  // 1. Controller Privilege check
  const allowedCommands = getCommandsForPhase(aircraft.phase)
  if (!allowedCommands.includes(command.type)) {
    return `${command.type} not allowed in phase ${aircraft.phase}`
  }

  // 2. Parameter & Logic checks
  switch (command.type) {
    case CommandType.VECTOR:
      if (command.params.heading === undefined) return 'Missing heading for VECTOR'
      if (command.params.heading < 0 || command.params.heading > 360) return 'Invalid heading'
      break
    
    case CommandType.ALTITUDE:
      if (command.params.altitude === undefined) return 'Missing altitude'
      if (command.params.altitude < 0) return 'Invalid altitude'
      break
      
    case CommandType.SPEED:
      if (command.params.speed === undefined) return 'Missing speed'
      if (command.params.speed < 0) return 'Invalid speed'
      break

    case CommandType.SQUAWK:
      if (!command.params.squawk) return 'Missing squawk code'
      if (!/^[0-7]{4}$/.test(command.params.squawk)) return 'Invalid squawk code'
      break

    case CommandType.CLEARED_APPROACH:
      // Must have vector to intercept or be established
      break

    case CommandType.CLEARED_LAND:
    case CommandType.CLEARED_TAKEOFF:
    case CommandType.LINE_UP_WAIT:
    case CommandType.EXIT_RUNWAY:
      // Typically need to be on or near a runway
      break
  }

  return null
}

function getCommandsForPhase(phase: string): ReadonlyArray<CommandType> {
  return PHASE_COMMANDS[phase as keyof typeof PHASE_COMMANDS] || []
}
