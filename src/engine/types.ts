// ─── Aircraft Phase State Machine ─────────────────────────────────────────────
// Departure flow: PARKED → TAXI_OUT → HOLD_SHORT → LINE_UP → TAKEOFF_ROLL → CLIMBING → DEPARTED
// Arrival flow:   ENTERING → APPROACH → FINAL → LANDING → ROLLOUT → TAXI_IN → ARRIVED
// Missed:         FINAL → MISSED (when not cleared to land)

export enum AircraftPhase {
  // Departure phases
  PARKED = 'PARKED',
  TAXI_OUT = 'TAXI_OUT',
  HOLD_SHORT = 'HOLD_SHORT',
  LINE_UP = 'LINE_UP',
  TAKEOFF_ROLL = 'TAKEOFF_ROLL',
  CLIMBING = 'CLIMBING',
  DEPARTED = 'DEPARTED',

  // Arrival phases
  ENTERING = 'ENTERING',
  APPROACH = 'APPROACH',
  FINAL = 'FINAL',
  LANDING = 'LANDING',
  ROLLOUT = 'ROLLOUT',
  TAXI_IN = 'TAXI_IN',
  ARRIVED = 'ARRIVED',

  // Missed approach
  MISSED = 'MISSED',
}

// ─── Controller Stations ──────────────────────────────────────────────────────

export enum ControllerStation {
  GROUND = 'GROUND',
  TOWER = 'TOWER',
  APPROACH = 'APPROACH',
  AREA = 'AREA',
}

// ─── Command Types ────────────────────────────────────────────────────────────

export enum CommandType {
  TAXI = 'TAXI',
  HOLD_SHORT = 'HOLD_SHORT',
  LINE_UP_WAIT = 'LINE_UP_WAIT',
  CLEARED_TAKEOFF = 'CLEARED_TAKEOFF',
  CLEARED_LAND = 'CLEARED_LAND',
  CLEARED_APPROACH = 'CLEARED_APPROACH',
  VECTOR = 'VECTOR',
  ALTITUDE = 'ALTITUDE',
  SPEED = 'SPEED',
  SQUAWK = 'SQUAWK',
  CONTACT_DEPARTURE = 'CONTACT_DEPARTURE',
  CONTACT_TOWER = 'CONTACT_TOWER',
  CONTACT_GROUND = 'CONTACT_GROUND',
  GO_AROUND = 'GO_AROUND',
  EXIT_RUNWAY = 'EXIT_RUNWAY',
  CANCEL_TAXI = 'CANCEL_TAXI',
}

// ─── Aircraft Categories ──────────────────────────────────────────────────────

export type AircraftCategory = 'L' | 'M' | 'H' | 'J'
export type ApproachCategory = 'C' | 'D'

// ─── Aircraft Type Definition ─────────────────────────────────────────────────

export interface AircraftType {
  readonly icao: string
  readonly name: string
  readonly category: AircraftCategory
  readonly approachCategory: ApproachCategory
  readonly cruiseSpeed: number   // knots
  readonly approachSpeed: number // knots
  readonly rotationSpeed: number // knots
  readonly taxiSpeed: number     // knots
  readonly climbRate: number     // ft/min
  readonly descentRate: number   // ft/min
  readonly serviceCeiling: number // ft
}

// ─── Flight Identity ──────────────────────────────────────────────────────────

export type FlightType = 'departure' | 'arrival'

// ─── Aircraft State ───────────────────────────────────────────────────────────

export interface Aircraft {
  readonly id: string            // unique UUID
  readonly callsign: string      // e.g. "UAL123"
  readonly type: AircraftType
  readonly flightType: FlightType
  squawk: string                 // 4-digit octal, e.g. "4521" — mutable via SQUAWK command

  // Position & movement (mutable during simulation)
  x: number                      // NM from airport reference point
  y: number                      // NM from airport reference point
  altitude: number               // ft MSL
  heading: number                // degrees true (0-359)
  speed: number                  // knots

  // Current state
  phase: AircraftPhase
  controller: ControllerStation

  // Clearances (set by commands, consumed by movement)
  clearedHeading: number | null
  clearedAltitude: number | null
  clearedSpeed: number | null
  clearedToLand: boolean
  clearedForApproach: boolean

  // Taxi routing
  assignedRunway: string | null
  assignedTaxiway: string | null
  assignedGate: string | null
  taxiTarget: { x: number; y: number } | null
  taxiRoute: Array<{ x: number; y: number }> | null
  taxiRouteIndex: number

  // Timing
  spawnTime: number              // ms timestamp
  lastCommandTime: number        // ms timestamp
  readbackTimer: number | null   // ms remaining for readback delay

