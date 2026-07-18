import { describe, it, expect, afterEach } from 'vitest'
import { executeCommand } from '../commands/command-executor'
import { validateCommand } from '../commands/command-validators'
import { AircraftPhase, CommandType, ControllerStation } from '../types'
import type { Aircraft, Airport, Command } from '../types'
import { buildTaxiwayGraph } from '../airport-loader'
import { moveAircraft } from '../movement'
import { processPhaseTransitions } from '../phase-transitions'
import { gameState } from '../game-state'
import { HOLD_SHORT_DISTANCE_NM } from '../constants'

/** Build a minimal valid Aircraft for testing */
function makeAircraft(overrides: Partial<Aircraft> = {}): Aircraft {
  return {
    id: '1',
    callsign: 'TST001',
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
    heading: 70,
    speed: 0,
    phase: AircraftPhase.PARKED,
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
    ...overrides,
  }
}

function makeAirport(): Airport {
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
    parking: [],
    frequencies: [],
    navaids: [],
    spawnPoints: [],
  }
}

function cmd(type: CommandType, params: Command['params'] = {}): Command {
  return { type, targetCallsign: 'TST001', params }
}

describe('validateCommand — regression: must not throw in ESM (former require() crash)', () => {
  it('validates TAXI from PARKED without throwing and returns null', () => {
    const aircraft = makeAircraft()
    const airport = makeAirport()
    expect(() => validateCommand(cmd(CommandType.TAXI, { runway: '07' }), aircraft, airport)).not.toThrow()
    expect(validateCommand(cmd(CommandType.TAXI, { runway: '07' }), aircraft, airport)).toBeNull()
  })

  it('rejects commands not allowed for the phase', () => {
    const aircraft = makeAircraft() // PARKED
    const airport = makeAirport()
    const err = validateCommand(cmd(CommandType.CLEARED_TAKEOFF), aircraft, airport)
    expect(err).toMatch(/not allowed in phase PARKED/)
  })
})

describe('executeCommand — departure phase wiring', () => {
  it('TAXI moves PARKED aircraft to TAXI_OUT with a hold-short taxi target', () => {
    const aircraft = makeAircraft()
    const airport = makeAirport()
    executeCommand(cmd(CommandType.TAXI, { runway: '07' }), aircraft, airport)

    expect(aircraft.phase).toBe(AircraftPhase.TAXI_OUT)
    expect(aircraft.controller).toBe(ControllerStation.GROUND)
    expect(aircraft.assignedRunway).toBe('07')
    expect(aircraft.taxiTarget).not.toBeNull()
    // Target sits just short of the threshold (0.05 NM back along the runway heading)
    const rwy = airport.runways[0]
    const dist = Math.hypot(aircraft.taxiTarget!.x - rwy.thresholdX, aircraft.taxiTarget!.y - rwy.thresholdY)
    expect(dist).toBeCloseTo(0.05, 5)
    expect(aircraft.speed).toBeGreaterThan(0)
  })

  it('LINE_UP_WAIT moves HOLD_SHORT aircraft to LINE_UP under tower', () => {
    const aircraft = makeAircraft({ phase: AircraftPhase.HOLD_SHORT, controller: ControllerStation.TOWER })
    executeCommand(cmd(CommandType.LINE_UP_WAIT), aircraft, makeAirport())
    expect(aircraft.phase).toBe(AircraftPhase.LINE_UP)
    expect(aircraft.controller).toBe(ControllerStation.TOWER)
  })

  it('CLEARED_TAKEOFF moves LINE_UP aircraft to TAKEOFF_ROLL', () => {
    const aircraft = makeAircraft({ phase: AircraftPhase.LINE_UP, controller: ControllerStation.TOWER })
    executeCommand(cmd(CommandType.CLEARED_TAKEOFF), aircraft, makeAirport())
    expect(aircraft.phase).toBe(AircraftPhase.TAKEOFF_ROLL)
  })

  it('CONTACT_DEPARTURE hands off a CLIMBING aircraft as DEPARTED', () => {
    const aircraft = makeAircraft({ phase: AircraftPhase.CLIMBING, controller: ControllerStation.TOWER, altitude: 9000, speed: 250 })
    executeCommand(cmd(CommandType.CONTACT_DEPARTURE), aircraft, makeAirport())
    expect(aircraft.handedOff).toBe(true)
    expect(aircraft.phase).toBe(AircraftPhase.DEPARTED)
  })
})

