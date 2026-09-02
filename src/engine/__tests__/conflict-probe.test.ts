import { describe, it, expect, beforeEach } from 'vitest'
import { predictConflicts } from '../conflict-probe'
import { AircraftPhase, WakeCategory, ControllerStation } from '../types'
import type { Aircraft } from '../types'

function makeProbeAircraft(
  callsign: string,
  opts: {
    x: number
    y: number
    altitude?: number
    heading?: number
    speed?: number
    clearedAltitude?: number | null
    wake?: WakeCategory
    inViolation?: boolean
    phase?: AircraftPhase
  },
): Aircraft {
  return {
    id: `id-${callsign}`,
    callsign,
    type: {
      icao: 'B738',
      name: 'Boeing 737-800',
      category: 'M',
      approachCategory: 'C',
      wakeCategory: opts.wake ?? WakeCategory.MEDIUM,
      cruiseSpeed: 460,
      approachSpeed: 137,
      rotationSpeed: 145,
      taxiSpeed: 20,
      climbRate: 2000,
      descentRate: 1800,
      serviceCeiling: 41000,
    },
    flightType: 'arrival',
    squawk: '2000',
    x: opts.x,
    y: opts.y,
    altitude: opts.altitude ?? 9000,
    heading: opts.heading ?? 0,
    speed: opts.speed ?? 250,
    phase: opts.phase ?? AircraftPhase.APPROACH,
    controller: ControllerStation.APPROACH,
    clearedHeading: null,
    clearedAltitude: opts.clearedAltitude ?? null,
    clearedSpeed: null,
    clearedToLand: false,
    clearedForApproach: true,
    assignedRunway: null,
    assignedTaxiway: null,
    assignedGate: null,
    taxiTarget: null,
    taxiRoute: null,
    taxiRouteIndex: 0,
    pushbackCallAt: null,
    pushbackHeading: null,
    departureHandoffAlt: null,
    pendingPilotCall: null,
    withYouCallFired: false,
    awaitingCrossingRunway: null,
    spawnTime: 0,
    lastCommandTime: 0,
    readbackTimer: null,
    urgent: false,
    inViolation: opts.inViolation ?? false,
    isSelected: false,
    handedOff: false,
    missedHeading: null,
    missedAltitude: null,
    trail: [],
  }
}

describe('conflict prediction probe', () => {
  beforeEach(() => {
    // probe state lives on the aircraft objects — nothing global to reset
  })

  it('flags a same-track pair where the trailer is overhauling the leader', () => {
    // 5 NM gap closing at 90 kt (1.5 NM/min) → MRS 3 NM lost in ~2 min
    const leader = makeProbeAircraft('LED001', { x: 0, y: 0, speed: 240 })
    const trailer = makeProbeAircraft('TRL002', { x: 0, y: -5, speed: 330 })

    predictConflicts([leader, trailer])

    expect(leader.predictedConflictWith).toBe('TRL002')
    expect(trailer.predictedConflictWith).toBe('LED001')
    expect(leader.predictedConflictInS).toBeGreaterThan(0)
    expect(leader.predictedConflictInS!).toBeLessThanOrEqual(180)
  })

  it('does not flag a receding pair', () => {
    // Leader faster than trailer → gap grows
    const leader = makeProbeAircraft('LED001', { x: 0, y: 0, speed: 330 })
    const trailer = makeProbeAircraft('TRL002', { x: 0, y: -5, speed: 240 })

    predictConflicts([leader, trailer])

    expect(leader.predictedConflictWith).toBeNull()
    expect(trailer.predictedConflictWith).toBeNull()
  })

  it('does not flag pairs with vertical separation intact', () => {
    // Same track, overhauling, but 1000 ft apart — exactly at SEPARATION_FT
    const leader = makeProbeAircraft('LED001', { x: 0, y: 0, speed: 240, altitude: 9000 })
    const trailer = makeProbeAircraft('TRL002', { x: 0, y: -5, speed: 330, altitude: 10000 })

    predictConflicts([leader, trailer])

    expect(leader.predictedConflictWith).toBeNull()
    expect(trailer.predictedConflictWith).toBeNull()
  })

  it('respects the wake turbulence matrix — a LIGHT trailer behind a HEAVY leader is flagged earlier than a MEDIUM pair', () => {
    // 6.5 NM gap closing at 120 kt (2 NM/min): the HEAVY→LIGHT pair needs 6 NM
    // (loss in ~15 s), the MEDIUM pair only 3 NM MRS (loss in ~105 s)
    const geometry = { x: 0, y: -6.5, speed: 360 } as const
    const heavyLeader = makeProbeAircraft('HVY001', { x: 0, y: 0, speed: 240, wake: WakeCategory.HEAVY })
    const lightTrailer = makeProbeAircraft('LHT002', { ...geometry, wake: WakeCategory.LIGHT })
    predictConflicts([heavyLeader, lightTrailer])
    const wakeInS = heavyLeader.predictedConflictInS

    const medLeader = makeProbeAircraft('MED001', { x: 0, y: 0, speed: 240 })
    const medTrailer = makeProbeAircraft('MED002', { ...geometry })
    predictConflicts([medLeader, medTrailer])
    const mrsInS = medLeader.predictedConflictInS

    // Wake requires 6 NM vs 3 NM MRS — the heavy/light pair loses first
    expect(wakeInS).not.toBeNull()
    expect(mrsInS).not.toBeNull()
    expect(wakeInS!).toBeLessThan(mrsInS!)
  })

  it('skips pairs already in violation — the red halo covers them', () => {
    const leader = makeProbeAircraft('LED001', { x: 0, y: 0, speed: 240, inViolation: true })
    const trailer = makeProbeAircraft('TRL002', { x: 0, y: -2, speed: 330 })

    predictConflicts([leader, trailer])

    expect(leader.predictedConflictWith).toBeNull()
    expect(trailer.predictedConflictWith).toBeNull()
  })

  it('clears stale predictions when a conflict resolves', () => {
    const leader = makeProbeAircraft('LED001', { x: 0, y: 0, speed: 240 })
    const trailer = makeProbeAircraft('TRL002', { x: 0, y: -5, speed: 330 })

    predictConflicts([leader, trailer])
    expect(leader.predictedConflictWith).toBe('TRL002')

    // Next tick: trailer slowed down, gap now grows
    trailer.speed = 200
    predictConflicts([leader, trailer])
    expect(leader.predictedConflictWith).toBeNull()
    expect(leader.predictedConflictInS).toBeNull()
  })

  it('ignores ground traffic entirely', () => {
    const parked = makeProbeAircraft('GND001', { x: 0, y: 0, phase: AircraftPhase.TAXI_OUT })
    const flyer = makeProbeAircraft('AIR001', { x: 0, y: 0.5, speed: 250 })

    predictConflicts([parked, flyer])

    expect(parked.predictedConflictWith).toBeNull()
    expect(flyer.predictedConflictWith).toBeNull()
  })
})
