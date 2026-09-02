import { describe, it, expect, beforeEach, vi } from 'vitest'
import { gameState } from '../game-state'
import { eventBus } from '../event-bus'
import { initializeScoringSystem } from '../scoring'
import { updateEmergencies, maybeAssignLowFuel, isNordo } from '../emergencies'
import { processCommand } from '../commands/command-registry'
import { GameEventType, AircraftPhase, WakeCategory, ControllerStation, CommandType } from '../types'
import type { Aircraft, Airport } from '../types'

// Called once for this test file's lifetime — same pattern as scoring.test.ts.
// Calling it per-test would double-subscribe the event bus and double-count
// every score change.
initializeScoringSystem()

function makeAircraft(overrides: Partial<Aircraft> = {}): Aircraft {
  return {
    id: 'em-1',
    callsign: 'EMR001',
    type: {
      icao: 'B738',
      name: 'Boeing 737-800',
      category: 'M',
      approachCategory: 'C',
      wakeCategory: WakeCategory.MEDIUM,
      cruiseSpeed: 460,
      approachSpeed: 137,
      rotationSpeed: 145,
      taxiSpeed: 20,
      climbRate: 2500,
      descentRate: 1800,
      serviceCeiling: 41000,
    },
    flightType: 'arrival',
    squawk: '1200',
    x: 10,
    y: 10,
    altitude: 9000,
    heading: 180,
    speed: 250,
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
    inViolation: false,
    isSelected: false,
    handedOff: false,
    missedHeading: null,
    missedAltitude: null,
    trail: [],
    ...overrides,
  }
}

// Minimal airport — NORDO rejection fires before validation touches it
const fakeAirport = { metadata: { name: 'Asmara International' } } as unknown as Airport

describe('low-fuel arrivals', () => {
  beforeEach(() => {
    gameState.reset()
  })

  it('assigns fuel to some arrivals and none to departures (seeded roll)', () => {
    const arrival = makeAircraft()
    const departure = makeAircraft({ flightType: 'departure' })

    const random = vi.spyOn(Math, 'random').mockReturnValue(0.01) // below LOW_FUEL_ARRIVAL_CHANCE
    maybeAssignLowFuel(arrival)
    maybeAssignLowFuel(departure)
    random.mockRestore()

    expect(arrival.fuelMsRemaining).not.toBeNull()
    expect(arrival.fuelMsRemaining!).toBeGreaterThan(0)
    expect(departure.fuelMsRemaining).toBeUndefined() // departures never modeled
  })

  it('skips the fuel roll when the random draw is above the chance threshold', () => {
    const arrival = makeAircraft()
    const random = vi.spyOn(Math, 'random').mockReturnValue(0.99)
    maybeAssignLowFuel(arrival)
    random.mockRestore()

    expect(arrival.fuelMsRemaining).toBeUndefined()
  })

  it('burns fuel only while airborne and fires the PAN PAN call below the declare threshold', () => {
    const ac = makeAircraft({ fuelMsRemaining: 125_000, fuelDeclared: false })
    gameState.addAircraft(ac)
    const calls: string[] = []
    const unsub = eventBus.on(GameEventType.PILOT_CALL, (e) => calls.push(e.payload.message as string))

    updateEmergencies(gameState, 10) // 10 s → 115 s left → declare
    expect(ac.fuelDeclared).toBe(true)
    expect(ac.urgent).toBe(true)
    expect(calls.some(m => m.includes('PAN PAN') && m.includes('EMR001'))).toBe(true)

    // On the ground the clock freezes — no further burn, no re-declare
    ac.phase = AircraftPhase.TAXI_IN
    const fuelOnGround = ac.fuelMsRemaining
    updateEmergencies(gameState, 30)
    expect(ac.fuelMsRemaining).toBe(fuelOnGround)

    unsub()
  })

  it('declares MAYDAY once (and only once) when the fuel clock hits zero', () => {
    const ac = makeAircraft({ fuelMsRemaining: 5_000, fuelDeclared: true, fuelEmergencyDeclared: false })
    gameState.addAircraft(ac)
    const maydays: number[] = []
    const unsub = eventBus.on(GameEventType.FUEL_EMERGENCY, () => maydays.push(1))
    const criticalLogs = gameState.radioLog.filter(m => m.speaker === 'CRITICAL').length

    updateEmergencies(gameState, 10) // burn past zero
    expect(ac.fuelEmergencyDeclared).toBe(true)
    expect(maydays).toHaveLength(1)

    updateEmergencies(gameState, 10) // still airborne, still dry — no repeat
    expect(maydays).toHaveLength(1)

    expect(gameState.radioLog.filter(m => m.speaker === 'CRITICAL').length).toBe(criticalLogs + 1)
    unsub()
  })
})

