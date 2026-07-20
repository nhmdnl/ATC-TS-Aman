import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { gameState } from '../game-state'
import { processCommand } from '../commands/command-registry'
import { loadAirport } from '../airport-loader'
import { AircraftPhase, CommandType, ControllerStation , WakeCategory } from '../types'
import type { Aircraft, Command } from '../types'
import hhasData from '../../data/airports/hhas.airport.json'

function makeAircraft(overrides: Partial<Aircraft> = {}): Aircraft {
  return {
    id: 'reg-1',
    callsign: 'AIT001',
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
    squawk: '4521',
    x: 0,
    y: 0,
    altitude: 9000,
    heading: 0,
    speed: 180,
    phase: AircraftPhase.APPROACH,
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
    pendingPilotCall: null,
    withYouCallFired: false,
    awaitingCrossingRunway: null,
    ...overrides,
  }
}

const vector: Command = {
  type: CommandType.VECTOR,
  targetCallsign: 'AIT001',
  params: { heading: 180 },
}

describe('processCommand — deferred execution across reset (integration, real HHAS data)', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    gameState.reset()
    gameState.airport = loadAirport(hhasData)
  })

  afterEach(() => {
    vi.useRealTimers()
    gameState.reset()
  })

  it('executes after the readback delay within the same session', () => {
    const aircraft = makeAircraft()
    gameState.addAircraft(aircraft)

    const result = processCommand(vector, gameState.airport!)
    expect(result.success).toBe(true)
    expect(aircraft.clearedHeading).toBeNull() // readback still pending

    vi.runAllTimers()
    expect(aircraft.clearedHeading).toBe(180)
    expect(aircraft.readbackTimer).toBeNull()
  })

  it('drops a pending readback when reset() ends the session mid-delay', () => {
    gameState.addAircraft(makeAircraft())
    expect(processCommand(vector, gameState.airport!).success).toBe(true)

    // Session resets while the readback timer is still pending, and the new
    // session spawns an aircraft that happens to reuse the callsign.
    gameState.reset()
    gameState.airport = loadAirport(hhasData)
    const reincarnated = makeAircraft({ id: 'reg-2' })
    gameState.addAircraft(reincarnated)

    vi.runAllTimers() // stale timer from the previous session fires

    expect(reincarnated.clearedHeading).toBeNull()
  })
})

describe('getStationName fallback (airport with no frequencies)', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    gameState.reset()
  })

  afterEach(() => {
    vi.useRealTimers()
    gameState.reset()
  })

  it('uses the airport metadata name instead of hardcoded "Asmara"', () => {
    const testAirport = loadAirport({
      version: '1.1',
      metadata: { name: 'Test Field', icao: 'TFLD' },
      layers: [],
      objects: [],
      editorSettings: {},
      referenceImage: {},
    })

    gameState.airport = testAirport
    gameState.addAircraft(makeAircraft())

    const result = processCommand(vector, gameState.airport!)
    expect(result.success).toBe(true)

    // Fallback should use "Test Field", not "Asmara"
    expect(result.phraseology?.station).toContain('Test Field')
  })
})