  // Flags
  urgent: boolean                // FINAL and not cleared to land
  inViolation: boolean           // separation violation active
  isSelected: boolean            // player has selected this aircraft
  handedOff: boolean             // has been handed off to departure/ground

  // Missed approach parameters
  missedHeading: number | null
  missedAltitude: number | null

  // Trail history for radar display
  trail: Array<{ x: number; y: number }>
}

// ─── Airport Data Structures ──────────────────────────────────────────────────

export interface RunwayData {
  readonly id: string
  readonly trueHeading: number
  readonly magneticHeading: number
  readonly length: number        // meters
  readonly width: number         // meters
  readonly surface: string
  readonly elevationFt: number
  readonly thresholdX: number    // NM
  readonly thresholdY: number    // NM
  readonly endX: number          // NM
  readonly endY: number          // NM
  readonly displacedThresholdFt: number
  readonly ils: {
    readonly frequency: number
    readonly available: boolean
  } | null
  readonly pattern: 'left' | 'right'
  readonly stepdowns: ReadonlyArray<{
    readonly dme: number         // NM
    readonly altitude: number    // ft MSL
  }>
}

export interface TaxiwayNode {
  readonly id: string
  readonly x: number             // NM
  readonly y: number             // NM
}

export interface TaxiwayEdge {
  readonly from: string          // node id
  readonly to: string            // node id
}

export interface TaxiwayData {
  readonly id: string
  readonly width: number         // meters
  readonly surface: string
  readonly nodes: ReadonlyArray<TaxiwayNode>
  readonly edges: ReadonlyArray<TaxiwayEdge>
}

export interface GateData {
  readonly id: string
  readonly x: number             // NM
  readonly y: number             // NM
  readonly taxiwayId: string
}

export interface ParkingData {
  readonly id: string
  readonly x: number             // NM
  readonly y: number             // NM
  readonly type: string
}

export interface NavaidData {
  readonly id: string
  readonly type: 'VOR' | 'NDB' | 'ILS' | 'DME' | 'VOR/DME' | 'ILS/DME'
  readonly frequency: number
  readonly x: number             // NM
  readonly y: number             // NM
  readonly name: string
}

export interface FrequencyData {
  readonly name: string
  readonly frequency: number
  readonly callsign: string
}

export interface SpawnPointData {
  readonly id: string
  readonly type: 'departure' | 'arrival'
  readonly gateId?: string       // for departures — links to gate
  readonly x: number             // NM
  readonly y: number             // NM
  readonly heading: number       // degrees
  readonly altitude: number      // ft
}

export interface AirportMetadata {
  readonly icao: string
  readonly iata: string
  readonly name: string
  readonly country: string
  readonly elevationFt: number
  readonly magneticVariation: number
}

/** Render-only airport geometry for the radar diagram (all coords in NM) */
export interface DiagramPoint {
  readonly x: number
  readonly y: number
}

export interface AirportDiagram {
  readonly taxiways: ReadonlyArray<{
    readonly name: string
    readonly points: ReadonlyArray<DiagramPoint>
    readonly widthNM: number
  }>
  readonly aprons: ReadonlyArray<ReadonlyArray<DiagramPoint>>
  readonly buildings: ReadonlyArray<ReadonlyArray<DiagramPoint>>
  readonly labels: ReadonlyArray<{ readonly text: string; readonly x: number; readonly y: number }>
}

export interface Airport {
  readonly version: number
  readonly metadata: AirportMetadata
  readonly runways: ReadonlyArray<RunwayData>
  readonly taxiways: ReadonlyArray<TaxiwayData>
  readonly gates: ReadonlyArray<GateData>
  readonly parking: ReadonlyArray<ParkingData>
  readonly frequencies: ReadonlyArray<FrequencyData>
  readonly navaids: ReadonlyArray<NavaidData>
  readonly spawnPoints: ReadonlyArray<SpawnPointData>
  /** Render-only geometry (aprons, buildings, taxiway centerlines) — absent for v1 files */
  readonly diagram?: AirportDiagram
}

// ─── Taxiway Graph (computed at load time) ────────────────────────────────────

export interface TaxiwayGraph {
  readonly nodes: Map<string, { x: number; y: number }>
  readonly adjacency: Map<string, string[]>
}

// ─── Commands ─────────────────────────────────────────────────────────────────

export interface Command {
  readonly type: CommandType
  readonly targetCallsign: string
  readonly params: CommandParams
}

