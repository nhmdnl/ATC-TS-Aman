import { describe, it, expect } from 'vitest'
import { loadAirport, selectActiveRunway } from '../airport-loader'
import { moveAircraft, headingToRadians } from '../movement'
import { processPhaseTransitions } from '../phase-transitions'
import { executeCommand } from '../commands/command-executor'
import { gameState } from '../game-state'
import { AircraftPhase, CommandType, ControllerStation, WakeCategory } from '../types'
import type { Aircraft } from '../types'
import hhasData from '../../data/airports/hhas.airport.json'

/**
 * Regression test: an arrival crossing the 12 NM handoff boundary into
 * INBOUND_UNCONTROLLED must KEEP FLYING inbound. The "with you" pilot call
 * only fires within WITH_YOU_CALL_NM (9 NM) of the runway threshold and the
 * APPROACH transition requires that call to be acknowledged — so a stationary
 * INBOUND_UNCONTROLLED phase deadlocks every arrival at ~12 NM forever,
 * which in turn blocks all scheduled spawns on those fixes.
 *
 * Drives real HHAS data + movement + transitions + command executor.
 */

function makeInbound(x: number, y: number, heading: number, altitude: number): Aircraft {
  return {
    id: 'inb-1',
    callsign: 'TST999',
    type: {
      icao: 'B738',
      name: 'Boeing 737-800',
      category: 'M',
      approachCategory: 'C',
      cruiseSpeed: 460,
      approachSpeed: 137,
      rotationSpeed: 145,
      taxiSpeed: 20,
      climbRate: 2500,
      descentRate: 1800,
      serviceCeiling: 41000,
      wakeCategory: WakeCategory.MEDIUM,
    },
    flightType: 'arrival',
    squawk: '2000',
    x,
    y,
    altitude,
    heading,
    speed: 180,
    phase: AircraftPhase.ENTERING,
    controller: ControllerStation.APPROACH,
    clearedHeading: null,
    clearedAltitude: null,
    clearedSpeed: null,
    clearedToLand: false,
    clearedForApproach: false,
    assignedRunway: null,
    assignedTaxiway: null,
    assignedGate: null,
    taxiTarget: null,
    taxiRoute: null,
    taxiRouteIndex: 0,
    spawnTime: 0,
    lastCommandTime: 0,
    readbackTimer: null,
    urgent: false,
    inViolation: false,
    isSelected: false,
    handedOff: false,
    missedHeading: null,
    missedAltitude: null,
    trail: [],
    pushbackCallAt: null,
    pushbackHeading: null,
    departureHandoffAlt: null,
    pendingPilotCall: null,
    withYouCallFired: false,
    awaitingCrossingRunway: null,
  }
}

describe('INBOUND_UNCONTROLLED handoff (regression: arrivals froze at 12 NM)', () => {
  it('keeps flying inbound after the 12 NM boundary until acknowledged', () => {
    const airport = loadAirport(hhasData)
    const rwy = selectActiveRunway(airport, gameState.wind)!

    // 14 NM out on the extended centerline, pointed at the field
    const rad = headingToRadians(rwy.trueHeading)
    const aircraft = makeInbound(
      rwy.thresholdX - Math.cos(rad) * 14,
      rwy.thresholdY - Math.sin(rad) * 14,
      rwy.trueHeading,
      12000
    )

    // Fly until inside the handoff boundary
    let guard = 0
    while (aircraft.phase === AircraftPhase.ENTERING && guard++ < 1800) {
      moveAircraft(aircraft, 1, rwy)
      processPhaseTransitions(aircraft, rwy, airport)
    }
    expect(aircraft.phase).toBe(AircraftPhase.INBOUND_UNCONTROLLED)

    // THE regression: still moving toward the field while uncontrolled
    const distAtBoundary = Math.hypot(aircraft.x, aircraft.y)
    for (let t = 0; t < 60; t++) {
      moveAircraft(aircraft, 1, rwy)
      processPhaseTransitions(aircraft, rwy, airport)
    }
    expect(Math.hypot(aircraft.x, aircraft.y)).toBeLessThan(distAtBoundary - 1)

    // The "with you" call fires near the threshold and pends acknowledgment
    guard = 0
    while (!aircraft.withYouCallFired && guard++ < 1800) {
      moveAircraft(aircraft, 1, rwy)
      processPhaseTransitions(aircraft, rwy, airport)
    }
    expect(aircraft.withYouCallFired).toBe(true)
    expect(aircraft.pendingPilotCall).not.toBeNull()

    // Acknowledging (STANDBY) hands the aircraft over to normal control
    executeCommand({ type: CommandType.STANDBY, targetCallsign: aircraft.callsign, params: {} }, aircraft, airport)
    expect(aircraft.pendingPilotCall).toBeNull()
    processPhaseTransitions(aircraft, rwy, airport)
    expect(aircraft.phase).toBe(AircraftPhase.APPROACH)
  })
})
