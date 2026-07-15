import { describe, it, expect } from 'vitest'
import { loadAirport, findRunwayById, selectActiveRunway } from '../airport-loader'
import { moveAircraft, headingToRadians } from '../movement'
import { processPhaseTransitions } from '../phase-transitions'
import { gameState } from '../game-state'
import { executeCommand } from '../commands/command-executor'
import { AircraftPhase, CommandType, ControllerStation } from '../types'
import type { Aircraft, Command } from '../types'
import hhasData from '../../data/airports/hhas.airport.json'

/**
 * Integration test: an arrival must be able to complete the whole
 * APPROACH → FINAL → LANDING → ROLLOUT → TAXI_IN → ARRIVED lifecycle when
 * given the standard clearances. This drives the real airport data, movement,
 * phase-transition, and command-executor code together — it is the engine-side
 * guarantee behind "the game is completable".
 */

function cmd(type: CommandType, callsign: string): Command {
  return { type, targetCallsign: callsign, params: {} }
}

function makeArrival(x: number, y: number, heading: number, altitude: number): Aircraft {
  return {
    id: 'arr-1',
    callsign: 'TST123',
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
    flightType: 'arrival',
    squawk: '4521',
    x,
    y,
    altitude,
    heading,
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
  }
}

describe('arrival lifecycle (integration, real HHAS data)', () => {
  it('completes APPROACH → ARRIVED with approach + landing clearance', () => {
    const airport = loadAirport(hhasData)
    // Use the same active-runway pick the engine makes, so CLEARED_APPROACH
    // assigns the runway this aircraft is actually lined up on
    const rwy = selectActiveRunway(airport, gameState.wind)!

    // Start 8 NM out on the extended centerline, on glideslope (~318 ft/NM),
    // pointed at the runway.
    const rad = headingToRadians(rwy.trueHeading)
    const startX = rwy.thresholdX - Math.cos(rad) * 8
    const startY = rwy.thresholdY - Math.sin(rad) * 8
    const startAlt = rwy.elevationFt + 8 * 318 + 200
    const aircraft = makeArrival(startX, startY, rwy.trueHeading, startAlt)

    executeCommand(cmd(CommandType.CLEARED_APPROACH, aircraft.callsign), aircraft, airport)
    expect(aircraft.assignedRunway).toBe(rwy.id)
    executeCommand(cmd(CommandType.CLEARED_LAND, aircraft.callsign), aircraft, airport)
    expect(aircraft.clearedToLand).toBe(true)

    const seenPhases = new Set<AircraftPhase>([aircraft.phase])
    // 30 simulated minutes at 1 Hz is more than enough for 8 NM + rollout + taxi
    for (let t = 0; t < 1800 && aircraft.phase !== AircraftPhase.ARRIVED; t++) {
      const runway = aircraft.assignedRunway ? findRunwayById(airport, aircraft.assignedRunway) : null
      moveAircraft(aircraft, 1, runway)
      processPhaseTransitions(aircraft, runway, airport)
      seenPhases.add(aircraft.phase)
    }

    expect(seenPhases.has(AircraftPhase.FINAL)).toBe(true)
    expect(seenPhases.has(AircraftPhase.LANDING)).toBe(true)
    expect(seenPhases.has(AircraftPhase.ROLLOUT)).toBe(true)
    expect(aircraft.phase).toBe(AircraftPhase.ARRIVED)
    expect(seenPhases.has(AircraftPhase.MISSED)).toBe(false)
    // Good landing teleports to parking — the aircraft ends on its gate
    const gate = airport.gates.find((g) => g.id === aircraft.assignedGate)!
    expect(aircraft.x).toBe(gate.x)
    expect(aircraft.y).toBe(gate.y)
  })

  it('goes around from FINAL when not cleared to land', () => {
    const airport = loadAirport(hhasData)
    const rwy = selectActiveRunway(airport, gameState.wind)!
    const rad = headingToRadians(rwy.trueHeading)
    const aircraft = makeArrival(
      rwy.thresholdX - Math.cos(rad) * 4,
      rwy.thresholdY - Math.sin(rad) * 4,
      rwy.trueHeading,
      rwy.elevationFt + 4 * 318,
    )
    executeCommand(cmd(CommandType.CLEARED_APPROACH, aircraft.callsign), aircraft, airport)
    // Deliberately no CLEARED_LAND

    for (let t = 0; t < 600 && aircraft.phase !== AircraftPhase.MISSED; t++) {
      const runway = findRunwayById(airport, aircraft.assignedRunway!)
      moveAircraft(aircraft, 1, runway)
      processPhaseTransitions(aircraft, runway, airport)
    }

    expect(aircraft.phase).toBe(AircraftPhase.MISSED)
    // HHAS "1.1" file carries real ops data (170/11500 from the chart)
    expect(aircraft.missedHeading).toBe(170)
    expect(aircraft.missedAltitude).toBe(11500)
  })

  it('teleports to the first free gate at end of ROLLOUT and marks it occupied', () => {
    const airport = loadAirport(hhasData)
    gameState.occupiedGateIds.clear()
    gameState.occupiedGateIds.add('G1') // e.g. a departure is still boarding there

    const rwy = selectActiveRunway(airport, gameState.wind)!
    const aircraft = makeArrival(rwy.thresholdX, rwy.thresholdY, rwy.trueHeading, rwy.elevationFt)
    aircraft.phase = AircraftPhase.ROLLOUT
    aircraft.speed = 5

    processPhaseTransitions(aircraft, rwy, airport)

    expect(aircraft.phase).toBe(AircraftPhase.ARRIVED)
    expect(aircraft.assignedGate).toBe('G2')
    expect(gameState.occupiedGateIds.has('G2')).toBe(true)
    const gate = airport.gates.find((g) => g.id === 'G2')!
    expect(aircraft.x).toBe(gate.x)
    expect(aircraft.y).toBe(gate.y)
    gameState.occupiedGateIds.clear()
  })
})
