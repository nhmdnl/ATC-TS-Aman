import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { gameState } from '../game-state'
import { eventBus } from '../event-bus'
import { GameEventType } from '../types'
import { moveAircraft, headingToRadians } from '../movement'
import { findRunwayById, loadAirport, selectActiveRunway } from '../airport-loader'
import { processPhaseTransitions } from '../phase-transitions'
import { nextExpectedCommand, runAiControllers } from '../ai-controller'
import { AircraftPhase, CommandType, ControllerStation, WakeCategory } from '../types'
import type { Aircraft } from '../types'
import hhasData from '../../data/airports/hhas.airport.json'

function makeAircraft(overrides: Partial<Aircraft> = {}): Aircraft {
  return {
    id: 'ai-1',
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
    altitude: 0,
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
    departureHandoffAlt: null,
    pendingPilotCall: null,
    withYouCallFired: false,
    awaitingCrossingRunway: null,
    ...overrides,
  }
}

describe('nextExpectedCommand', () => {
  it('returns TAXI for PARKED', () => {
    expect(nextExpectedCommand(makeAircraft({ phase: AircraftPhase.READY_TO_TAXI }))).toBe(CommandType.TAXI)
  })

  it('returns LINE_UP_WAIT for HOLD_SHORT', () => {
    expect(nextExpectedCommand(makeAircraft({ phase: AircraftPhase.HOLD_SHORT }))).toBe(CommandType.LINE_UP_WAIT)
  })

  it('returns CLEARED_TAKEOFF for LINE_UP', () => {
    expect(nextExpectedCommand(makeAircraft({ phase: AircraftPhase.LINE_UP }))).toBe(CommandType.CLEARED_TAKEOFF)
  })

  it('returns CONTACT_DEPARTURE for CLIMBING', () => {
    expect(nextExpectedCommand(makeAircraft({ phase: AircraftPhase.CLIMBING }))).toBe(CommandType.CONTACT_DEPARTURE)
  })

  it('returns CLEARED_APPROACH for APPROACH when not yet cleared', () => {
    expect(nextExpectedCommand(makeAircraft({ phase: AircraftPhase.APPROACH, clearedForApproach: false }))).toBe(CommandType.CLEARED_APPROACH)
  })

  it('returns CONTACT_TOWER for APPROACH once cleared', () => {
    expect(nextExpectedCommand(makeAircraft({ phase: AircraftPhase.APPROACH, clearedForApproach: true }))).toBe(CommandType.CONTACT_TOWER)
  })

  it('returns null for APPROACH once the tower handoff is already done (no re-issue)', () => {
    expect(nextExpectedCommand(makeAircraft({ phase: AircraftPhase.APPROACH, clearedForApproach: true, handedOff: true }))).toBeNull()
  })

  it('returns CLEARED_LAND for FINAL when not in violation', () => {
    expect(nextExpectedCommand(makeAircraft({ phase: AircraftPhase.FINAL, inViolation: false }))).toBe(CommandType.CLEARED_LAND)
  })

  it('returns null for FINAL when in an active violation (safety branch)', () => {
    expect(nextExpectedCommand(makeAircraft({ phase: AircraftPhase.FINAL, inViolation: true }))).toBeNull()
  })

  it('returns null for FINAL once already cleared to land (no re-issue)', () => {
    expect(nextExpectedCommand(makeAircraft({ phase: AircraftPhase.FINAL, clearedToLand: true }))).toBeNull()
  })

  it('returns null for phases with nothing left to command', () => {
    expect(nextExpectedCommand(makeAircraft({ phase: AircraftPhase.ENTERING }))).toBeNull()
    expect(nextExpectedCommand(makeAircraft({ phase: AircraftPhase.TAXI_OUT }))).toBeNull()
    expect(nextExpectedCommand(makeAircraft({ phase: AircraftPhase.TAKEOFF_ROLL }))).toBeNull()
    expect(nextExpectedCommand(makeAircraft({ phase: AircraftPhase.LANDING }))).toBeNull()
    expect(nextExpectedCommand(makeAircraft({ phase: AircraftPhase.ROLLOUT }))).toBeNull()
    // TAXI_IN needs no command: PHASE_CONTROLLER already moved it to GROUND
    // and the ROLLOUT transition aimed it at its gate.
    expect(nextExpectedCommand(makeAircraft({ phase: AircraftPhase.TAXI_IN }))).toBeNull()
    expect(nextExpectedCommand(makeAircraft({ phase: AircraftPhase.ARRIVED }))).toBeNull()
    expect(nextExpectedCommand(makeAircraft({ phase: AircraftPhase.DEPARTED }))).toBeNull()
    expect(nextExpectedCommand(makeAircraft({ phase: AircraftPhase.MISSED }))).toBeNull()
  })
})

