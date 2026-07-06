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

/**
 * Process automatic phase transitions based on distance, altitude, and speed.
 * @returns true if a transition occurred
 */
export function processPhaseTransitions(aircraft: Aircraft, runway: RunwayData | null, airport: Airport): boolean {
  const oldPhase = aircraft.phase

  switch (aircraft.phase) {
    // ── DEPARTURES ──

    case AircraftPhase.TAXI_OUT:
      if (runway) {
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
            
            // Default missed approach params from PRD §16
            // ponytail: hardcoded HHAS missed approach — load from airport data when multi-airport support added
            aircraft.missedHeading = 170
            aircraft.missedAltitude = 11500
            
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
        // Pick a gate if none assigned
        if (!aircraft.assignedGate && airport.gates.length > 0) {
           aircraft.assignedGate = airport.gates[0].id
        }
        // Aim the taxi at the gate — moveTaxi goes nowhere without a target
        const gate = airport.gates.find(g => g.id === aircraft.assignedGate)
        if (gate) {
          aircraft.taxiTarget = { x: gate.x, y: gate.y }
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
