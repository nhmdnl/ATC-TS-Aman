import type { Aircraft, RunwayData, Airport, PilotCall } from './types'
import { AircraftPhase, GameEventType, PilotCallType } from './types'
import {
  APPROACH_TRIGGER_NM,
  FINAL_DISTANCE_NM,
  THRESHOLD_DISTANCE_M,
  HOLD_SHORT_DISTANCE_NM,
  PHASE_CONTROLLER,
  METERS_PER_NM,
  REMOVAL_RADIUS_NM,
  PUSHING_BACK_DURATION_MS,
  WITH_YOU_CALL_NM,
  INBOUND_TRIGGER_NM,
  PILOT_CALL_REPEAT_MS,
} from './constants'
import { distanceNM, headingToRadians } from './movement'
import { eventBus } from './event-bus'
import { gameState } from './game-state'
import { getAvailableGates, missedApproachParams } from './airport-loader'

// ─── Pilot call helpers ───────────────────────────────────────────────────────

function firePilotCall(aircraft: Aircraft, type: PilotCallType, message: string): void {
  const now = Date.now()
  aircraft.pendingPilotCall = {
    type,
    message,
    timestamp: now,
    nextRepeatAt: now + PILOT_CALL_REPEAT_MS,
  } satisfies PilotCall
  eventBus.emit(GameEventType.PILOT_CALL, { callsign: aircraft.callsign, callType: type, message })
}

function pilotCallMessage(aircraft: Aircraft, type: PilotCallType, airport: Airport): string {
  const airportName = airport.metadata.name
  switch (type) {
    case PilotCallType.REQUEST_PUSHBACK:
      return `${airportName} Ground, ${aircraft.callsign}, at gate ${aircraft.assignedGate ?? 'ramp'}, request pushback, expecting runway ${aircraft.assignedRunway ?? 'active'}`
    case PilotCallType.REQUEST_STARTUP:
      return `${airportName} Ground, ${aircraft.callsign}, request startup, expecting runway ${aircraft.assignedRunway ?? 'active'}`
    case PilotCallType.WITH_YOU_FINAL:
      return `${airportName} Tower, ${aircraft.callsign}, with you on final, runway ${aircraft.assignedRunway ?? 'active'}`
    case PilotCallType.REQUEST_CROSSING:
      return `${airportName} Ground, ${aircraft.callsign}, holding short runway ${aircraft.awaitingCrossingRunway ?? ''}, request crossing`
    case PilotCallType.VACATED_REQUEST_TAXI:
      return `${airportName} Ground, ${aircraft.callsign}, runway ${aircraft.assignedRunway ?? ''} vacated, request taxi to terminal`
  }
}

// ─── Phase transition engine ──────────────────────────────────────────────────

