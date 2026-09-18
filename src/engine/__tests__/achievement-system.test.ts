import { describe, it, expect, beforeEach } from 'vitest'
import { achievementSystem } from '../achievement-system'
import { COMMENDATIONS } from '../constants'
import { eventBus } from '../event-bus'
import { gameState } from '../game-state'
import { GameEventType, ControllerStation, AircraftPhase, WakeCategory } from '../types'
import type { Aircraft, AircraftType } from '../types'

const STORAGE_KEY = 'atc_aman_commendations'

function memoryStorage(): Storage {
  const data = new Map<string, string>()
  return {
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => { data.set(k, v) },
    removeItem: (k: string) => { data.delete(k) },
    clear: () => { data.clear() },
    get length() { return data.size },
    key: (i: number) => [...data.keys()][i] ?? null,
  }
}

const jet: AircraftType = {
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
  rotorcraft: false,
}

const helo: AircraftType = {
  ...jet,
  icao: 'H135',
  name: 'Airbus H135',
  rotationSpeed: 0,
  rotorcraft: true,
  aircraftClass: 'HELICOPTER',
}

function makeAircraft(overrides: Partial<Aircraft> = {}): Aircraft {
  return {
    id: 'ac-1',
    callsign: 'TST001',
    type: jet,
    flightType: 'arrival',
    squawk: '1200',
    x: 0,
    y: 0,
    altitude: 0,
    heading: 0,
    speed: 0,
    phase: AircraftPhase.LANDING,
    controller: ControllerStation.TOWER,
    clearedHeading: null,
    clearedAltitude: null,
    clearedSpeed: null,
    clearedToLand: true,
    clearedForApproach: true,
    assignedRunway: null,
    assignedTaxiway: null,
    assignedGate: 'H1',
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
    ...overrides,
  }
}