describe('executeCommand — arrival phase wiring', () => {
  it('CLEARED_APPROACH assigns the runway when none is set', () => {
    const aircraft = makeAircraft({ flightType: 'arrival', phase: AircraftPhase.APPROACH, controller: ControllerStation.APPROACH, altitude: 11000, speed: 210 })
    executeCommand(cmd(CommandType.CLEARED_APPROACH), aircraft, makeAirport())
    expect(aircraft.clearedForApproach).toBe(true)
    expect(aircraft.assignedRunway).toBe('07')
  })

  it('CLEARED_APPROACH keeps an already-assigned runway', () => {
    const aircraft = makeAircraft({ flightType: 'arrival', phase: AircraftPhase.APPROACH, controller: ControllerStation.APPROACH, assignedRunway: '25' })
    executeCommand(cmd(CommandType.CLEARED_APPROACH), aircraft, makeAirport())
    expect(aircraft.assignedRunway).toBe('25')
  })

  it('GO_AROUND on FINAL breaks off to MISSED with the runway\'s published missed-approach params', () => {
    const aircraft = makeAircraft({ flightType: 'arrival', phase: AircraftPhase.FINAL, controller: ControllerStation.TOWER, clearedToLand: true, urgent: false, altitude: 8200, speed: 140, assignedRunway: '07' })
    executeCommand(cmd(CommandType.GO_AROUND), aircraft, makeAirport())
    expect(aircraft.phase).toBe(AircraftPhase.MISSED)
    expect(aircraft.clearedToLand).toBe(false)
    expect(aircraft.missedHeading).toBe(170)
    expect(aircraft.missedAltitude).toBe(11500)
  })

  it('CONTACT_TOWER switches the controller without changing phase', () => {
    const aircraft = makeAircraft({ flightType: 'arrival', phase: AircraftPhase.APPROACH, controller: ControllerStation.APPROACH })
    executeCommand(cmd(CommandType.CONTACT_TOWER), aircraft, makeAirport())
    expect(aircraft.controller).toBe(ControllerStation.TOWER)
    expect(aircraft.phase).toBe(AircraftPhase.APPROACH)
    expect(aircraft.handedOff).toBe(true)
  })
})