describe('runAiControllers — integration, real HHAS data + real command pipeline', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    gameState.reset()
  })

  afterEach(() => {
    vi.useRealTimers()
    gameState.reset()
  })

  it('carries an arrival from APPROACH to ARRIVED with zero player-issued commands', () => {
    gameState.airport = loadAirport(hhasData)
    gameState.playerStations = [] // nothing is player-controlled — the AI must do everything

    const issued: CommandType[] = []
    const unsubscribe = eventBus.on(GameEventType.COMMAND_ISSUED, (event) => {
      issued.push(event.payload.commandType as CommandType)
    })

    const rwy = selectActiveRunway(gameState.airport, gameState.wind)!
    const rad = headingToRadians(rwy.trueHeading)
    const aircraft = makeAircraft({
      x: rwy.thresholdX - Math.cos(rad) * 8,
      y: rwy.thresholdY - Math.sin(rad) * 8,
      heading: rwy.trueHeading,
      altitude: rwy.elevationFt + 8 * 318 + 200,
      lastCommandTime: Date.now(),
    })
    gameState.addAircraft(aircraft)

    // 30 simulated minutes at 1 Hz, same bound as the existing arrival-lifecycle
    // test — plenty for 8 NM + rollout + taxi. Each iteration also advances the
    // fake clock by more than the readback delay (max 2500ms) and the AI's own
    // pacing interval (4000ms), so a pending command actually executes and the
    // AI is free to issue its next one before the next simulated second ticks.
    for (let t = 0; t < 1800 && aircraft.phase !== AircraftPhase.ARRIVED; t++) {
      const runway = aircraft.assignedRunway ? findRunwayById(gameState.airport, aircraft.assignedRunway) : null
      moveAircraft(aircraft, 1, runway)
      processPhaseTransitions(aircraft, runway, gameState.airport)
      runAiControllers(gameState, Date.now())
      vi.advanceTimersByTime(4100)
    }

    unsubscribe()
    expect(aircraft.phase).toBe(AircraftPhase.ARRIVED)
    // The satisfied-command guards make the AI issue each command exactly
    // once — without them this arrival generates ~146 commands instead of 3.
    expect(issued).toEqual([
      CommandType.CLEARED_APPROACH,
      CommandType.CONTACT_TOWER,
      CommandType.CLEARED_LAND,
      CommandType.EXIT_RUNWAY,
      CommandType.TAXI,
    ])
  })
})

describe('AI approach clearance in IMC at an ILS field (escalation 2026-08-26)', () => {
  /** HHAS with one precision end, so the ILS runway-choice rule can actually
   *  bite. Real HHAS has `ils: false` on all four ends, which is exactly why
   *  this bug was unreachable in a normal session and sat open. */
  function ilsFieldData(): unknown {
    const clone = structuredClone(hhasData) as any
    clone.objects[0].ops.forward.ils = true
    return clone
  }

  beforeEach(() => {
    vi.useFakeTimers()
    gameState.reset()
  })

  afterEach(() => {
    vi.useRealTimers()
    gameState.reset()
  })

  it('selectActiveRunway can require a precision end', () => {
    const plain = loadAirport(hhasData)
    // HHAS has no ILS anywhere — nothing qualifies, and the caller gets null
    // rather than a non-precision end it did not ask for.
    expect(selectActiveRunway(plain, gameState.wind, { requireIls: true })).toBeNull()
    // The unfiltered call is unchanged.
    expect(selectActiveRunway(plain, gameState.wind)).not.toBeNull()

    const withIls = loadAirport(ilsFieldData() as never)
    const picked = selectActiveRunway(withIls, gameState.wind, { requireIls: true })
    expect(picked).not.toBeNull()
    expect(picked!.ils?.available).toBe(true)
  })

  it('re-assigns to the precision runway instead of re-issuing a refused clearance', () => {
    gameState.airport = loadAirport(ilsFieldData() as never)
    gameState.playerStations = []
    // IMC per GameState.getConditions: visibility < 3 NM and ceiling < 1000 ft
    gameState.wind = { ...gameState.wind, visibilityNM: 2, ceiling: 700 }
    expect(gameState.getConditions()).toBe('IMC')

    const precision = gameState.airport.runways.find(r => r.ils?.available)!
    const nonPrecision = gameState.airport.runways.find(r => !r.ils?.available)!

    const rejected: string[] = []
    const unsubscribe = eventBus.on(GameEventType.COMMAND_REJECTED, (event) => {
      rejected.push(event.payload.commandType as string)
    })

    const aircraft = makeAircraft({
      // What wind-based selection at spawn would have handed it.
      assignedRunway: nonPrecision.id,
      lastCommandTime: 0,
    })
    gameState.addAircraft(aircraft)

    for (let t = 0; t < 5 && !aircraft.clearedForApproach; t++) {
      runAiControllers(gameState, Date.now())
      vi.advanceTimersByTime(4100)
    }
    unsubscribe()

    expect(aircraft.clearedForApproach).toBe(true)
    expect(aircraft.assignedRunway).toBe(precision.id)
    // The point of the fix: it validated as issued. Before this, the clearance
    // was refused every tick and clearedForApproach never became true.
    expect(rejected).toEqual([])
  })

  it('leaves the runway alone in VMC, and at a field with no ILS at all', () => {
    gameState.airport = loadAirport(ilsFieldData() as never)
    gameState.playerStations = []
    // VMC — the precision rule must not reach in and move traffic.
    gameState.wind = { ...gameState.wind, visibilityNM: 8, ceiling: 3500 }
    expect(gameState.getConditions()).toBe('VMC')

    const nonPrecision = gameState.airport.runways.find(r => !r.ils?.available)!
    const aircraft = makeAircraft({ assignedRunway: nonPrecision.id, lastCommandTime: 0 })
    gameState.addAircraft(aircraft)

    for (let t = 0; t < 5 && !aircraft.clearedForApproach; t++) {
      runAiControllers(gameState, Date.now())
      vi.advanceTimersByTime(4100)
    }

    expect(aircraft.clearedForApproach).toBe(true)
    expect(aircraft.assignedRunway).toBe(nonPrecision.id)
  })
})