export function processPhaseTransitions(
  aircraft: Aircraft,
  runway: RunwayData | null,
  airport: Airport,
): boolean {
  const oldPhase = aircraft.phase

  switch (aircraft.phase) {

    // ── AT_GATE: waiting to call for pushback ──────────────────────────────
    case AircraftPhase.AT_GATE:
      if (aircraft.pushbackCallAt !== null && Date.now() >= aircraft.pushbackCallAt) {
        aircraft.phase = AircraftPhase.AWAITING_PUSHBACK
        firePilotCall(aircraft, PilotCallType.REQUEST_PUSHBACK, pilotCallMessage(aircraft, PilotCallType.REQUEST_PUSHBACK, airport))
      }
      break

    // ── PUSHING_BACK: tug moving, transition when time elapsed ────────────
    case AircraftPhase.PUSHING_BACK:
      if (aircraft.pushbackCallAt !== null && Date.now() >= aircraft.pushbackCallAt) {
        // pushbackCallAt is repurposed here as the end-of-pushback timestamp
        aircraft.phase = AircraftPhase.READY_TO_TAXI
        aircraft.pushbackCallAt = null
      }
      break

    // ── TAXI_OUT: moving toward runway ────────────────────────────────────
    case AircraftPhase.TAXI_OUT:
      // Crossing clearance: if aircraft stopped at a crossing node mid-taxi,
      // it will have awaitingCrossingRunway set; movement handles the block
      if (aircraft.taxiRoute && aircraft.taxiRoute.length > 0) {
        const end = aircraft.taxiRoute[aircraft.taxiRoute.length - 1]
        if (aircraft.taxiRouteIndex >= aircraft.taxiRoute.length - 1 &&
            distanceNM(aircraft.x, aircraft.y, end.x, end.y) < 0.02) {
          aircraft.phase = AircraftPhase.HOLD_SHORT
          aircraft.speed = 0
        }
      } else if (runway) {
        const rad = headingToRadians(runway.trueHeading)
        const hsX = runway.thresholdX - Math.cos(rad) * 0.05
        const hsY = runway.thresholdY - Math.sin(rad) * 0.05
        if (distanceNM(aircraft.x, aircraft.y, hsX, hsY) < HOLD_SHORT_DISTANCE_NM) {
          aircraft.phase = AircraftPhase.HOLD_SHORT
          aircraft.speed = 0
        }
      }
      break

    // ── TAKEOFF_ROLL: rotate when speed reached ───────────────────────────
    case AircraftPhase.TAKEOFF_ROLL:
      if (aircraft.speed >= aircraft.type.rotationSpeed) {
        aircraft.phase = AircraftPhase.CLIMBING
        // Mark runway free once airborne
        if (aircraft.assignedRunway) gameState.runwayOccupied.delete(aircraft.assignedRunway)
        eventBus.emit(GameEventType.TAKEOFF, { callsign: aircraft.callsign })
      }
      break

    // ── ENTERING: transitions to INBOUND_UNCONTROLLED ────────────────────
    case AircraftPhase.ENTERING:
      if (distanceNM(aircraft.x, aircraft.y, 0, 0) < INBOUND_TRIGGER_NM) {
        aircraft.phase = AircraftPhase.INBOUND_UNCONTROLLED
      }
      break

    // ── INBOUND_UNCONTROLLED: fires "with you" call near threshold ────────
    case AircraftPhase.INBOUND_UNCONTROLLED:
      if (runway && !aircraft.withYouCallFired &&
          distanceNM(aircraft.x, aircraft.y, runway.thresholdX, runway.thresholdY) < WITH_YOU_CALL_NM) {
        aircraft.withYouCallFired = true
        firePilotCall(aircraft, PilotCallType.WITH_YOU_FINAL, pilotCallMessage(aircraft, PilotCallType.WITH_YOU_FINAL, airport))
      }
      // Transition to APPROACH once pilot call is acknowledged (cleared by command processing)
      if (aircraft.pendingPilotCall === null && aircraft.withYouCallFired) {
        aircraft.phase = AircraftPhase.APPROACH
      }
      break

    // ── APPROACH: cleared for approach gates FINAL ────────────────────────
    case AircraftPhase.APPROACH:
      if (runway && aircraft.clearedForApproach &&
          distanceNM(aircraft.x, aircraft.y, runway.thresholdX, runway.thresholdY) < FINAL_DISTANCE_NM) {
        aircraft.phase = AircraftPhase.FINAL
        if (!aircraft.clearedToLand) aircraft.urgent = true
      }
      break

    // ── FINAL: land or go around ──────────────────────────────────────────
    case AircraftPhase.FINAL:
      if (runway) {
        const distThreshNM = THRESHOLD_DISTANCE_M / METERS_PER_NM
        if (distanceNM(aircraft.x, aircraft.y, runway.thresholdX, runway.thresholdY) < distThreshNM) {
          const runwayHot = aircraft.assignedRunway
            ? gameState.runwayOccupied.has(aircraft.assignedRunway)
            : false
          const wasCleared = aircraft.clearedToLand
          if (wasCleared && !runwayHot) {
            aircraft.phase = AircraftPhase.LANDING
            aircraft.urgent = false
            if (aircraft.assignedRunway) gameState.runwayOccupied.add(aircraft.assignedRunway)
          } else {
            // No clearance OR runway became occupied after clearance → auto go-around
            aircraft.phase = AircraftPhase.MISSED
            aircraft.clearedToLand = false
            aircraft.urgent = false
            const missed = missedApproachParams(runway)
            aircraft.missedHeading = missed.heading
            aircraft.missedAltitude = missed.altitude
            const reason = wasCleared && runwayHot ? 'runway_occupied' : undefined
            eventBus.emit(GameEventType.MISSED_APPROACH, { callsign: aircraft.callsign, reason })
          }
        }
      }
      break

    // ── LANDING: touch down ───────────────────────────────────────────────
    case AircraftPhase.LANDING:
      if (aircraft.altitude <= (runway?.elevationFt ?? 0) + 5 && aircraft.speed <= 80) {
        aircraft.phase = AircraftPhase.ROLLOUT
        eventBus.emit(GameEventType.LANDING, { callsign: aircraft.callsign })
      }
      break

    // ── ROLLOUT: decelerate; transition to VACATED once clear ───────────
    case AircraftPhase.ROLLOUT:
      if (aircraft.speed <= 5) {
        if (aircraft.assignedRunway) gameState.runwayOccupied.delete(aircraft.assignedRunway)
        // Assign a free gate now so the taxi-in route can be built
        if (!aircraft.assignedGate && airport.gates.length > 0) {
          const free = getAvailableGates(airport, gameState.occupiedGateIds)
          aircraft.assignedGate = (free[0] ?? airport.gates[0]).id
          gameState.occupiedGateIds.add(aircraft.assignedGate)
        }
        aircraft.speed = 0
        aircraft.phase = AircraftPhase.VACATED
        firePilotCall(aircraft, PilotCallType.VACATED_REQUEST_TAXI,
          pilotCallMessage(aircraft, PilotCallType.VACATED_REQUEST_TAXI, airport))
      }
      break

    // ── VACATED: waiting for TAXI TO TERMINAL instruction ────────────────
    case AircraftPhase.VACATED:
      // Transitions handled by TAXI command in command-executor.ts
      break

    // ── TAXI_IN: routing to gate ──────────────────────────────────────────
    case AircraftPhase.TAXI_IN:
      if (aircraft.assignedGate) {
        const gate = airport.gates.find(g => g.id === aircraft.assignedGate)
        if (gate && distanceNM(aircraft.x, aircraft.y, gate.x, gate.y) < 0.02) {
          aircraft.phase = AircraftPhase.ARRIVED
          aircraft.speed = 0
          aircraft.x = gate.x
          aircraft.y = gate.y
          eventBus.emit(GameEventType.ARRIVED_GATE, { callsign: aircraft.callsign })
        }
      }
      break
  }

  if (oldPhase !== aircraft.phase) {
    aircraft.controller = PHASE_CONTROLLER[aircraft.phase]
    eventBus.emit(GameEventType.PHASE_CHANGED, { callsign: aircraft.callsign, oldPhase, newPhase: aircraft.phase })
    return true
  }

  return false
}

