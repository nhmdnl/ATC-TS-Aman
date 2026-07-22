import { describe, it, expect, beforeEach } from 'vitest'
import { SeparationChecker, clearViolationFlags } from '../separation'
import { AircraftPhase, ControllerStation , WakeCategory } from '../types'
import type { Aircraft } from '../types'
import { AIRBORNE_PHASES } from '../constants'

/** Build a minimal valid Aircraft for testing */
function makeAircraft(id: string, callsign: string, phase: AircraftPhase, x: number, y: number, altitude: number): Aircraft {
  return {
    id,
    callsign,
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
    squawk: '1234',
    x,
    y,
    altitude,
    heading: 0,
    speed: 200,
    phase,
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

describe('SeparationChecker', () => {
  let checker: SeparationChecker

  beforeEach(() => {
    checker = new SeparationChecker()
  })

  it('detects lateral separation violation when two aircraft are within 3 NM and 1000 ft', () => {
    // Both at same altitude, 2 NM apart (< 3 NM)
    // nowMs > SEPARATION_COOLDOWN_MS (5000) because lastViolationTime defaults to 0
    const nowMs = 10000
    const ac1 = makeAircraft('1', 'UAL1', AircraftPhase.APPROACH, 0, 0, 5000)
    const ac2 = makeAircraft('2', 'UAL2', AircraftPhase.APPROACH, 2, 0, 5000)
    const violations = checker.checkSeparation([ac1, ac2], nowMs)
    expect(violations).toHaveLength(1)
    expect(violations[0].callsign1).toBe('UAL1')
    expect(violations[0].callsign2).toBe('UAL2')
    expect(violations[0].lateralNM).toBeLessThan(3)
    expect(violations[0].verticalFt).toBe(0)
  })

  it('does NOT detect violation when aircraft are far enough laterally', () => {
    const ac1 = makeAircraft('1', 'UAL1', AircraftPhase.APPROACH, 0, 0, 5000)
    const ac2 = makeAircraft('2', 'UAL2', AircraftPhase.APPROACH, 10, 0, 5000)
    const violations = checker.checkSeparation([ac1, ac2], 1000)
    expect(violations).toHaveLength(0)
  })

  it('does NOT detect violation when aircraft have sufficient vertical separation', () => {
    const ac1 = makeAircraft('1', 'UAL1', AircraftPhase.APPROACH, 0, 0, 5000)
    const ac2 = makeAircraft('2', 'UAL2', AircraftPhase.APPROACH, 0, 0, 7000)
    // Lateral is 0 (< 3 NM), but vertical is 2000 ft (>= 1000)
    const violations = checker.checkSeparation([ac1, ac2], 1000)
    expect(violations).toHaveLength(0)
  })

  it('detects violation when vertical is exactly at boundary (999 ft diff)', () => {
    const nowMs = 10000
    const ac1 = makeAircraft('1', 'UAL1', AircraftPhase.APPROACH, 0, 0, 5000)
    const ac2 = makeAircraft('2', 'UAL2', AircraftPhase.APPROACH, 0, 0, 5999)
    // diff = 999 ft, less than 1000, lateral = 0 < 3 NM => violation
    const violations = checker.checkSeparation([ac1, ac2], nowMs)
    expect(violations).toHaveLength(1)
  })

  it('does not flag non-airborne aircraft (ground phases)', () => {
    const ac1 = makeAircraft('1', 'UAL1', AircraftPhase.AT_GATE, 0, 0, 0)
    const ac2 = makeAircraft('2', 'UAL2', AircraftPhase.TAXI_OUT, 0, 0, 0)
    // Both are on ground phases, not in AIRBORNE_PHASES
    const violations = checker.checkSeparation([ac1, ac2], 1000)
    expect(violations).toHaveLength(0)
  })

  it('only checks airborne aircraft even when mixed with ground', () => {
    const ac1 = makeAircraft('1', 'UAL1', AircraftPhase.APPROACH, 0, 0, 5000)
    const ac2 = makeAircraft('2', 'UAL2', AircraftPhase.AT_GATE, 0, 0, 0)
    // Only ac1 is airborne, only 1 aircraft to check -> no pairs
    const violations = checker.checkSeparation([ac1, ac2], 1000)
    expect(violations).toHaveLength(0)
  })

  it('sets inViolation flag on both aircraft', () => {
    const ac1 = makeAircraft('1', 'UAL1', AircraftPhase.APPROACH, 0, 0, 5000)
    const ac2 = makeAircraft('2', 'UAL2', AircraftPhase.APPROACH, 1, 0, 5000)
    expect(ac1.inViolation).toBe(false)
    expect(ac2.inViolation).toBe(false)
    checker.checkSeparation([ac1, ac2], 1000)
    expect(ac1.inViolation).toBe(true)
    expect(ac2.inViolation).toBe(true)
  })

  it('respects cooldown and does not re-report same pair', () => {
    const ac1 = makeAircraft('1', 'UAL1', AircraftPhase.APPROACH, 0, 0, 5000)
    const ac2 = makeAircraft('2', 'UAL2', AircraftPhase.APPROACH, 1, 0, 5000)

    // First check at time 10000 -> violation (cooldown threshold is 5000, default lastViolationTime is 0)
    const v1 = checker.checkSeparation([ac1, ac2], 10000)
    expect(v1).toHaveLength(1)

    // Second check at time 11000 (< 5000 cooldown from 10000) -> no new violation
    const v2 = checker.checkSeparation([ac1, ac2], 11000)
    expect(v2).toHaveLength(0)

    // But flags remain true
    expect(ac1.inViolation).toBe(true)
    expect(ac2.inViolation).toBe(true)
  })

  it('re-reports after cooldown expires', () => {
    const ac1 = makeAircraft('1', 'UAL1', AircraftPhase.APPROACH, 0, 0, 5000)
    const ac2 = makeAircraft('2', 'UAL2', AircraftPhase.APPROACH, 1, 0, 5000)

    // First violation at time 10000
    checker.checkSeparation([ac1, ac2], 10000)

    // Clear flags (simulating the start-of-tick reset)
    clearViolationFlags([ac1, ac2])
    expect(ac1.inViolation).toBe(false)

    // After cooldown (time 20000: 10000 + 5000 < 20000), re-check same pair
    const v2 = checker.checkSeparation([ac1, ac2], 20000)
    expect(v2).toHaveLength(1)
  })

  it('handles 3 aircraft with one violating pair', () => {
    const nowMs = 10000
    // ac1 and ac2 are close, ac3 is far away
    const ac1 = makeAircraft('1', 'UAL1', AircraftPhase.APPROACH, 0, 0, 5000)
    const ac2 = makeAircraft('2', 'UAL2', AircraftPhase.APPROACH, 2, 0, 5000)
    const ac3 = makeAircraft('3', 'UAL3', AircraftPhase.APPROACH, 20, 0, 5000)

    const violations = checker.checkSeparation([ac1, ac2, ac3], nowMs)
    expect(violations).toHaveLength(1)
  })

  it('handles empty aircraft list', () => {
    const violations = checker.checkSeparation([], 1000)
    expect(violations).toHaveLength(0)
  })

  it('handles single aircraft (no pair to check)', () => {
    const ac = makeAircraft('1', 'UAL1', AircraftPhase.APPROACH, 0, 0, 5000)
    const violations = checker.checkSeparation([ac], 1000)
    expect(violations).toHaveLength(0)
  })

  it('reset clears all cooldowns', () => {
    const ac1 = makeAircraft('1', 'UAL1', AircraftPhase.APPROACH, 0, 0, 5000)
    const ac2 = makeAircraft('2', 'UAL2', AircraftPhase.APPROACH, 1, 0, 5000)

    checker.checkSeparation([ac1, ac2], 10000)
    checker.reset()

    // Now next check should re-report even at the same timestamp (cooldowns cleared)
    clearViolationFlags([ac1, ac2])
    const v2 = checker.checkSeparation([ac1, ac2], 10000)
    expect(v2).toHaveLength(1)
  })
})

describe('clearViolationFlags', () => {
  it('clears inViolation on all aircraft', () => {
    const ac1 = makeAircraft('1', 'UAL1', AircraftPhase.APPROACH, 0, 0, 5000)
    const ac2 = makeAircraft('2', 'UAL2', AircraftPhase.APPROACH, 0, 0, 5000)
    ac1.inViolation = true
    ac2.inViolation = true

    clearViolationFlags([ac1, ac2])

    expect(ac1.inViolation).toBe(false)
    expect(ac2.inViolation).toBe(false)
  })
})
