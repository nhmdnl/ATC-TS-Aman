import type { Aircraft, AircraftType, GateData, SpawnPointData } from './types'
import { AircraftPhase, ControllerStation } from './types'
import { AIRCRAFT_TYPES, AIRLINE_PREFIXES, PHASE_CONTROLLER, SEPARATION_NM, SEPARATION_FT } from './constants'
import { distanceNM } from './movement'

/**
 * True when no existing traffic sits close enough to a spawn point that a
 * new arrival there would violate (or immediately converge into) separation.
 * 2× lateral minima: a follower spawned at exactly the minima converges
 * before the player can intervene.
 */
export function isSpawnPointClear(point: SpawnPointData, traffic: Aircraft[]): boolean {
  return !traffic.some(ac =>
    distanceNM(ac.x, ac.y, point.x, point.y) < SEPARATION_NM * 2 &&
    Math.abs(ac.altitude - point.altitude) < SEPARATION_FT)
}

/**
 * Generate a random callsign consisting of an airline prefix and a 3-4 digit flight number.
 */
function generateCallsign(): string {
  // ponytail: flat random callsign — sequential/realistic when flight schedule system added
  const prefix = AIRLINE_PREFIXES[Math.floor(Math.random() * AIRLINE_PREFIXES.length)].prefix
  const number = Math.floor(Math.random() * 9000) + 100 // 100 to 9099
  return `${prefix}${number}`
}

/**
 * Generate a random 4-digit octal squawk code.
 */
function generateSquawk(): string {
  let squawk = ''
  for (let i = 0; i < 4; i++) {
    squawk += Math.floor(Math.random() * 8).toString()
  }
  return squawk
}

/**
 * Pick a random aircraft type from the catalog.
 */
function randomAircraftType(): AircraftType {
  return AIRCRAFT_TYPES[Math.floor(Math.random() * AIRCRAFT_TYPES.length)]
}

/**
 * Generate a unique ID (using crypto if available, fallback to Math.random)
 */
function generateId(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID()
  }
  return Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15)
}

/**
 * Spawn a new departure aircraft at a specific gate.
 * @param gate Gate where the aircraft will start
 * @param runwayId Initial assigned runway (can be changed by ground controller later)
 */
export function spawnDeparture(gate: GateData, runwayId: string): Aircraft {
  const type = randomAircraftType()
  const phase = AircraftPhase.PARKED
  const now = Date.now()

  return {
    id: generateId(),
    callsign: generateCallsign(),
    type,
    flightType: 'departure',
    squawk: generateSquawk(),

    x: gate.x,
    y: gate.y,
    altitude: 0,
    heading: 0,
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

    spawnTime: now,
    lastCommandTime: now,
    readbackTimer: null,

    urgent: false,
    inViolation: false,
    isSelected: false,
    handedOff: false,

    missedHeading: null,
    missedAltitude: null,

    trail: []
  }
}

/**
 * Spawn a new arrival aircraft at an entry point.
 * @param spawnPoint Pre-defined entry point from airport data
 */
export function spawnArrival(spawnPoint: SpawnPointData): Aircraft {
  const type = randomAircraftType()
  const phase = AircraftPhase.ENTERING
  const now = Date.now()
  // Initialize speed to 70% of cruise speed, capped at reasonable approach entry speed
  const initialSpeed = Math.min(Math.round(type.cruiseSpeed * 0.7), 250)

  return {
    id: generateId(),
    callsign: generateCallsign(),
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

    assignedRunway: null, // assigned by approach controller
    assignedTaxiway: null,
    assignedGate: null,
    taxiTarget: null,
    taxiRoute: null,
    taxiRouteIndex: 0,

    spawnTime: now,
    lastCommandTime: now,
    readbackTimer: null,

    urgent: false,
    inViolation: false,
    isSelected: false,
    handedOff: false,

    missedHeading: null,
    missedAltitude: null,

    trail: []
  }
}
