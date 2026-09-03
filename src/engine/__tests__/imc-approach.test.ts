import { describe, it, expect, afterEach } from 'vitest'
import { validateCommand } from '../commands/command-validators'
import { loadAirport } from '../airport-loader'
import { gameState } from '../game-state'
import { AircraftPhase, CommandType, ControllerStation, WakeCategory } from '../types'
import type { Aircraft, Airport, Command } from '../types'
import hhasData from '../../data/airports/hhas.airport.json'

/**
 * Regression: the CLEARED_APPROACH ILS gate used to be weather-only, so the
 * hard preset (IMC by definition) made every fixed-wing arrival un-clearable
 * at HHAS — no HHAS runway carries an ILS, so arrivals just overflew and were
 * removed at 20 NM. The gate is now a runway-CHOICE rule: it only applies at a
 * field that has an ILS somewhere.
 */

function makeArrival(overrides: Partial<Aircraft> = {}): Aircraft {
  return {
    id: 'imc-1',
    callsign: 'ETH302',
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
    squawk: '1234',
    x: 8,
    y: 0,
    altitude: 11000,
    heading: 250,
    speed: 210,
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

const approachCmd = (targetCallsign: string): Command => ({
  type: CommandType.CLEARED_APPROACH,
  targetCallsign,
  params: {},
})

/** Real HHAS: v1.1 file, ils false on every runway end. */
function hhas(): Airport {
  return loadAirport(hhasData as never)
}

/** Same field, but one runway end equipped — the ILS-capable case. */
function hhasWithIls(): Airport {
  const airport = hhas()
  const runways = airport.runways.map((r, i) =>
    i === 0 ? { ...r, ils: { frequency: 110.3, available: true } } : r
  )
  return { ...airport, runways }
}

describe('CLEARED_APPROACH in IMC', () => {
  const savedWind = gameState.wind

  afterEach(() => {
    gameState.wind = savedWind
  })

  function setIMC(): void {
    gameState.wind = { ...savedWind, visibilityNM: 2, ceiling: 700 }
    expect(gameState.getConditions()).toBe('IMC')
  }

  it('clears a fixed-wing arrival in IMC at a field with no ILS at all (HHAS)', () => {
    setIMC()
    const airport = hhas()
    expect(airport.runways.some(r => r.ils?.available)).toBe(false)

    const ac = makeArrival({ assignedRunway: airport.runways[0].id })
    expect(validateCommand(approachCmd(ac.callsign), ac, airport)).toBeNull()
  })

  it('still refuses the non-ILS end in IMC when the field HAS an ILS runway', () => {
    setIMC()
    const airport = hhasWithIls()
    const nonIlsRunway = airport.runways.find(r => !r.ils?.available)!

    const ac = makeArrival({ assignedRunway: nonIlsRunway.id })
    expect(validateCommand(approachCmd(ac.callsign), ac, airport))
      .toMatch(/ILS not available/)
  })

  it('clears the ILS-equipped end in IMC', () => {
    setIMC()
    const airport = hhasWithIls()
    const ilsRunway = airport.runways.find(r => r.ils?.available)!

    const ac = makeArrival({ assignedRunway: ilsRunway.id })
    expect(validateCommand(approachCmd(ac.callsign), ac, airport)).toBeNull()
  })

  it('clears any runway in VMC regardless of ILS equipment', () => {
    gameState.wind = { ...savedWind, visibilityNM: 8, ceiling: 3500 }
    expect(gameState.getConditions()).toBe('VMC')

    const airport = hhasWithIls()
    const nonIlsRunway = airport.runways.find(r => !r.ils?.available)!
    const ac = makeArrival({ assignedRunway: nonIlsRunway.id })
    expect(validateCommand(approachCmd(ac.callsign), ac, airport)).toBeNull()
  })
})