describe('achievement-system', () => {
  beforeEach(() => {
    gameState.reset()
    gameState.playerStations = [ControllerStation.GROUND, ControllerStation.TOWER, ControllerStation.APPROACH]
    achievementSystem.resetForTests()
  })

  it('unlocks First Watch on the first SESSION_ENDED', () => {
    eventBus.emit(GameEventType.SESSION_ENDED, { score: 1000, grade: 'A' })
    expect(achievementSystem.isUnlocked('first_watch')).toBe(true)
    expect(achievementSystem.state.counters.sessions_completed).toBe(1)
  })

  it('does not re-unlock First Watch', () => {
    eventBus.emit(GameEventType.SESSION_ENDED, {})
    const first = achievementSystem.state.unlocked.first_watch
    eventBus.emit(GameEventType.SESSION_ENDED, {})
    expect(achievementSystem.state.unlocked.first_watch).toBe(first)
    expect(achievementSystem.state.counters.sessions_completed).toBe(2)
  })

  it('unlocks Clean Sheet when the player handled traffic with no player-station violations', () => {
    gameState.aircraftHandled = 1
    eventBus.emit(GameEventType.SESSION_ENDED, {})
    expect(achievementSystem.isUnlocked('clean_sheet')).toBe(true)
  })

  it('does not unlock Clean Sheet on an empty session', () => {
    gameState.aircraftHandled = 0
    eventBus.emit(GameEventType.SESSION_ENDED, {})
    expect(achievementSystem.isUnlocked('clean_sheet')).toBe(false)
    expect(achievementSystem.isUnlocked('first_watch')).toBe(true)
  })

  it('does not unlock Clean Sheet after a player-station separation violation', () => {
    const ac = makeAircraft({ controller: ControllerStation.TOWER })
    gameState.addAircraft(ac)
    gameState.aircraftHandled = 1
    eventBus.emit(GameEventType.SEPARATION_VIOLATION, {
      callsign: ac.callsign,
      violation: { callsign1: ac.callsign, callsign2: 'OTH002' },
    })
    eventBus.emit(GameEventType.SESSION_ENDED, {})
    expect(achievementSystem.isUnlocked('clean_sheet')).toBe(false)
  })

  it('ignores AI-station separation violations for Clean Sheet', () => {
    gameState.playerStations = [ControllerStation.GROUND]
    const ac = makeAircraft({ controller: ControllerStation.TOWER })
    gameState.addAircraft(ac)
    gameState.aircraftHandled = 1
    eventBus.emit(GameEventType.SEPARATION_VIOLATION, {
      callsign: ac.callsign,
      violation: { callsign1: ac.callsign, callsign2: 'OTH002' },
    })
    eventBus.emit(GameEventType.SESSION_ENDED, {})
    expect(achievementSystem.isUnlocked('clean_sheet')).toBe(true)
  })

  it('unlocks Say Again on a player landing after NORDO', () => {
    const ac = makeAircraft({ radioFailureUsed: true, controller: ControllerStation.TOWER })
    gameState.addAircraft(ac)
    eventBus.emit(GameEventType.LANDING, { callsign: ac.callsign })
    expect(achievementSystem.isUnlocked('say_again')).toBe(true)
    expect(achievementSystem.state.counters.nordo_safe_landings).toBe(1)
  })

  it('does not unlock Say Again for an AI-station NORDO landing', () => {
    gameState.playerStations = [ControllerStation.GROUND]
    const ac = makeAircraft({ radioFailureUsed: true, controller: ControllerStation.TOWER })
    gameState.addAircraft(ac)
    eventBus.emit(GameEventType.LANDING, { callsign: ac.callsign })
    expect(achievementSystem.isUnlocked('say_again')).toBe(false)
  })

  it('does not unlock Say Again without a NORDO history', () => {
    const ac = makeAircraft({ radioFailureUsed: false })
    gameState.addAircraft(ac)
    eventBus.emit(GameEventType.LANDING, { callsign: ac.callsign })
    expect(achievementSystem.isUnlocked('say_again')).toBe(false)
  })

  it('unlocks Rotors Turning on a player rotorcraft landing', () => {
    const ac = makeAircraft({ type: helo, assignedGate: 'H1', controller: ControllerStation.TOWER })
    gameState.addAircraft(ac)
    eventBus.emit(GameEventType.LANDING, { callsign: ac.callsign })
    expect(achievementSystem.isUnlocked('rotors_turning')).toBe(true)
  })

  it('does not unlock Rotors Turning for a jet landing', () => {
    const ac = makeAircraft({ type: jet })
    gameState.addAircraft(ac)
    eventBus.emit(GameEventType.LANDING, { callsign: ac.callsign })
    expect(achievementSystem.isUnlocked('rotors_turning')).toBe(false)
  })

  it('skips landing unlocks when the aircraft is already gone', () => {
    eventBus.emit(GameEventType.LANDING, { callsign: 'GONE1' })
    expect(achievementSystem.isUnlocked('say_again')).toBe(false)
    expect(achievementSystem.isUnlocked('rotors_turning')).toBe(false)
  })

  it('notifies onUnlock at the moment of unlock, not at session end', () => {
    const ids: string[] = []
    const unsub = achievementSystem.onUnlock((id) => ids.push(id))
    const ac = makeAircraft({ type: helo })
    gameState.addAircraft(ac)
    eventBus.emit(GameEventType.LANDING, { callsign: ac.callsign })
    expect(ids).toEqual(['rotors_turning'])
    unsub()
  })

  it('persists unlocks across a new AchievementSystem on the same store', async () => {
    const { AchievementSystem } = await import('../achievement-system')
    const storage = memoryStorage()
    const first = new AchievementSystem(storage)
    gameState.addAircraft(makeAircraft({ type: helo, callsign: 'HMS501', id: 'h1' }))
    eventBus.emit(GameEventType.LANDING, { callsign: 'HMS501' })
    expect(first.isUnlocked('rotors_turning')).toBe(true)
    const raw = storage.getItem(STORAGE_KEY)
    expect(raw).toBeTruthy()
    const second = new AchievementSystem(storage)
    expect(second.isUnlocked('rotors_turning')).toBe(true)
  })

  it('treats missing localStorage as a no-op, not a throw', () => {
    expect(() => eventBus.emit(GameEventType.SESSION_ENDED, {})).not.toThrow()
  })
})

describe('COMMENDATIONS table', () => {
  it('ships the four MVP ids with unique kinds coverage and a timing field', () => {
    expect(COMMENDATIONS.map(c => c.id)).toEqual([
      'first_watch', 'clean_sheet', 'say_again', 'rotors_turning',
    ])
    const kinds = new Set(COMMENDATIONS.map(c => c.kind))
    expect(kinds.has('milestone')).toBe(true)
    expect(kinds.has('mastery')).toBe(true)
    expect(kinds.has('discovery')).toBe(true)
    for (const c of COMMENDATIONS) {
      expect(c.timing).toBe('none')
    }
  })
})
