import type { Aircraft, RunwayData, Airport } from './types'
import { AircraftPhase, GameEventType } from './types'
import {
  APPROACH_TRIGGER_NM,
  FINAL_DISTANCE_NM,
  THRESHOLD_DISTANCE_M,
  HOLD_SHORT_DISTANCE_NM,
  PHASE_CONTROLLER,
  METERS_PER_NM
} from './constants'
import { distanceNM, headingToRadians } from './movement'
import { eventBus } from './event-bus'
import { gameState } from './game-state'
import { getAvailableGates, missedApproachParams } from './airport-loader'
import { buildTaxiRoute } from './taxi-routing'

/**
 * Process automatic phase transitions based on distance, altitude, and speed.
 * @returns true if a transition occurred
 */
export function processPhaseTransitions(aircraft: Aircraft, runway: RunwayData | null, airport: Airport): boolean {
  const oldPhase = aircraft.phase

  switch (aircraft.phase) {
    // ── DEPARTURES ──

    case AircraftPhase.TAXI_OUT:
      if (aircraft.taxiRoute && aircraft.taxiRoute.length > 0) {
        // Routed taxi: movement stops exactly on the route's final point (the
        // hold-short node), so only transition once that point is being
        // tracked and reached — a loose radius from any earlier waypoint
        // parks the aircraft mid-taxiway, short of the hold-short line
        const end = aircraft.taxiRoute[aircraft.taxiRoute.length - 1]
        if (aircraft.taxiRouteIndex >= aircraft.taxiRoute.length - 1 &&
            distanceNM(aircraft.x, aircraft.y, end.x, end.y) < 0.02) {
          aircraft.phase = AircraftPhase.HOLD_SHORT
          aircraft.speed = 0 // Stop at hold short
        }
      } else if (runway) {
        // Find hold short point (approx 0.05 NM before threshold along centerline)
        const rad = headingToRadians(runway.trueHeading)
        const hsX = runway.thresholdX - Math.cos(rad) * 0.05
        const hsY = runway.thresholdY - Math.sin(rad) * 0.05

        if (distanceNM(aircraft.x, aircraft.y, hsX, hsY) < HOLD_SHORT_DISTANCE_NM) {
          aircraft.phase = AircraftPhase.HOLD_SHORT
          aircraft.speed = 0 // Stop at hold short
        }
      }
      break

    case AircraftPhase.TAKEOFF_ROLL:
      if (aircraft.speed >= aircraft.type.rotationSpeed) {
        aircraft.phase = AircraftPhase.CLIMBING
        eventBus.emit(GameEventType.TAKEOFF, { callsign: aircraft.callsign })
      }
      break

    // ── ARRIVALS ──

    case AircraftPhase.ENTERING:
      if (distanceNM(aircraft.x, aircraft.y, 0, 0) < APPROACH_TRIGGER_NM) {
        aircraft.phase = AircraftPhase.APPROACH
      }
      break

    case AircraftPhase.APPROACH:
      if (runway && distanceNM(aircraft.x, aircraft.y, runway.thresholdX, runway.thresholdY) < FINAL_DISTANCE_NM) {
        aircraft.phase = AircraftPhase.FINAL
        // PRD §11: Urgent flag set on FINAL aircraft not cleared to land
        if (!aircraft.clearedToLand) {
          aircraft.urgent = true
        }
      }
      break

    case AircraftPhase.FINAL:
      if (runway) {
        const distThreshNM = THRESHOLD_DISTANCE_M / METERS_PER_NM
        if (distanceNM(aircraft.x, aircraft.y, runway.thresholdX, runway.thresholdY) < distThreshNM) {
          if (aircraft.clearedToLand) {
            aircraft.phase = AircraftPhase.LANDING
            aircraft.urgent = false
          } else {
            // Not cleared to land -> Go around
            aircraft.phase = AircraftPhase.MISSED
            aircraft.urgent = false
            
            // Published missed approach from the airport file (generic
            // straight-ahead climb when the runway has no ops data)
            const missed = missedApproachParams(runway)
            aircraft.missedHeading = missed.heading
            aircraft.missedAltitude = missed.altitude
            
            eventBus.emit(GameEventType.MISSED_APPROACH, { callsign: aircraft.callsign })
          }
        }
      }
      break

    case AircraftPhase.LANDING:
      if (aircraft.altitude <= (runway?.elevationFt ?? 0) + 5 && aircraft.speed <= 80) {
        aircraft.phase = AircraftPhase.ROLLOUT
        eventBus.emit(GameEventType.LANDING, { callsign: aircraft.callsign })
      }
      break

    case AircraftPhase.ROLLOUT:
      if (aircraft.speed <= 5) {
        aircraft.phase = AircraftPhase.TAXI_IN
        // Pick a free gate if none assigned, and mark it occupied so a
        // departure can't spawn into it (removeAircraft frees it again)
        // ponytail: all gates occupied → double-park at gate 1; holding/queueing if it matters
        if (!aircraft.assignedGate && airport.gates.length > 0) {
          const free = getAvailableGates(airport, gameState.occupiedGateIds)
          aircraft.assignedGate = (free[0] ?? airport.gates[0]).id
          gameState.occupiedGateIds.add(aircraft.assignedGate)
        }
        // Route to the gate along the taxiway graph when available; the gate
        // position itself is appended so the aircraft leaves the graph at the
        // gate node and parks on the stand. Fallback: straight-line taxi.
        const gate = airport.gates.find(g => g.id === aircraft.assignedGate)
        if (gate) {
          const route = gameState.taxiwayGraph
            ? buildTaxiRoute(airport, gameState.taxiwayGraph, aircraft.x, aircraft.y, { kind: 'gate', ref: gate.id })
            : null
          if (route) {
            route.push({ x: gate.x, y: gate.y })
            aircraft.taxiRoute = route
            aircraft.taxiRouteIndex = 0
            aircraft.taxiTarget = route[0]
          } else {
            aircraft.taxiRoute = null
            aircraft.taxiTarget = { x: gate.x, y: gate.y }
          }
        }
      }
      break

    case AircraftPhase.TAXI_IN:
      if (aircraft.assignedGate) {
        const gate = airport.gates.find(g => g.id === aircraft.assignedGate)
        if (gate && distanceNM(aircraft.x, aircraft.y, gate.x, gate.y) < 0.02) {
          aircraft.phase = AircraftPhase.ARRIVED
          aircraft.speed = 0
          eventBus.emit(GameEventType.ARRIVED_GATE, { callsign: aircraft.callsign })
        }
      } else {
        // Fallback: arrived after 30 sec taxi if no gate
        if (Date.now() - aircraft.spawnTime > 30000) {
           aircraft.phase = AircraftPhase.ARRIVED
           aircraft.speed = 0
           eventBus.emit(GameEventType.ARRIVED_GATE, { callsign: aircraft.callsign })
        }
      }
      break
  }

  if (oldPhase !== aircraft.phase) {
    aircraft.controller = PHASE_CONTROLLER[aircraft.phase]
    eventBus.emit(GameEventType.PHASE_CHANGED, { 
      callsign: aircraft.callsign, 
      oldPhase, 
      newPhase: aircraft.phase 
    })
    return true
  }

  return false
}

/**
 * Determine if an aircraft has completed its lifecycle and should be removed.
 */
export function checkAircraftRemoval(aircraft: Aircraft): boolean {
  if (aircraft.phase === AircraftPhase.ARRIVED) {
    return true
  }
  
  if (aircraft.phase === AircraftPhase.DEPARTED) {
    return distanceNM(aircraft.x, aircraft.y, 0, 0) > 25
  }

  if (aircraft.phase === AircraftPhase.MISSED) {
    return distanceNM(aircraft.x, aircraft.y, 0, 0) > 25
  }

  return false
}
