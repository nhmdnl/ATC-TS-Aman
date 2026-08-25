import type { Command, Aircraft, Airport } from '../types'
import { CommandType, AircraftPhase } from '../types'
import { PHASE_COMMANDS } from '../constants'
import { gameState } from '../game-state'

/**
 * Ground-movement commands rotorcraft can never receive (T-014): they lift
 * off and land vertically on their pad and skip the entire taxi ecosystem.
 */
const ROTOR_REJECTED_COMMANDS: ReadonlySet<CommandType> = new Set([
  CommandType.PUSHBACK_APPROVED,
  CommandType.STARTUP_APPROVED,
  CommandType.TAXI,
  CommandType.HOLD_SHORT,
  CommandType.CANCEL_TAXI,
  CommandType.CROSS_RUNWAY,
  CommandType.CONTINUE_TAXI,
  CommandType.LINE_UP_WAIT,
  CommandType.EXIT_RUNWAY,
])

export function validateCommand(command: Command, aircraft: Aircraft, airport: Airport): string | null {
  // 1. INBOUND_UNCONTROLLED: only STANDBY allowed (pilot not yet on frequency)
  if (aircraft.phase === AircraftPhase.INBOUND_UNCONTROLLED && command.type !== CommandType.STANDBY) {
    return `${aircraft.callsign} not yet on your frequency — acknowledge initial contact first`
  }

  // 2. Phase-allowed command check
  const allowedCommands = PHASE_COMMANDS[aircraft.phase as keyof typeof PHASE_COMMANDS] ?? []
  if (!allowedCommands.includes(command.type)) {
    // Rotorcraft exception: they liftoff straight from the pad (no pushback/
    // taxi/line-up chain), so CLEARED_TAKEOFF is valid at AT_GATE
    const rotorLiftoff = aircraft.type.rotorcraft &&
      aircraft.phase === AircraftPhase.AT_GATE &&
      command.type === CommandType.CLEARED_TAKEOFF
    if (!rotorLiftoff) {
      return `${command.type} not allowed in phase ${aircraft.phase}`
    }
  }

  // 2b. Rotorcraft reject all ground-movement clearances
  if (aircraft.type.rotorcraft && ROTOR_REJECTED_COMMANDS.has(command.type)) {
    return `${aircraft.callsign} is a rotorcraft — no ground movement clearances required`
  }

  // 3. Parameter & logic checks
  switch (command.type) {
    case CommandType.PUSHBACK_APPROVED:
    case CommandType.STARTUP_APPROVED:
      // No extra params required — runway already assigned at spawn
      break

    case CommandType.CROSS_RUNWAY:
      if (!aircraft.awaitingCrossingRunway) return 'Aircraft is not holding short of a runway'
      break

    case CommandType.VECTOR:
      if (command.params.heading === undefined) return 'Missing heading for VECTOR'
      if (command.params.heading < 0 || command.params.heading > 360) return 'Invalid heading'
      break

    case CommandType.ALTITUDE:
      if (command.params.altitude === undefined) return 'Missing altitude'
      if (command.params.altitude < 0) return 'Invalid altitude'
      // T-018: ALTITUDE only valid for departures (arrivals auto-manage altitude)
      if (aircraft.flightType === 'arrival') return 'Cannot assign altitude to an arriving aircraft — approach profile is automatic'
      break

    case CommandType.SPEED:
      if (command.params.speed === undefined) return 'Missing speed'
      if (command.params.speed < 0) return 'Invalid speed'
      // T-018: SPEED only valid for departures
      if (aircraft.flightType === 'arrival') return 'Cannot assign speed to an arriving aircraft — approach speed is automatic'
      break

    case CommandType.SQUAWK:
      if (!command.params.squawk) return 'Missing squawk code'
      if (!/^[0-7]{4}$/.test(command.params.squawk)) return 'Invalid squawk code'
      break

    case CommandType.LINE_UP_WAIT:
    case CommandType.CLEARED_TAKEOFF:
    case CommandType.CLEARED_LAND:
    case CommandType.CLEARED_APPROACH: {
      const rwyId = aircraft.assignedRunway
      if (airport && rwyId) {
        const rwy = airport.runways.find(r => r.id === rwyId)
        if (rwy) {
          const lengthFt = rwy.length * 3.28084
          const minFt = aircraft.type.minRunwayLengthFt ?? 5000
          if (lengthFt < minFt) {
            return `Runway ${rwyId} (${Math.round(lengthFt)} ft) is too short for ${aircraft.type.name} (requires ${minFt} ft)`
          }
        }
      }

      if (command.type === CommandType.CLEARED_APPROACH && !aircraft.type.rotorcraft) {
        // Rotorcraft fly visual approaches onto their assigned pad (T-014) —
        // they have no runway, so an ILS requirement would make them
        // un-clearable in every IMC session
        if (airport && gameState.getConditions() === 'IMC') {
          const hasIls = airport.runways.some(r => r.id === aircraft.assignedRunway && r.ils?.available)
          if (!hasIls) return 'IMC conditions — ILS not available on this runway'
        }
      } else if (command.type === CommandType.CLEARED_LAND) {
        if (rwyId && gameState.runwayOccupied.has(rwyId)) {
          return `Runway ${rwyId} is occupied — clear the runway before issuing landing clearance`
        }
      }
      break
    }
  }

  return null
}