describe('radio failure (NORDO)', () => {
  beforeEach(() => {
    gameState.reset()
    gameState.playerStations = [ControllerStation.GROUND, ControllerStation.TOWER, ControllerStation.APPROACH]
  })

  it('rejects commands to a NORDO aircraft before validation', () => {
    const ac = makeAircraft({ radioFailureUntilMs: 50_000 })
    gameState.addAircraft(ac)
    gameState.elapsedMs = 10_000 // inside the failure window

    const rejected: string[] = []
    const unsub = eventBus.on(GameEventType.COMMAND_REJECTED, (e) => rejected.push(e.payload.reason as string))
    const result = processCommand(
      { type: CommandType.ALTITUDE, targetCallsign: ac.callsign, params: { altitude: 11000 } },
      fakeAirport,
    )
    unsub()

    expect(result.success).toBe(false)
    expect(result.error).toContain('NORDO')
    expect(rejected).toEqual(['radio_failure'])
  })

  it('accepts commands again once the failure window passes', () => {
    const ac = makeAircraft({ radioFailureUntilMs: 50_000, radioFailureUsed: true })
    gameState.addAircraft(ac)
    gameState.elapsedMs = 60_000

    // Outside the window the guard no longer fires — the command now gets past
    // the NORDO check (validation may still reject it for other reasons, but
    // the rejection reason will not be radio_failure)
    expect(isNordo(ac, gameState.elapsedMs)).toBe(false)

    const rejected: string[] = []
    const unsub = eventBus.on(GameEventType.COMMAND_REJECTED, (e) => rejected.push(e.payload.reason as string))
    processCommand(
      { type: CommandType.ALTITUDE, targetCallsign: ac.callsign, params: { altitude: 11000 } },
      fakeAirport,
    )
    unsub()

    expect(rejected).not.toContain('radio_failure')
  })

  it('clears the NORDO window and logs the restoration once elapsed', () => {
    const ac = makeAircraft({ radioFailureUntilMs: 1_000, radioFailureUsed: true })
    gameState.addAircraft(ac)
    gameState.elapsedMs = 2_000 // tick advances elapsedMs before emergencies run
    const logsBefore = gameState.radioLog.length

    updateEmergencies(gameState, 2)
    expect(ac.radioFailureUntilMs).toBeNull()
    expect(gameState.radioLog.length).toBe(logsBefore + 1)
    expect(gameState.radioLog[gameState.radioLog.length - 1].message).toContain('radio restored')
  })

  it('never assigns a radio failure to an AI-controlled aircraft', () => {
    gameState.playerStations = [ControllerStation.GROUND] // APPROACH is AI
    const ac = makeAircraft({ controller: ControllerStation.APPROACH })
    gameState.addAircraft(ac)
    const random = vi.spyOn(Math, 'random').mockReturnValue(0.0000001) // would always trigger

    updateEmergencies(gameState, 1)

    random.mockRestore()
    expect(ac.radioFailureUsed).toBeUndefined()
    expect(ac.radioFailureUntilMs ?? null).toBeNull()
  })
})

describe('scoring integration', () => {
  beforeEach(() => {
    gameState.reset()
    gameState.playerStations = [ControllerStation.GROUND, ControllerStation.TOWER, ControllerStation.APPROACH]
  })

  it('a declared low-fuel landing earns the priority credit, not the standard landing delta', () => {
    const ac = makeAircraft({ controller: ControllerStation.TOWER, fuelDeclared: true })
    gameState.addAircraft(ac)
    const before = gameState.score

    eventBus.emit(GameEventType.LANDING, { callsign: ac.callsign, fuelPriority: true })

    expect(gameState.score - before).toBe(60) // SCORE_DELTAS.fuel_priority_landed
  })

  it('a fuel emergency (MAYDAY at zero fuel) costs the session', () => {
    const ac = makeAircraft({ controller: ControllerStation.APPROACH })
    gameState.addAircraft(ac)
    const before = gameState.score
    gameState.scoreDimensions.safety = 50 // dimensions clamp at 0 — seed room to fall

    eventBus.emit(GameEventType.FUEL_EMERGENCY, { callsign: ac.callsign })

    expect(gameState.score - before).toBe(-120) // SCORE_DELTAS.fuel_emergency
    expect(gameState.scoreDimensions.safety).toBeLessThan(50)
  })
})
