import { describe, it, expect, beforeEach } from 'vitest'
import { GameState } from '../game-state'
import type { Aircraft, ScoreEvent, RadioMessage } from '../types'
import { AircraftPhase, ControllerStation } from '../types'

/** Build a minimal valid Aircraft for testing */
function makeAircraft(id: string, callsign: string, phase: AircraftPhase = AircraftPhase.PARKED): Aircraft {
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
    },
    flightType: 'departure',
    squawk: '1234',
    x: 0,
    y: 0,
    altitude: 0,
    heading: 0,
    speed: 0,
    phase,
    controller: ControllerStation.GROUND,
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
  }
}

describe('GameState', () => {
  let state: GameState

  beforeEach(() => {
    state = new GameState()
    state.reset()
  })

  // ── Aircraft Management ──

  describe('addAircraft', () => {
    it('adds an aircraft to the map', () => {
      const ac = makeAircraft('1', 'UAL123')
      state.addAircraft(ac)
      expect(state.aircraft.size).toBe(1)
      expect(state.aircraft.get('1')).toBe(ac)
    })

    it('tracks gate as occupied when aircraft has assignedGate', () => {
      const ac = makeAircraft('1', 'UAL123')
      ac.assignedGate = 'G1'
      state.addAircraft(ac)
      expect(state.occupiedGateIds.has('G1')).toBe(true)
    })

    it('does not add gate to occupied when no assignedGate', () => {
      const ac = makeAircraft('1', 'UAL123')
      state.addAircraft(ac)
      expect(state.occupiedGateIds.size).toBe(0)
    })
  })

  describe('removeAircraft', () => {
    it('removes aircraft from the map', () => {
      state.addAircraft(makeAircraft('1', 'UAL123'))
      state.removeAircraft('1')
      expect(state.aircraft.size).toBe(0)
    })

    it('frees the gate when aircraft had one', () => {
      const ac = makeAircraft('1', 'UAL123')
      ac.assignedGate = 'G1'
      state.addAircraft(ac)
      state.removeAircraft('1')
      expect(state.occupiedGateIds.has('G1')).toBe(false)
    })

    it('does nothing when removing non-existent id', () => {
      expect(() => state.removeAircraft('nonexistent')).not.toThrow()
    })
  })

  describe('getAircraftByCallsign', () => {
    it('finds aircraft by exact callsign', () => {
      const ac = makeAircraft('1', 'UAL123')
      state.addAircraft(ac)
      expect(state.getAircraftByCallsign('UAL123')).toBe(ac)
    })

    it('is case-insensitive', () => {
      state.addAircraft(makeAircraft('1', 'UAL123'))
      expect(state.getAircraftByCallsign('ual123')).toBeDefined()
      expect(state.getAircraftByCallsign('UaL123')).toBeDefined()
    })

    it('returns undefined for non-existent callsign', () => {
      expect(state.getAircraftByCallsign('NONEXIST')).toBeUndefined()
    })

    it('returns undefined from empty state', () => {
      expect(state.getAircraftByCallsign('UAL123')).toBeUndefined()
    })

    it('finds correct aircraft when multiple exist', () => {
      state.addAircraft(makeAircraft('1', 'UAL123'))
      state.addAircraft(makeAircraft('2', 'DAL456'))
      const found = state.getAircraftByCallsign('DAL456')
      expect(found).toBeDefined()
      expect(found!.id).toBe('2')
    })
  })

  describe('getAircraftByPhase', () => {
    it('returns aircraft matching the phase', () => {
      const ac1 = makeAircraft('1', 'UAL1', AircraftPhase.PARKED)
      const ac2 = makeAircraft('2', 'UAL2', AircraftPhase.CLIMBING)
      const ac3 = makeAircraft('3', 'UAL3', AircraftPhase.PARKED)
      state.addAircraft(ac1)
      state.addAircraft(ac2)
      state.addAircraft(ac3)
      const parked = state.getAircraftByPhase(AircraftPhase.PARKED)
      expect(parked).toHaveLength(2)
      expect(parked.map(a => a.id)).toEqual(['1', '3'])
    })

    it('returns empty array when no match', () => {
      state.addAircraft(makeAircraft('1', 'UAL1', AircraftPhase.PARKED))
      const climbing = state.getAircraftByPhase(AircraftPhase.CLIMBING)
      expect(climbing).toHaveLength(0)
    })
  })

  describe('selectAircraft', () => {
    it('sets isSelected on the target aircraft', () => {
      const ac = makeAircraft('1', 'UAL123')
      state.addAircraft(ac)
      state.selectAircraft('1')
      expect(ac.isSelected).toBe(true)
      expect(state.selectedAircraftId).toBe('1')
    })

    it('deselects previous aircraft when selecting new one', () => {
      const ac1 = makeAircraft('1', 'UAL1')
      const ac2 = makeAircraft('2', 'UAL2')
      state.addAircraft(ac1)
      state.addAircraft(ac2)
      state.selectAircraft('1')
      state.selectAircraft('2')
      expect(ac1.isSelected).toBe(false)
      expect(ac2.isSelected).toBe(true)
    })

    it('deselects when passing null', () => {
      const ac = makeAircraft('1', 'UAL123')
      state.addAircraft(ac)
      state.selectAircraft('1')
      state.selectAircraft(null)
      expect(ac.isSelected).toBe(false)
      expect(state.selectedAircraftId).toBeNull()
    })
  })

  describe('getSelectedAircraft', () => {
    it('returns the selected aircraft', () => {
      const ac = makeAircraft('1', 'UAL123')
      state.addAircraft(ac)
      state.selectAircraft('1')
      expect(state.getSelectedAircraft()).toBe(ac)
    })

    it('returns null when nothing selected', () => {
      expect(state.getSelectedAircraft()).toBeNull()
    })

    it('returns null when selected id points to removed aircraft', () => {
      const ac = makeAircraft('1', 'UAL123')
      state.addAircraft(ac)
      state.selectAircraft('1')
      state.removeAircraft('1')
      expect(state.getSelectedAircraft()).toBeNull()
    })
  })

  // ── Scoring ──

  describe('addScoreEvent', () => {
    it('stores the score event in the event list', () => {
      state.addScoreEvent({ timestamp: 0, delta: 50, reason: 'takeoff', callsign: 'UAL123' })
      expect(state.scoreEvents).toHaveLength(1)
    })

    it('adds positive delta to score', () => {
      state.addScoreEvent({ timestamp: 0, delta: 50, reason: 'takeoff', callsign: 'UAL123' })
      expect(state.score).toBe(1050)
    })

    it('reduces score with negative delta', () => {
      state.addScoreEvent({ timestamp: 0, delta: -150, reason: 'separation_violation', callsign: 'UAL123' })
      expect(state.score).toBe(850)
    })

    it('goes negative so violations keep costing, capped at MIN_SCORE', () => {
      for (let i = 0; i < 10; i++) {
        state.addScoreEvent({ timestamp: 0, delta: -200, reason: 'separation_violation', callsign: 'UAL123' })
      }
      expect(state.score).toBe(-500)
      expect(state.getGrade()).toBe('D')
    })

    it('caps score at MAX_SCORE', () => {
      for (let i = 0; i < 100; i++) {
        state.addScoreEvent({ timestamp: 0, delta: 200, reason: 'takeoff', callsign: 'UAL123' })
      }
      expect(state.score).toBe(2000)
    })

    it('trims events beyond MAX_SCORE_EVENTS', () => {
      for (let i = 0; i < 60; i++) {
        state.addScoreEvent({ timestamp: i, delta: 5, reason: 'command_issued', callsign: 'UAL123' })
      }
      expect(state.scoreEvents.length).toBeLessThanOrEqual(50)
    })
  })

  describe('getGrade', () => {
    it('returns S for score >= 1500', () => {
      state.score = 1500
      expect(state.getGrade()).toBe('S')
    })

    it('returns A for score >= 1200', () => {
      state.score = 1200
      expect(state.getGrade()).toBe('A')
    })

    it('returns B for score >= 900', () => {
      state.score = 900
      expect(state.getGrade()).toBe('B')
    })

    it('returns C for score >= 600', () => {
      state.score = 600
      expect(state.getGrade()).toBe('C')
    })

    it('returns D for score < 600', () => {
      state.score = 0
      expect(state.getGrade()).toBe('D')
    })
  })

  // ── Session Management ──

  describe('setDifficulty', () => {
    it('sets difficulty to easy', () => {
      state.setDifficulty('easy')
      expect(state.difficulty.level).toBe('easy')
      expect(state.wind.direction).toBe(340)
      expect(state.wind.speed).toBe(4)
    })

    it('sets difficulty to hard', () => {
      state.setDifficulty('hard')
      expect(state.difficulty.level).toBe('hard')
      expect(state.wind.speed).toBe(15)
    })
  })

  describe('isSessionExpired', () => {
    it('returns false at start', () => {
      expect(state.isSessionExpired()).toBe(false)
    })

    it('returns true when elapsed exceeds session duration', () => {
      state.elapsedMs = 1_000_000_000
      expect(state.isSessionExpired()).toBe(true)
    })
  })

  describe('reset', () => {
    it('clears all state', () => {
      const ac = makeAircraft('1', 'UAL123')
      state.addAircraft(ac)
      state.score = 500
      state.addRadioMessage({ timestamp: 0, speaker: 'SYSTEM', message: 'test' })
      state.reset()
      expect(state.aircraft.size).toBe(0)
      expect(state.score).toBe(1000) // INITIAL_SCORE
      expect(state.paused).toBe(false)
      expect(state.elapsedMs).toBe(0)
      expect(state.sessionEnded).toBe(false)
      expect(state.radioLog).toHaveLength(0)
    })
  })

  // ── Snapshot ──

  describe('snapshot', () => {
    it('returns a read-only representation of state', () => {
      const ac = makeAircraft('1', 'UAL123')
      state.addAircraft(ac)
      state.score = 1500
      const snap = state.snapshot()
      expect(snap.score).toBe(1500)
      expect(snap.aircraft.size).toBe(1)
      expect(snap.aircraft.get('1')).toBe(ac)
      expect(snap.paused).toBe(false)
      expect(snap.difficulty).toBe('easy')
    })

    it('snapshot is isolated from subsequent mutations (aircraft map ref)', () => {
      const ac = makeAircraft('1', 'UAL123')
      state.addAircraft(ac)
      const snap = state.snapshot()
      state.removeAircraft('1')
      // snapshot retains a copy of the map at snapshot time
      expect(snap.aircraft.size).toBe(1)
    })
  })

  // ── Radio Log ──

  describe('addRadioMessage', () => {
    it('adds message to log', () => {
      const msg: RadioMessage = { timestamp: 0, speaker: 'ATC', message: 'Roger', station: 'TOWER' }
      state.addRadioMessage(msg)
      expect(state.radioLog).toHaveLength(1)
      expect(state.radioLog[0].message).toBe('Roger')
    })

    it('trims log at 200 messages', () => {
      for (let i = 0; i < 250; i++) {
        state.addRadioMessage({ timestamp: i, speaker: 'SYSTEM', message: `msg${i}` })
      }
      expect(state.radioLog.length).toBeLessThanOrEqual(200)
    })
  })

  // ── Traffic Count ──

  describe('trafficCount', () => {
    it('returns 0 for empty state', () => {
      expect(state.trafficCount).toBe(0)
    })

    it('returns number of aircraft', () => {
      state.addAircraft(makeAircraft('1', 'UAL1'))
      state.addAircraft(makeAircraft('2', 'UAL2'))
      expect(state.trafficCount).toBe(2)
    })
  })

  describe('allAircraft', () => {
    it('returns all aircraft as an array', () => {
      state.addAircraft(makeAircraft('1', 'UAL1'))
      state.addAircraft(makeAircraft('2', 'UAL2'))
      const all = state.allAircraft()
      expect(all).toHaveLength(2)
    })

    it('returns empty array when no aircraft', () => {
      expect(state.allAircraft()).toHaveLength(0)
    })
  })
})
