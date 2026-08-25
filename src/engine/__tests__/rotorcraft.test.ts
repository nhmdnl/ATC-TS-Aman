import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { loadAirport, findHelipadById } from '../airport-loader'
import { moveAircraft } from '../movement'
import { processPhaseTransitions } from '../phase-transitions'
import { executeCommand } from '../commands/command-executor'
import { validateCommand } from '../commands/command-validators'
import { nextExpectedCommand, runAiControllers } from '../ai-controller'
import { trafficScheduler } from '../traffic-scheduler'
import type { ScheduledFlight } from '../traffic-scheduler'
import { gameState } from '../game-state'
import { eventBus } from '../event-bus'
import { GameEventType, AircraftPhase, CommandType, ControllerStation, WakeCategory } from '../types'
import type { Aircraft, AircraftType, Airport, Command } from '../types'
import hhasData from '../../data/airports/hhas.airport.json'

/**
 * T-014 — end-to-end rotorcraft coverage: validators reject ground-movement
 * clearances, departures liftoff vertically from a pad into the existing
 * climb FSM, arrivals land directly on their assigned helipad, the AI tower
 * handles uncontrolled pads, and the scheduler routes rotor spawns to pads.
 */

const HELI_TYPE: AircraftType = {
  icao: 'H135',
  name: 'Airbus H135',
  category: 'L',
  approachCategory: 'C',
  wakeCategory: WakeCategory.LIGHT,
  aircraftClass: 'HELICOPTER',
  rotorcraft: true,
  cruiseSpeed: 132,
  approachSpeed: 70,
  rotationSpeed: 0,
  taxiSpeed: 25,
  climbRate: 1400,
  descentRate: 1000,
  serviceCeiling: 20000,
  minRunwayLengthFt: 0,
}

