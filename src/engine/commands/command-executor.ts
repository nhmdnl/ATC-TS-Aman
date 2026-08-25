import type { Command, Aircraft, Airport } from '../types'
import { CommandType, AircraftPhase, ControllerStation, GameEventType } from '../types'
import { PHASE_CONTROLLER, PUSHING_BACK_DURATION_MS, DEPARTURE_HANDOFF_ALT_FT } from '../constants'
import { headingToRadians } from '../movement'
import { findRunwayById, selectActiveRunway, missedApproachParams, getAvailableGates } from '../airport-loader'
import { buildTaxiRoute, findNearestNodeByRef } from '../taxi-routing'
import { eventBus } from '../event-bus'
import { gameState } from '../game-state'

function changePhase(aircraft: Aircraft, newPhase: AircraftPhase): void {
  const oldPhase = aircraft.phase
  if (oldPhase === newPhase) return
  aircraft.phase = newPhase
  aircraft.controller = PHASE_CONTROLLER[newPhase]
  eventBus.emit(GameEventType.PHASE_CHANGED, { callsign: aircraft.callsign, oldPhase, newPhase })
}

/** Acknowledges any pending pilot call on this aircraft. */
function acknowledgePilotCall(aircraft: Aircraft): void {
  aircraft.pendingPilotCall = null
}

