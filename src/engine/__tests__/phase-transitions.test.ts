import { describe, it, expect } from 'vitest'
import { loadAirport } from '../airport-loader'
import { processPhaseTransitions, checkAircraftRemoval } from '../phase-transitions'
import { spawnDeparture } from '../aircraft-factory'
import { moveAircraft } from '../movement'
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
    { x: 0, y: 0.04 },
  ]
  ac.taxiRouteIndex = 0
  ac.taxiTarget = ac.taxiRoute[0]
  return ac
}

describe('TAXI_OUT → HOLD_SHORT (routed taxi)', () => {
  it('does not hold short while still tracking an earlier waypoint, even near the route end', () => {
    const ac = makeTaxiingDeparture()
    // Regression: within the old 0.1 NM radius of the end (dist 0.1) but only
    // partway through the route — used to park mid-taxiway here
    ac.x = 0
    ac.y = 0.14
    ac.taxiRouteIndex = 1

    processPhaseTransitions(ac, null, airport)

    expect(ac.phase).toBe(AircraftPhase.TAXI_OUT)
  })

  it('holds short once the final route point is reached', () => {
    const ac = makeTaxiingDeparture()
    ac.taxiRouteIndex = 2
    ac.x = 0
    ac.y = 0.04

    processPhaseTransitions(ac, null, airport)

    expect(ac.phase).toBe(AircraftPhase.HOLD_SHORT)
    expect(ac.speed).toBe(0)
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