function makeHelicopter(overrides: Partial<Aircraft> = {}): Aircraft {
  return {
    id: 'rtd-1',
    callsign: 'HMS501',
    type: HELI_TYPE,
    flightType: 'departure',
    squawk: '1234',
    x: 0.1,
    y: -0.2,
    altitude: 0,
    heading: 90,
    speed: 0,
    phase: AircraftPhase.AT_GATE,
    controller: ControllerStation.GROUND,
    clearedHeading: null,
    clearedAltitude: null,
    clearedSpeed: null,
    clearedToLand: false,
    clearedForApproach: false,
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

function makeHeliportAirport(): Airport {
  return {
    version: 1,
    metadata: { icao: 'HHAS', iata: 'ASM', name: 'Asmara Intl', country: 'ER', elevationFt: 7661, magneticVariation: 2 },
    runways: [
      {
        id: '07',
        trueHeading: 70,
        magneticHeading: 68,
        length: 9843,
        width: 148,
        surface: 'asphalt',
        elevationFt: 7661,
        thresholdX: -0.8,
        thresholdY: -0.3,
        endX: 0.8,
        endY: 0.3,
        displacedThresholdFt: 0,
        ils: null,
        pattern: 'left',
        stepdowns: [],
        missedHeading: 170,
        missedAltitude: 11500,
      },
    ],
    taxiways: [],
    gates: [{ id: 'G1', x: 0.1, y: 0.15, taxiwayId: '' }],
    heliports: [
      { id: 'H1', x: 0.1, y: -0.2, taxiwayId: '' },
      { id: 'H2', x: 0.18, y: -0.26, taxiwayId: '' },
    ],
    parking: [],
    frequencies: [],
    navaids: [],
    spawnPoints: [
      { id: 'ARR_S', type: 'arrival', x: 0, y: -15, heading: 0, altitude: 11000 },
    ],
  }
}

function cmd(type: CommandType, params: Command['params'] = {}): Command {
  return { type, targetCallsign: 'HMS501', params }
}

describe('validateCommand — rotorcraft ground clearances rejected', () => {
  const cases: Array<[CommandType, AircraftPhase]> = [
    [CommandType.PUSHBACK_APPROVED, AircraftPhase.AWAITING_PUSHBACK],
    [CommandType.TAXI, AircraftPhase.READY_TO_TAXI],
    [CommandType.HOLD_SHORT, AircraftPhase.TAXI_OUT],
    [CommandType.CROSS_RUNWAY, AircraftPhase.TAXI_OUT],
    [CommandType.CONTINUE_TAXI, AircraftPhase.TAXI_IN],
    [CommandType.LINE_UP_WAIT, AircraftPhase.HOLD_SHORT],
    [CommandType.EXIT_RUNWAY, AircraftPhase.ROLLOUT],
  ]

  for (const [type, phase] of cases) {
    it(`rejects ${type} in ${phase}`, () => {
      const err = validateCommand(cmd(type), makeHelicopter({ phase }), makeHeliportAirport())
      expect(err).toContain('rotorcraft')
    })
  }

  it('allows CLEARED_TAKEOFF straight from AT_GATE (no taxi chain)', () => {
    const err = validateCommand(cmd(CommandType.CLEARED_TAKEOFF), makeHelicopter(), makeHeliportAirport())
    expect(err).toBeNull()
  })

  it('allows ALTITUDE and SPEED while CLIMBING', () => {
    const ac = makeHelicopter({ phase: AircraftPhase.CLIMBING, flightType: 'departure' })
    expect(validateCommand(cmd(CommandType.ALTITUDE, { altitude: 15000 }), ac, makeHeliportAirport())).toBeNull()
    expect(validateCommand(cmd(CommandType.SPEED, { speed: 100 }), ac, makeHeliportAirport())).toBeNull()
  })

  it('allows CLEARED_APPROACH at APPROACH and CLEARED_LAND at FINAL', () => {
    const airport = makeHeliportAirport()
    const approaching = makeHelicopter({ phase: AircraftPhase.APPROACH, flightType: 'arrival' })
    expect(validateCommand(cmd(CommandType.CLEARED_APPROACH), approaching, airport)).toBeNull()
    const final = makeHelicopter({ phase: AircraftPhase.FINAL, flightType: 'arrival' })
    expect(validateCommand(cmd(CommandType.CLEARED_LAND), final, airport)).toBeNull()
  })
})

describe('rotorcraft departure lifecycle — vertical liftoff into the climb FSM', () => {
  beforeEach(() => {
    gameState.reset()
  })

  afterEach(() => {
    gameState.reset()
  })

  it('AT_GATE → CLIMBING on liftoff clearance, climbs vertically, then DEPARTED', () => {
    const airport = makeHeliportAirport()
    const pad = findHelipadById(airport, 'H1')!
    const rwy = airport.runways[0]
    const ac = makeHelicopter({ x: pad.x, y: pad.y })
    gameState.addAircraft(ac)

    const events: GameEventType[] = []
    const unsubscribe = eventBus.on(GameEventType.TAKEOFF, () => events.push(GameEventType.TAKEOFF))

    // No pushback call may ever fire for a rotorcraft
    ac.pushbackCallAt = Date.now() - 1000
    processPhaseTransitions(ac, rwy, airport, pad)
    expect(ac.phase).toBe(AircraftPhase.AT_GATE)
    expect(ac.pendingPilotCall).toBeNull()

    executeCommand(cmd(CommandType.CLEARED_TAKEOFF), ac, airport)
    expect(ac.phase).toBe(AircraftPhase.CLIMBING)
    expect(ac.departureHandoffAlt).not.toBeNull()
    expect(events).toEqual([GameEventType.TAKEOFF])

    // Vertical climb: position frozen while below ~500 ft above the field
    const startX = ac.x
    const startY = ac.y
    for (let t = 0; t < 10; t++) {
      moveAircraft(ac, 1, rwy, pad)
      processPhaseTransitions(ac, rwy, airport, pad)
    }
    expect(ac.x).toBe(startX)
    expect(ac.y).toBe(startY)
    expect(ac.altitude).toBeGreaterThan(0)
    expect(ac.altitude).toBeLessThan(500) // still in the vertical climb window

    // Forward flight begins once airborne, then the standard handoff applies
    for (let t = 0; t < 1200 && ac.phase !== AircraftPhase.DEPARTED; t++) {
      moveAircraft(ac, 1, rwy, pad)
      processPhaseTransitions(ac, rwy, airport, pad)
    }
    unsubscribe()
    expect(ac.phase).toBe(AircraftPhase.DEPARTED)
    expect(ac.handedOff).toBe(true)
    expect(ac.altitude).toBeGreaterThanOrEqual(10000)
  })
})

describe('rotorcraft arrival lifecycle — straight to the pad, no rollout/taxi', () => {
  beforeEach(() => {
    gameState.reset()
  })

  afterEach(() => {
    gameState.reset()
  })

  it('APPROACH → FINAL → LANDING → ARRIVED on the assigned helipad', () => {
    const airport = makeHeliportAirport()
    const pad = findHelipadById(airport, 'H1')!
    const rwy = airport.runways[0]

    // 6 NM due south of the pad, pointing at it, ~3000 ft above the field
    const ac = makeHelicopter({
      flightType: 'arrival',
      phase: AircraftPhase.APPROACH,
      controller: ControllerStation.APPROACH,
      x: pad.x,
      y: pad.y - 6,
      heading: 0,
      altitude: rwy.elevationFt + 3000,
      speed: 120,
    })
    gameState.addAircraft(ac)

    const events: GameEventType[] = []
    const unsubLand = eventBus.on(GameEventType.LANDING, () => events.push(GameEventType.LANDING))
    const unsubGate = eventBus.on(GameEventType.ARRIVED_GATE, () => events.push(GameEventType.ARRIVED_GATE))

    executeCommand(cmd(CommandType.CLEARED_APPROACH), ac, airport)
    // Rotorcraft approach their pad — no runway may be auto-assigned
    expect(ac.assignedRunway).toBeNull()

    executeCommand(cmd(CommandType.CLEARED_LAND), ac, airport)

    const seen = new Set<AircraftPhase>([ac.phase])
    for (let t = 0; t < 900 && ac.phase !== AircraftPhase.ARRIVED; t++) {
      moveAircraft(ac, 1, rwy, pad)
      processPhaseTransitions(ac, rwy, airport, pad)
      seen.add(ac.phase)
    }
    unsubLand()
    unsubGate()

    expect(ac.phase).toBe(AircraftPhase.ARRIVED)
    expect(seen).toContain(AircraftPhase.FINAL)
    expect(seen).toContain(AircraftPhase.LANDING)
    expect(seen.has(AircraftPhase.ROLLOUT)).toBe(false)
    expect(seen.has(AircraftPhase.VACATED)).toBe(false)
    expect(seen.has(AircraftPhase.TAXI_IN)).toBe(false)
    expect(ac.x).toBe(pad.x)
    expect(ac.y).toBe(pad.y)
    expect(ac.speed).toBe(0)
    expect(events).toEqual([GameEventType.LANDING, GameEventType.ARRIVED_GATE])
  })

  it('auto go-arounds from FINAL when not cleared to land', () => {
    const airport = makeHeliportAirport()
    const pad = findHelipadById(airport, 'H1')!
    const rwy = airport.runways[0]
    const ac = makeHelicopter({
      flightType: 'arrival',
      phase: AircraftPhase.FINAL,
      controller: ControllerStation.TOWER,
      x: pad.x,
      y: pad.y - 0.03,
      heading: 0,
      altitude: rwy.elevationFt + 400,
      speed: 80,
    })
    // Deliberately no CLEARED_LAND

    for (let t = 0; t < 300 && ac.phase !== AircraftPhase.MISSED; t++) {
      moveAircraft(ac, 1, rwy, pad)
      processPhaseTransitions(ac, rwy, airport, pad)
    }

    expect(ac.phase).toBe(AircraftPhase.MISSED)
    expect(ac.missedHeading).not.toBeNull()
    expect(ac.missedAltitude!).toBeGreaterThan(rwy.elevationFt)
  })
})

describe('ai-controller — rotorcraft handling', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    gameState.reset()
  })

  afterEach(() => {
    vi.useRealTimers()
    gameState.reset()
  })

  it('nextExpectedCommand issues a liftoff clearance at the pad', () => {
    expect(nextExpectedCommand(makeHelicopter())).toBe(CommandType.CLEARED_TAKEOFF)
  })

  it('AI tower clears liftoff even though PHASE_CONTROLLER maps AT_GATE to GROUND', () => {
    gameState.airport = makeHeliportAirport()
    gameState.playerStations = [ControllerStation.GROUND] // tower is AI-run

    const issued: CommandType[] = []
    const unsubscribe = eventBus.on(GameEventType.COMMAND_ISSUED, (event) => {
      issued.push(event.payload.commandType as CommandType)
    })

    const ac = makeHelicopter({ controller: ControllerStation.GROUND, lastCommandTime: Date.now() - 5000 })
    gameState.addAircraft(ac)

    runAiControllers(gameState, Date.now())
    unsubscribe()

    expect(issued).toEqual([CommandType.CLEARED_TAKEOFF])
  })
})