export function executeCommand(command: Command, aircraft: Aircraft, airport: Airport | null = null): void {
  aircraft.lastCommandTime = Date.now()

  // Any command acknowledges a pending pilot call
  acknowledgePilotCall(aircraft)

  switch (command.type) {

    // ── Pushback / Startup ────────────────────────────────────────────────
    case CommandType.PUSHBACK_APPROVED:
    case CommandType.STARTUP_APPROVED: {
      if (command.params.runway) aircraft.assignedRunway = command.params.runway
      // For pushback: heading flips 180° (tug pushes aircraft nose-away from gate)
      // For startup: aircraft is already oriented correctly
      if (command.type === CommandType.PUSHBACK_APPROVED) {
        aircraft.pushbackHeading = (aircraft.heading + 180) % 360
        changePhase(aircraft, AircraftPhase.PUSHING_BACK)
        // Reuse pushbackCallAt as the end-of-pushback time
        aircraft.pushbackCallAt = Date.now() + PUSHING_BACK_DURATION_MS
      } else {
        changePhase(aircraft, AircraftPhase.READY_TO_TAXI)
      }
      break
    }

    // ── STANDBY: acknowledge call without other action ─────────────────────
    case CommandType.STANDBY:
      // acknowledgePilotCall already called above; nothing else to do
      break

    // ── CROSS_RUNWAY: resume taxi across a runway ─────────────────────────
    case CommandType.CROSS_RUNWAY:
      aircraft.awaitingCrossingRunway = null
      if (aircraft.speed === 0) aircraft.speed = 2
      break

    // ── CONTINUE_TAXI: release any hold ───────────────────────────────────
    case CommandType.CONTINUE_TAXI:
      aircraft.awaitingCrossingRunway = null
      if (aircraft.speed === 0) aircraft.speed = 2
      break

    // ── VECTOR ────────────────────────────────────────────────────────────
    case CommandType.VECTOR:
      aircraft.clearedHeading = command.params.heading ?? aircraft.heading
      aircraft.clearedForApproach = false
      break

    // ── ALTITUDE (departures only, validated upstream) ────────────────────
    case CommandType.ALTITUDE:
      aircraft.clearedAltitude = command.params.altitude ?? aircraft.altitude
      break

    // ── SPEED (departures only, validated upstream) ───────────────────────
    case CommandType.SPEED:
      aircraft.clearedSpeed = command.params.speed ?? aircraft.speed
      break

    case CommandType.SQUAWK:
      aircraft.squawk = command.params.squawk ?? aircraft.squawk
      break

    case CommandType.CLEARED_APPROACH:
      aircraft.clearedForApproach = true
      if (!aircraft.assignedRunway && airport) {
        aircraft.assignedRunway = selectActiveRunway(airport, gameState.wind)?.id ?? null
      }
      break

    case CommandType.CLEARED_LAND:
      aircraft.clearedToLand = true
      aircraft.urgent = false
      break

    case CommandType.TAXI: {
      if (command.params.runway) aircraft.assignedRunway = command.params.runway
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
      if (aircraft.phase === AircraftPhase.READY_TO_TAXI) {
        changePhase(aircraft, AircraftPhase.TAXI_OUT)
      } else if (aircraft.phase === AircraftPhase.VACATED && airport && aircraft.assignedGate) {
        // Taxi-in: route to assigned gate
        const route = gameState.taxiwayGraph
          ? buildTaxiRoute(airport, gameState.taxiwayGraph, aircraft.x, aircraft.y, {
              kind: 'gate',
              ref: aircraft.assignedGate,
            })
          : null
        if (route) {
          aircraft.taxiRoute = route
          aircraft.taxiRouteIndex = 0
          aircraft.taxiTarget = route[0]
        } else {
          // No graph route: set gate as direct target
          const gate = airport.gates.find(g => g.id === aircraft.assignedGate)
          if (gate) aircraft.taxiTarget = { x: gate.x, y: gate.y }
        }
        changePhase(aircraft, AircraftPhase.TAXI_IN)
      }
      if (aircraft.speed === 0) aircraft.speed = 2
      break
    }

    case CommandType.WIND:
    case CommandType.REPORT:
      // Phraseology-only: logged by command-registry; no state change
      break

    case CommandType.CANCEL_TAXI:
    case CommandType.HOLD_SHORT:
      aircraft.speed = 0
      break

    case CommandType.GO_AROUND:
      aircraft.clearedToLand = false
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
      if (airport && aircraft.assignedRunway) {
        const rwy = findRunwayById(airport, aircraft.assignedRunway)
        if (rwy) {
          const entry = findNearestNodeByRef(airport, 'runway-entry', aircraft.assignedRunway, aircraft.x, aircraft.y)
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
      // Keep any remaining line-up route — moveTakeoffRoll finishes the
      // backtrack to the threshold before rolling (wiping it here meant a
      // clearance mid-line-up started the roll from midfield)
      aircraft.departureHandoffAlt = DEPARTURE_HANDOFF_ALT_FT
      // Mark runway occupied for the takeoff roll
      if (aircraft.assignedRunway) gameState.runwayOccupied.add(aircraft.assignedRunway)
      break

    case CommandType.EXIT_RUNWAY: {
      if (aircraft.phase === AircraftPhase.ROLLOUT || aircraft.phase === AircraftPhase.LANDING) {
        if (!aircraft.assignedGate && airport && airport.gates.length > 0) {
          const free = getAvailableGates(airport, gameState.occupiedGateIds)
          aircraft.assignedGate = (free[0] ?? airport.gates[0]).id
          gameState.occupiedGateIds.add(aircraft.assignedGate)
        }
        if (airport && aircraft.assignedRunway) {
          const route = gameState.taxiwayGraph && aircraft.assignedGate
            ? buildTaxiRoute(airport, gameState.taxiwayGraph, aircraft.x, aircraft.y, {
                kind: 'gate',
                ref: aircraft.assignedGate,
              })
            : null
          if (route) {
            aircraft.taxiRoute = route
            aircraft.taxiRouteIndex = 0
            aircraft.taxiTarget = route[0]
          } else {
            const entry = findNearestNodeByRef(airport, 'runway-entry', aircraft.assignedRunway, aircraft.x, aircraft.y)
            if (entry) {
              aircraft.taxiRoute = [{ x: entry.x, y: entry.y }]
              aircraft.taxiRouteIndex = 0
              aircraft.taxiTarget = aircraft.taxiRoute[0]
            }
          }
        }
      }
      break
    }
  }
}
