import { describe, it, expect } from 'vitest'
import { executeCommand } from '../commands/command-executor'
import { validateCommand } from '../commands/command-validators'
import { AircraftPhase, CommandType, ControllerStation } from '../types'
import type { Aircraft, Airport, Command } from '../types'

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

  it('GO_AROUND on FINAL breaks off to MISSED with missed-approach params', () => {
    const aircraft = makeAircraft({ flightType: 'arrival', phase: AircraftPhase.FINAL, controller: ControllerStation.TOWER, clearedToLand: true, urgent: false, altitude: 8200, speed: 140 })
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
