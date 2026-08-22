import type { Aircraft, AircraftType, GateData, SpawnPointData, Airport } from './types'
import { AircraftPhase, ControllerStation } from './types'
import { AIRCRAFT_TYPES, AIRLINE_PREFIXES, PHASE_CONTROLLER, SEPARATION_FT, MRS_NM, PUSHBACK_CALL_DELAY_MS } from './constants'
import { distanceNM } from './movement'
import { filterSuitableAircraftTypes } from './airport-loader'

/**
 * True when no existing traffic sits close enough to a spawn point that a
 * new arrival there would violate (or immediately converge into) separation.
 * Uses MRS_NM * 2 as minimum clear distance.
 */
export function isSpawnPointClear(point: SpawnPointData, traffic: Aircraft[]): boolean {
  return !traffic.some(ac =>
    distanceNM(ac.x, ac.y, point.x, point.y) < MRS_NM * 2 &&
    Math.abs(ac.altitude - point.altitude) < SEPARATION_FT)
}

function generateCallsign(): string {
  const prefix = AIRLINE_PREFIXES[Math.floor(Math.random() * AIRLINE_PREFIXES.length)].prefix
  const number = Math.floor(Math.random() * 9000) + 100
  return `${prefix}${number}`
}

function generateSquawk(): string {
  let squawk = ''
  for (let i = 0; i < 4; i++) squawk += Math.floor(Math.random() * 8).toString()
  return squawk
}

export function randomAircraftType(airport?: Airport): AircraftType {
  const catalog = airport ? filterSuitableAircraftTypes(airport) : AIRCRAFT_TYPES
  return catalog[Math.floor(Math.random() * catalog.length)]
}

function generateId(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID()
  return Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15)
}

/**
 * Spawn a new departure at a gate.
 * Starts in AT_GATE — the pilot will call for pushback after PUSHBACK_CALL_DELAY_MS.
 */
export function spawnDeparture(gate: GateData, runwayId: string, callsign?: string, overrideType?: AircraftType, airport?: Airport): Aircraft {
  const type = overrideType ?? randomAircraftType(airport)
  const phase = AircraftPhase.AT_GATE
  const now = Date.now()

  return {
    id: generateId(),
    callsign: callsign ?? generateCallsign(),
    type,
    flightType: 'departure',
    squawk: generateSquawk(),

    x: gate.x,
    y: gate.y,
    altitude: 0,
    heading: 90,
    speed: 0,

    phase,
    controller: PHASE_CONTROLLER[phase],

    clearedHeading: null,
    clearedAltitude: null,
    clearedSpeed: null,
    clearedToLand: false,
    clearedForApproach: false,

    assignedRunway: runwayId,
    assignedTaxiway: gate.taxiwayId,
    assignedGate: gate.id,
    taxiTarget: null,
    taxiRoute: null,
    taxiRouteIndex: 0,

    pushbackCallAt: now + PUSHBACK_CALL_DELAY_MS,
    pushbackHeading: null,
    departureHandoffAlt: null,

    pendingPilotCall: null,
    withYouCallFired: false,
    awaitingCrossingRunway: null,

    spawnTime: now,
    lastCommandTime: now,
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

/**
 * Spawn a new arrival at an entry point.
 * Starts in ENTERING — transitions to INBOUND_UNCONTROLLED near the field.
 */
export function spawnArrival(spawnPoint: SpawnPointData, callsign?: string, overrideType?: AircraftType, airport?: Airport): Aircraft {
  const type = overrideType ?? randomAircraftType(airport)
  const phase = AircraftPhase.ENTERING
  const now = Date.now()
  const initialSpeed = Math.min(Math.round(type.cruiseSpeed * 0.7), 250)

  return {
    id: generateId(),
    callsign: callsign ?? generateCallsign(),
    type,
    flightType: 'arrival',
    squawk: generateSquawk(),

    x: spawnPoint.x,
    y: spawnPoint.y,
    altitude: spawnPoint.altitude,
    heading: spawnPoint.heading,
    speed: initialSpeed,

    phase,
    controller: PHASE_CONTROLLER[phase],

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

    spawnTime: now,
    lastCommandTime: now,
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
