import type { Command, Aircraft, Airport } from '../types'
import { CommandType, AircraftPhase } from '../types'
import { PHASE_COMMANDS } from '../constants'
import { gameState } from '../game-state'

export function validateCommand(command: Command, aircraft: Aircraft, airport: Airport): string | null {
  // 1. INBOUND_UNCONTROLLED: only STANDBY allowed (pilot not yet on frequency)
  if (aircraft.phase === AircraftPhase.INBOUND_UNCONTROLLED && command.type !== CommandType.STANDBY) {
    return `${aircraft.callsign} not yet on your frequency — acknowledge initial contact first`
  }

  // 2. Phase-allowed command check
  const allowedCommands = PHASE_COMMANDS[aircraft.phase as keyof typeof PHASE_COMMANDS] ?? []
  if (!allowedCommands.includes(command.type)) {
    return `${command.type} not allowed in phase ${aircraft.phase}`
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

    case CommandType.CLEARED_APPROACH: {
      // In IMC, only ILS approaches are valid — no airport = assume VMC
      if (airport && gameState.getConditions() === 'IMC') {
        const hasIls = airport.runways.some(r => r.id === aircraft.assignedRunway && r.ils?.available)
        if (!hasIls) return 'IMC conditions — ILS not available on this runway'
      }
      break
    }

    case CommandType.CLEARED_LAND: {
      // Golden Rule: reject if the assigned runway is occupied
      const rwy = aircraft.assignedRunway
      if (rwy && gameState.runwayOccupied.has(rwy)) {
        return `Runway ${rwy} is occupied — clear the runway before issuing landing clearance`
      }
      break
    }
  }

  return null
}