describe('executeCommand — routed taxi along the taxiway graph', () => {
  /** Airport with a routable graph: gate node → mid → hold-short of 07/25 */
  function makeRoutedAirport(): Airport {
    const base = makeAirport()
    return {
      ...base,
      taxiways: [
        {
          id: 'TAXI',
          width: 23,
          surface: 'asphalt',
          nodes: [
            { id: 'n0', x: 0.1, y: 0.15, kind: 'gate', ref: 'G1' },
            { id: 'n1', x: -0.3, y: 0 },
            { id: 'n2', x: -0.72, y: -0.22, kind: 'hold-short', ref: '07/25' },
          ],
          edges: [
            { from: 'n0', to: 'n1' },
            { from: 'n1', to: 'n2' },
          ],
        },
      ],
    }
  }

  afterEach(() => {
    gameState.taxiwayGraph = null
  })

  it('TAXI sets a route ending at the runway hold-short node and the aircraft follows it there', () => {
    const airport = makeRoutedAirport()
    gameState.taxiwayGraph = buildTaxiwayGraph(airport)
    const aircraft = makeAircraft({ x: 0.1, y: 0.15 })

    executeCommand(cmd(CommandType.TAXI, { runway: '07' }), aircraft, airport)

    expect(aircraft.phase).toBe(AircraftPhase.TAXI_OUT)
    expect(aircraft.taxiRoute).not.toBeNull()
    const end = aircraft.taxiRoute![aircraft.taxiRoute!.length - 1]
    expect(end).toEqual({ x: -0.72, y: -0.22 })

    // Follow the route: waypoints advance and the aircraft stops at hold-short
    const runway = airport.runways[0]
    for (let t = 0; t < 600 && aircraft.phase !== AircraftPhase.HOLD_SHORT; t++) {
      moveAircraft(aircraft, 1, runway)
      processPhaseTransitions(aircraft, runway, airport)
    }
    expect(aircraft.phase).toBe(AircraftPhase.HOLD_SHORT)
    expect(aircraft.speed).toBe(0)
    // It stopped at the hold-short node (within the transition trigger radius),
    // not at the straight-line fallback point near the threshold
    expect(Math.hypot(aircraft.x - -0.72, aircraft.y - -0.22)).toBeLessThan(HOLD_SHORT_DISTANCE_NM + 0.01)
    // ...and passed through the mid waypoint (route index advanced past it)
    expect(aircraft.taxiRouteIndex).toBe(aircraft.taxiRoute!.length - 1)
  })

  it('LINE_UP_WAIT routes hold-short → runway entry → threshold, and the aircraft lines up on the numbers (T-009)', () => {
    const base = makeRoutedAirport()
    // Put a runway-entry node on the 07 centerline; the hold-short bar sits
    // just off it on the taxiway stub. Centerline runs (-0.8,-0.3)→(0.8,0.3).
    const airport: Airport = {
      ...base,
      taxiways: [{
        ...base.taxiways[0],
        nodes: [
          ...base.taxiways[0].nodes,
          { id: 'n3', x: -0.4, y: -0.15, kind: 'runway-entry', ref: '07/25' },
        ],
        edges: [...base.taxiways[0].edges, { from: 'n2', to: 'n3' }],
      }],
    }
    const rwy = airport.runways[0]
    const aircraft = makeAircraft({
      phase: AircraftPhase.HOLD_SHORT, controller: ControllerStation.TOWER,
      assignedRunway: '07', x: -0.45, y: -0.05, heading: 160,
    })

    executeCommand(cmd(CommandType.LINE_UP_WAIT), aircraft, airport)

    expect(aircraft.phase).toBe(AircraftPhase.LINE_UP)
    expect(aircraft.taxiRoute).toEqual([
      { x: -0.4, y: -0.15 },
      { x: rwy.thresholdX, y: rwy.thresholdY },
    ])

    // Follow the path: onto the centerline at the entry, backtrack to the
    // threshold, stop aligned with the runway heading
    for (let t = 0; t < 700; t++) {
      moveAircraft(aircraft, 1, rwy)
    }
    expect(aircraft.speed).toBe(0)
    expect(Math.hypot(aircraft.x - rwy.thresholdX, aircraft.y - rwy.thresholdY)).toBeLessThan(0.01)
    expect(Math.abs(aircraft.heading - rwy.trueHeading)).toBeLessThan(1)

    // CLEARED_TAKEOFF drops the line-up route so the roll isn't steered by it
    executeCommand(cmd(CommandType.CLEARED_TAKEOFF), aircraft, airport)
    expect(aircraft.taxiRoute).toBeNull()
    expect(aircraft.taxiTarget).toBeNull()
  })

  it('TAXI falls back to the straight-line hold-short target when no graph exists', () => {
    const airport = makeRoutedAirport()
    gameState.taxiwayGraph = null
    const aircraft = makeAircraft({ x: 0.1, y: 0.15 })

    executeCommand(cmd(CommandType.TAXI, { runway: '07' }), aircraft, airport)

    expect(aircraft.taxiRoute).toBeNull()
    const rwy = airport.runways[0]
    const dist = Math.hypot(aircraft.taxiTarget!.x - rwy.thresholdX, aircraft.taxiTarget!.y - rwy.thresholdY)
    expect(dist).toBeCloseTo(0.05, 5)
  })
})