describe('traffic-scheduler — rotorcraft spawn routing', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    gameState.reset()
    trafficScheduler.reset()
  })

  afterEach(() => {
    vi.useRealTimers()
    gameState.reset()
    trafficScheduler.reset()
  })

  it('spawns scheduled rotorcraft departures at their named helipad', () => {
    gameState.airport = makeHeliportAirport()
    gameState.elapsedMs = 10_000
    const flights: ScheduledFlight[] = [
      { callsign: 'HMS501', flightType: 'departure', aircraftIcao: 'H135', offsetMs: 0, gate: 'H2' },
    ]

    trafficScheduler.tick(gameState, flights)

    const spawned = gameState.allAircraft()
    expect(spawned).toHaveLength(1)
    const ac = spawned[0]
    expect(ac.type.rotorcraft).toBe(true)
    expect(ac.phase).toBe(AircraftPhase.AT_GATE)
    expect(ac.assignedGate).toBe('H2')
    const pad = findHelipadById(gameState.airport!, 'H2')!
    expect(ac.x).toBe(pad.x)
    expect(ac.y).toBe(pad.y)
  })

  it('assigns scheduled rotorcraft arrivals a free helipad instead of a runway', () => {
    gameState.airport = makeHeliportAirport()
    gameState.elapsedMs = 10_000
    const flights: ScheduledFlight[] = [
      { callsign: 'HMS502', flightType: 'arrival', aircraftIcao: 'H125', offsetMs: 0 },
    ]

    trafficScheduler.tick(gameState, flights)

    const spawned = gameState.allAircraft()
    expect(spawned).toHaveLength(1)
    const ac = spawned[0]
    expect(ac.type.rotorcraft).toBe(true)
    expect(ac.phase).toBe(AircraftPhase.ENTERING)
    expect(ac.assignedGate).not.toBeNull()
    expect(['H1', 'H2']).toContain(ac.assignedGate!)
    expect(gameState.occupiedGateIds.has(ac.assignedGate!)).toBe(true)
  })

  it('does not spawn a rotorcraft departure when all pads are occupied', () => {
    gameState.airport = makeHeliportAirport()
    gameState.elapsedMs = 10_000
    gameState.occupiedGateIds.add('H1')
    gameState.occupiedGateIds.add('H2')
    const flights: ScheduledFlight[] = [
      { callsign: 'HMS503', flightType: 'departure', aircraftIcao: 'H135', offsetMs: 0 },
    ]

    trafficScheduler.tick(gameState, flights)

    expect(gameState.allAircraft()).toHaveLength(0)
    // Not marked spawned — retried when a pad frees up
    trafficScheduler.tick(gameState, flights)
    expect(gameState.allAircraft()).toHaveLength(0)
  })
})

describe('loadAirport — real HHAS data still loads without heliports (T-013 guard)', () => {
  it('defaults heliports to an empty array', () => {
    const airport = loadAirport(hhasData)
    expect(airport.heliports).toEqual([])
  })
})
