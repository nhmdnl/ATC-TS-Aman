import type { Command, Aircraft, Airport } from '../types'
import { CommandType, AircraftPhase, ControllerStation, GameEventType } from '../types'
import { PHASE_CONTROLLER } from '../constants'
import { headingToRadians } from '../movement'
import { findRunwayById } from '../airport-loader'
import { eventBus } from '../event-bus'

/** Command-driven phase change: keeps controller in sync (same contract as phase-transitions). */
function changePhase(aircraft: Aircraft, newPhase: AircraftPhase): void {
  const oldPhase = aircraft.phase
  if (oldPhase === newPhase) return
  aircraft.phase = newPhase
  aircraft.controller = PHASE_CONTROLLER[newPhase]
  eventBus.emit(GameEventType.PHASE_CHANGED, {
    callsign: aircraft.callsign,
    oldPhase,
    newPhase,
  })
}

/**
 * Applies the effects of a command to an aircraft's state.
 * This is called *after* validation and *after* the readback delay.
 */
export function executeCommand(command: Command, aircraft: Aircraft, airport: Airport | null = null): void {
  // Update last command time
  aircraft.lastCommandTime = Date.now()

  switch (command.type) {
    case CommandType.VECTOR:
      aircraft.clearedHeading = command.params.heading ?? aircraft.heading
      // Vectoring cancels approach clearance
      aircraft.clearedForApproach = false
      break

    case CommandType.ALTITUDE:
      aircraft.clearedAltitude = command.params.altitude ?? aircraft.altitude
      break

    case CommandType.SPEED:
      aircraft.clearedSpeed = command.params.speed ?? aircraft.speed
      break

    case CommandType.SQUAWK:
      aircraft.squawk = command.params.squawk ?? aircraft.squawk
      break

    case CommandType.CLEARED_APPROACH:
      aircraft.clearedForApproach = true
      // ponytail: always picks first runway — active runway logic when wind-based
      // runway selection is needed
      if (!aircraft.assignedRunway && airport && airport.runways.length > 0) {
        aircraft.assignedRunway = airport.runways[0].id
      }
      break

    case CommandType.CLEARED_LAND:
      aircraft.clearedToLand = true
      aircraft.urgent = false
      break

    case CommandType.TAXI: {
      if (command.params.runway) {
        aircraft.assignedRunway = command.params.runway
      }
      // Drive toward the hold-short point; the TAXI_OUT → HOLD_SHORT phase
      // transition stops the aircraft there (same 0.05 NM offset as
      // phase-transitions' hold-short check).
      if (airport && aircraft.assignedRunway) {
        const rwy = findRunwayById(airport, aircraft.assignedRunway)
        if (rwy) {
          const rad = headingToRadians(rwy.trueHeading)
          aircraft.taxiTarget = {
            x: rwy.thresholdX - Math.cos(rad) * 0.05,
            y: rwy.thresholdY - Math.sin(rad) * 0.05,
          }
        }
      }
      if (aircraft.phase === AircraftPhase.PARKED) {
        changePhase(aircraft, AircraftPhase.TAXI_OUT)
      }
      // Set moving if not moving
      if (aircraft.speed === 0) {
        aircraft.speed = 2 // Give a little kick
      }
      break
    }

    case CommandType.CANCEL_TAXI:
    case CommandType.HOLD_SHORT:
      aircraft.speed = 0
      break

    case CommandType.GO_AROUND:
      aircraft.clearedToLand = false
      // Commanded go-around from short final / the flare: break off now rather
      // than waiting for the threshold check in phase-transitions.
      if (aircraft.phase === AircraftPhase.FINAL || aircraft.phase === AircraftPhase.LANDING) {
        // ponytail: hardcoded HHAS missed approach — load from airport data when multi-airport support added
        aircraft.missedHeading = 170
        aircraft.missedAltitude = 11500
        aircraft.urgent = false
        changePhase(aircraft, AircraftPhase.MISSED)
      }
      break

    case CommandType.CONTACT_DEPARTURE:
      aircraft.handedOff = true
      // Off to center — aircraft leaves the player's control and is removed
      // once clear of the sector (checkAircraftRemoval).
      changePhase(aircraft, AircraftPhase.DEPARTED)
      break

    case CommandType.CONTACT_TOWER:
      aircraft.handedOff = true
      aircraft.controller = ControllerStation.TOWER
      break

    case CommandType.CONTACT_GROUND:
      aircraft.handedOff = true
      aircraft.controller = ControllerStation.GROUND
      break

    case CommandType.LINE_UP_WAIT:
      changePhase(aircraft, AircraftPhase.LINE_UP)
      break

    case CommandType.CLEARED_TAKEOFF:
      changePhase(aircraft, AircraftPhase.TAKEOFF_ROLL)
      break

    case CommandType.EXIT_RUNWAY:
      // ROLLOUT → TAXI_IN is speed-driven in phase-transitions; nothing to force here
      break
  }
}