export interface CommandParams {
  readonly heading?: number      // 0-360 for VECTOR
  readonly altitude?: number     // ft for ALTITUDE
  readonly speed?: number        // knots for SPEED
  readonly squawk?: string       // 4-digit octal for SQUAWK
  readonly runway?: string       // runway designator
  readonly taxiway?: string      // taxiway id
  readonly gate?: string         // gate id
}

export interface CommandResult {
  readonly success: boolean
  readonly error?: string
  readonly phraseology?: {
    readonly atc: string
    readonly pilot: string
    readonly station: string
  }
}

// ─── Scoring ──────────────────────────────────────────────────────────────────

export type ScoreReason =
  | 'command_issued'
  | 'takeoff'
  | 'landing'
  | 'departure_handoff'
  | 'arrived_gate'
  | 'missed_approach'
  | 'separation_violation'

export interface ScoreEvent {
  readonly timestamp: number     // ms
  readonly delta: number         // positive = good, negative = bad
  readonly reason: ScoreReason
  readonly callsign: string
}

export interface ScoreDimensions {
  safety: number
  efficiency: number
  communication: number
  procedure: number
  awareness: number
}

export type Grade = 'S' | 'A' | 'B' | 'C' | 'D'

// ─── Difficulty ───────────────────────────────────────────────────────────────

export type DifficultyLevel = 'easy' | 'medium' | 'hard'

export interface DifficultyPreset {
  readonly level: DifficultyLevel
  readonly spawnIntervalMs: number
  readonly maxAircraft: number
  readonly windDirection: number // degrees
  readonly windSpeed: number     // knots
  readonly sessionDurationMs: number // session length
}

// ─── Events ───────────────────────────────────────────────────────────────────

export enum GameEventType {
  COMMAND_ISSUED = 'COMMAND_ISSUED',
  COMMAND_REJECTED = 'COMMAND_REJECTED',
  PHASE_CHANGED = 'PHASE_CHANGED',
  TAKEOFF = 'TAKEOFF',
  LANDING = 'LANDING',
  MISSED_APPROACH = 'MISSED_APPROACH',
  ARRIVED_GATE = 'ARRIVED_GATE',
  HANDOFF = 'HANDOFF',
  SEPARATION_VIOLATION = 'SEPARATION_VIOLATION',
  AIRCRAFT_SPAWNED = 'AIRCRAFT_SPAWNED',
  AIRCRAFT_REMOVED = 'AIRCRAFT_REMOVED',
  SCORE_CHANGED = 'SCORE_CHANGED',
  SIM_PAUSED = 'SIM_PAUSED',
  SIM_RESUMED = 'SIM_RESUMED',
  SIM_RESET = 'SIM_RESET',
  SESSION_ENDED = 'SESSION_ENDED',
}

export interface GameEvent {
  readonly type: GameEventType
  readonly timestamp: number
  readonly payload: Record<string, unknown>
}

// ─── Radio Log ────────────────────────────────────────────────────────────────

export type RadioSpeaker = 'ATC' | 'PILOT' | 'SYSTEM' | 'CRITICAL'

export interface RadioMessage {
  readonly timestamp: number
  readonly speaker: RadioSpeaker
  readonly message: string
  readonly station?: string      // frequency / station name
}

// ─── Mission System ───────────────────────────────────────────────────────────

export type MissionState = 'INACTIVE' | 'ACTIVE' | 'COMPLETED'

export interface MissionObjective {
  readonly id: string
  readonly description: string
  readonly check: (state: GameStateSnapshot) => boolean
  completed: boolean
}

export interface Mission {
  readonly id: string
  readonly name: string
  readonly objectives: MissionObjective[]
  state: MissionState
}

// ─── Career System ────────────────────────────────────────────────────────────

export interface CareerState {
  xp: number
  level: number
  sessionsPlayed: number
  bestGrade: Grade | null
  highScore: number
}

// ─── Game State Snapshot (for mission checks, read-only) ──────────────────────

export interface GameStateSnapshot {
  readonly aircraft: ReadonlyMap<string, Readonly<Aircraft>>
  readonly score: number
  readonly scoreDimensions: Readonly<ScoreDimensions>
  readonly elapsedMs: number
  readonly aircraftHandled: number
  readonly paused: boolean
  readonly difficulty: DifficultyLevel
  readonly grade: Grade
  readonly sessionStarted: boolean
  readonly sessionEnded: boolean
  readonly airport: Readonly<Airport> | null
  readonly radioMessages: ReadonlyArray<RadioMessage>
  readonly wind: Readonly<Wind>
  readonly playerStations: ReadonlyArray<ControllerStation>
}

// ─── Wind ─────────────────────────────────────────────────────────────────────

export interface Wind {
  readonly direction: number     // degrees (where wind is coming FROM)
  readonly speed: number         // knots
}
