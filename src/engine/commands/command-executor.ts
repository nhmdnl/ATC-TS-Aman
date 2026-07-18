import type { Command, Aircraft, Airport } from '../types'
import { CommandType, AircraftPhase, ControllerStation, GameEventType } from '../types'
import { PHASE_CONTROLLER } from '../constants'
import { headingToRadians } from '../movement'
import { findRunwayById, selectActiveRunway, missedApproachParams } from '../airport-loader'
import { buildTaxiRoute, findNearestNodeByRef } from '../taxi-routing'
import { eventBus } from '../event-bus'
import { gameState } from '../game-state'

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
      // Spawn normally pre-assigns the runway; this covers hand-built aircraft
      if (!aircraft.assignedRunway && airport) {
        aircraft.assignedRunway = selectActiveRunway(airport, gameState.wind)?.id ?? null
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
      // Route along the taxiway graph to the runway's hold-short node when the
      // airport file carries one; otherwise fall back to a straight-line taxi
      // toward the hold-short point (same 0.05 NM offset as phase-transitions'
      // hold-short check).
      if (airport && aircraft.assignedRunway) {
        const route = gameState.taxiwayGraph
          ? buildTaxiRoute(airport, gameState.taxiwayGraph, aircraft.x, aircraft.y, {
              kind: 'hold-short',
              ref: aircraft.assignedRunway,
            })
          : null
        if (route) {
          aircraft.taxiRoute = route
          aircraft.taxiRouteIndex = 0
          aircraft.taxiTarget = route[0]
        } else {
          const rwy = findRunwayById(airport, aircraft.assignedRunway)
          if (rwy) {
            const rad = headingToRadians(rwy.trueHeading)
            aircraft.taxiRoute = null
            aircraft.taxiTarget = {
              x: rwy.thresholdX - Math.cos(rad) * 0.05,
              y: rwy.thresholdY - Math.sin(rad) * 0.05,
            }
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
        const rwy = airport && aircraft.assignedRunway ? findRunwayById(airport, aircraft.assignedRunway) : null
        if (rwy) {
          const missed = missedApproachParams(rwy)
          aircraft.missedHeading = missed.heading
          aircraft.missedAltitude = missed.altitude
        }
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

    case CommandType.LINE_UP_WAIT: {
      changePhase(aircraft, AircraftPhase.LINE_UP)
      // Taxi a real path onto the runway: hold-short bar → the nearest
      // runway-entry node on the drawn centerline → backtrack to the
      // threshold, so the roll always starts on the numbers with full length.
      // Replaces the old aim-nowhere creep that lined up at an offset
      // wherever the taxiway happened to meet the runway (T-009).
      if (airport && aircraft.assignedRunway) {
        const rwy = findRunwayById(airport, aircraft.assignedRunway)
        if (rwy) {
          const entry = findNearestNodeByRef(
            airport, 'runway-entry', aircraft.assignedRunway, aircraft.x, aircraft.y)
          const route = entry ? [{ x: entry.x, y: entry.y }] : []
          route.push({ x: rwy.thresholdX, y: rwy.thresholdY })
          aircraft.taxiRoute = route
          aircraft.taxiRouteIndex = 0
          aircraft.taxiTarget = route[0]
        }
      }
      break
    }

    case CommandType.CLEARED_TAKEOFF:
      changePhase(aircraft, AircraftPhase.TAKEOFF_ROLL)
      // Line-up route is done — nothing should keep steering to it
      aircraft.taxiRoute = null
      aircraft.taxiTarget = null
      break

    case CommandType.EXIT_RUNWAY:
      // ROLLOUT → TAXI_IN is speed-driven in phase-transitions; nothing to force here
      break
  }
}
