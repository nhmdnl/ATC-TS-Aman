import { describe, it, expect, beforeEach } from 'vitest'
import { gameState } from '../game-state'
import { initializeScoringSystem } from '../scoring'
import { eventBus } from '../event-bus'
import { GameEventType, ControllerStation, AircraftPhase } from '../types'
import type { Aircraft } from '../types'

// Called once for this test file's lifetime, matching how GameContext.tsx
// calls it once for the whole app — calling it again per-test would
// double-subscribe the event bus and double-count every score change.
initializeScoringSystem()

function makeAircraft(overrides: Partial<Aircraft> = {}): Aircraft {
  return {
    id: 'sc-1',
    callsign: 'SCR001',
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
    },
    flightType: 'departure',
    squawk: '1200',
    x: 0,
    y: 0,
    altitude: 0,
    heading: 0,
    speed: 0,
    phase: AircraftPhase.CLIMBING,
    controller: ControllerStation.TOWER,
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
    ...overrides,
  }
}

describe('scoring — player-station attribution', () => {
  beforeEach(() => {
    gameState.reset()
  })

  it('scores a takeoff event when the aircraft is on a player-controlled station', () => {
    gameState.playerStations = [ControllerStation.GROUND, ControllerStation.TOWER, ControllerStation.APPROACH]
    const aircraft = makeAircraft({ controller: ControllerStation.TOWER })
    gameState.addAircraft(aircraft)
    const scoreBefore = gameState.score

    eventBus.emit(GameEventType.TAKEOFF, { callsign: aircraft.callsign })

    expect(gameState.score).toBe(scoreBefore + 20) // SCORE_DELTAS.takeoff
  })

  it('does not score a takeoff event when the aircraft is on an AI-controlled station', () => {
    gameState.playerStations = [ControllerStation.GROUND] // TOWER is AI-controlled
    const aircraft = makeAircraft({ controller: ControllerStation.TOWER })
    gameState.addAircraft(aircraft)
    const scoreBefore = gameState.score

    eventBus.emit(GameEventType.TAKEOFF, { callsign: aircraft.callsign })

    expect(gameState.score).toBe(scoreBefore)
  })
})
