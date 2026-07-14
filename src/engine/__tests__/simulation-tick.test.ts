import { describe, it, expect, beforeEach } from 'vitest'
import { tick } from '../simulation-tick'
import { gameState } from '../game-state'
import { loadAirport } from '../airport-loader'
import { spawnArrival } from '../aircraft-factory'
import { AircraftPhase } from '../types'
import hhasData from '../../data/airports/hhas.airport.json'

const FIELD_ELEVATION_FT = 7661

function addArrivalInPhase(phase: AircraftPhase, altitude: number) {
  const ac = spawnArrival({
    id: 'ENTRY-S', type: 'arrival', x: 0, y: -14, heading: 360, altitude: 12000,
  })
  ac.phase = phase
  ac.altitude = altitude
  ac.x = 0.5
  ac.y = 0
  gameState.addAircraft(ac)
  return ac
}

function mvaAlerts(): number {
  return gameState.radioLog.filter((m) => m.message.includes('MVA')).length
}

describe('MVA low-altitude alert scope', () => {
  beforeEach(() => {
    gameState.reset()
    gameState.airport = loadAirport(hhasData)
    gameState.sessionStarted = true
    gameState.lastSpawnTime = Date.now() // suppress periodic spawn
  })

  it('alerts for APPROACH traffic below the MVA floor', () => {
    addArrivalInPhase(AircraftPhase.APPROACH, 8200)
    tick(gameState, 1)
    expect(mvaAlerts()).toBe(1)
  })

  it('does not alert for landed traffic at field elevation (rollout/taxi-in)', () => {
    // Regression: arrivals keep altitude = field elevation (~7,661 ft MSL)
    // on the ground, which sat inside the alert band and fired every 10 s
    addArrivalInPhase(AircraftPhase.ROLLOUT, FIELD_ELEVATION_FT)
    addArrivalInPhase(AircraftPhase.TAXI_IN, FIELD_ELEVATION_FT)
    tick(gameState, 1)
    expect(mvaAlerts()).toBe(0)
  })

  it('does not alert for a go-around climbing through the band', () => {
    const ac = addArrivalInPhase(AircraftPhase.MISSED, 8000)
    ac.missedHeading = 170
    ac.missedAltitude = 11500
    tick(gameState, 1)
    expect(mvaAlerts()).toBe(0)
  })
})
