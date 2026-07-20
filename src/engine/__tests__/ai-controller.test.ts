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
      CommandType.TAXI,
    ])
  })
})
