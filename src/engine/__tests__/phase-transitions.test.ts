import { describe, it, expect } from 'vitest'
import { loadAirport, findRunwayById } from '../airport-loader'
import { processPhaseTransitions, checkAircraftRemoval } from '../phase-transitions'
import { spawnDeparture, spawnArrival } from '../aircraft-factory'
import { moveAircraft } from '../movement'
import { AIRCRAFT_TYPES } from '../constants'
import { AircraftPhase } from '../types'
import type { Aircraft, GateData } from '../types'
import hhasData from '../../data/airports/hhas.airport.json'

const airport = loadAirport(hhasData)

function makeTaxiingDeparture(): Aircraft {
  const gate: GateData = { id: 'G1', x: 0, y: 0.5, taxiwayId: 'TW-A' }
  const ac = spawnDeparture(gate, '07')
  ac.phase = AircraftPhase.TAXI_OUT
  ac.speed = 15
  // 3-point route ending at the hold-short node
  ac.taxiRoute = [
    { x: 0, y: 0.3 },
    { x: 0, y: 0.14 },
    { x: 0, y: 0 },
  ]
  ac.taxiRouteIndex = 0
  return ac
}

describe('departure hold-short triggers only on reaching route end', () => {
  it('does not hold short while still tracking an earlier waypoint, even near the route end', () => {
    const ac = makeTaxiingDeparture()
    ac.x = 0
    ac.y = 0.01 // within 0.02 NM threshold, but index is 0
    processPhaseTransitions(ac, findRunwayById(airport, '07')!, airport)
    expect(ac.phase).toBe(AircraftPhase.TAXI_OUT)
  })

  it('holds short once the final route point is reached', () => {
    const ac = makeTaxiingDeparture()
    ac.x = 0
    ac.y = 0.01
    ac.taxiRouteIndex = 2 // final point
    processPhaseTransitions(ac, findRunwayById(airport, '07')!, airport)
    expect(ac.phase).toBe(AircraftPhase.HOLD_SHORT)
    expect(ac.speed).toBe(0)
  })
})

describe('APPROACH → FINAL requires approach clearance', () => {
  function arrivalAtThreshold(): Aircraft {
    const rwy = findRunwayById(airport, '07')!
    const ac = spawnArrival(
      { id: 'ENTRY-S', type: 'arrival', x: 0, y: -14, heading: 360, altitude: 12000 },
      undefined,
      AIRCRAFT_TYPES.find(t => !t.rotorcraft)
    )
    ac.phase = AircraftPhase.APPROACH
    ac.assignedRunway = rwy.id
    ac.x = rwy.thresholdX
    ac.y = rwy.thresholdY - 0.5
    return ac
  }

  it('an uncleared overflight near the threshold stays APPROACH (no false FINAL)', () => {
    const ac = arrivalAtThreshold()
    processPhaseTransitions(ac, findRunwayById(airport, '07')!, airport)
    expect(ac.phase).toBe(AircraftPhase.APPROACH)
    expect(ac.urgent).toBe(false)
  })

  it('a cleared-for-approach aircraft goes FINAL (urgent until cleared to land)', () => {
    const ac = arrivalAtThreshold()
    ac.clearedForApproach = true
    processPhaseTransitions(ac, findRunwayById(airport, '07')!, airport)
    expect(ac.phase).toBe(AircraftPhase.FINAL)
    expect(ac.urgent).toBe(true)
  })
})

describe('arrivals that leave the radar area are removed', () => {
  it('removes an APPROACH arrival past 25 NM, keeps one inside', () => {
    const ac = spawnArrival({
      id: 'ENTRY-N', type: 'arrival', x: 0, y: 14, heading: 180, altitude: 12000,
    })
    ac.phase = AircraftPhase.APPROACH
    expect(checkAircraftRemoval(ac)).toBe(false)
    ac.y = -21 // just past the 20 NM removal radius (4th radar ring)
    expect(checkAircraftRemoval(ac)).toBe(true)
  })
})

describe('DEPARTED flies out to the removal boundary', () => {
  it('keeps moving after handoff and qualifies for removal past 25 NM', () => {
    const gate: GateData = { id: 'G1', x: 0, y: 0, taxiwayId: 'TW-A' }
    const ac = spawnDeparture(gate, '07')
    ac.phase = AircraftPhase.DEPARTED
    ac.x = 3
    ac.y = 0
    ac.heading = 70
    ac.speed = 250
    ac.altitude = 9000

    // Regression: DEPARTED used to have no movement, freezing aircraft
    // mid-air forever (never reaching the 25 NM removal boundary)
    moveAircraft(ac, 1, null)
    expect(ac.x).toBeGreaterThan(3)

    let removed = false
    for (let t = 0; t < 600 && !removed; t++) {
      moveAircraft(ac, 1, null)
      removed = checkAircraftRemoval(ac)
    }
    expect(removed).toBe(true)
  })
})