// ─── Pilot call repeat check (called each tick) ───────────────────────────────

export function checkPilotCallRepeats(aircraft: Aircraft[], airport: Airport): void {
  const now = Date.now()
  for (const ac of aircraft) {
    const call = ac.pendingPilotCall
    if (call && now >= call.nextRepeatAt) {
      call.nextRepeatAt = now + PILOT_CALL_REPEAT_MS
      // Re-emit the call without resetting the original timestamp
      eventBus.emit(GameEventType.PILOT_CALL, { callsign: ac.callsign, callType: call.type, message: call.message })
    }
  }
}

export function checkAircraftRemoval(aircraft: Aircraft): boolean {
  if (aircraft.phase === AircraftPhase.ARRIVED) return true

  if (aircraft.phase === AircraftPhase.DEPARTED || aircraft.phase === AircraftPhase.MISSED) {
    return distanceNM(aircraft.x, aircraft.y, 0, 0) > REMOVAL_RADIUS_NM
  }

  if (aircraft.flightType === 'arrival' &&
      (aircraft.phase === AircraftPhase.ENTERING || aircraft.phase === AircraftPhase.INBOUND_UNCONTROLLED || aircraft.phase === AircraftPhase.APPROACH)) {
    return distanceNM(aircraft.x, aircraft.y, 0, 0) > REMOVAL_RADIUS_NM
  }

  return false
}
