import type { AircraftType, DifficultyPreset, AircraftPhase, ControllerStation, CommandType, ScoreReason } from './types'
import { AircraftPhase as Phase, ControllerStation as Station, CommandType as Cmd } from './types'

// ─── Coordinate System ────────────────────────────────────────────────────────

/** Pixels per nautical mile — governs radar zoom base scale */
export const PX_PER_NM = 64

/** Meters per nautical mile */
export const METERS_PER_NM = 1852

/** Feet per nautical mile at 3° glideslope */
export const FT_PER_NM_GLIDESLOPE = 318

/** Standard glideslope angle in degrees */
export const GLIDESLOPE_ANGLE_DEG = 3

// ─── Separation Standards ─────────────────────────────────────────────────────

/** Minimum lateral separation in nautical miles */
export const SEPARATION_NM = 3

/** Minimum vertical separation in feet */
export const SEPARATION_FT = 1000

/** Cooldown between repeated separation violations for the same pair (ms) */
export const SEPARATION_COOLDOWN_MS = 5000

// ─── Terrain / MVA ────────────────────────────────────────────────────────────

/** Minimum Vectoring Altitude — 8800 ft MSL (HHAS circling minima Cat C) */
export const MVA_FT = 8800

/** Altitude threshold below which aircraft are considered "on ground" for MVA */
export const GROUND_ALTITUDE_THRESHOLD_FT = 100

// ─── Spawning ─────────────────────────────────────────────────────────────────

/** Distance from airport at which arrivals trigger ENTERING → APPROACH (NM) */
export const APPROACH_TRIGGER_NM = 8

/** Distance from runway for APPROACH → FINAL transition (NM) */
export const FINAL_DISTANCE_NM = 1

/** Distance from threshold for touchdown (meters) */
export const THRESHOLD_DISTANCE_M = 100

/** Distance from hold short position to trigger auto TAXI_OUT → HOLD_SHORT (NM) */
export const HOLD_SHORT_DISTANCE_NM = 0.1

// ─── Scoring ──────────────────────────────────────────────────────────────────

export const INITIAL_SCORE = 1000
export const MIN_SCORE = 0
export const MAX_SCORE = 2000
export const MAX_SCORE_EVENTS = 50

/** Score deltas per event type — PRD §10.1 */
export const SCORE_DELTAS: Record<ScoreReason, number> = {
  command_issued: 5,
  takeoff: 20,
  landing: 30,
  departure_handoff: 25,
  arrived_gate: 20,
  missed_approach: -100,
  separation_violation: -150,
} as const

/** Dimension weights per event — PRD §10.2 */
export const DIMENSION_DELTAS: Record<ScoreReason, {
  safety: number
  efficiency: number
  communication: number
  procedure: number
  awareness: number
}> = {
  command_issued:       { safety:  1, efficiency:  0, communication:  2, procedure:  2, awareness: 1 },
  takeoff:             { safety:  0, efficiency: 10, communication:  0, procedure:  0, awareness: 0 },
  landing:             { safety:  0, efficiency: 15, communication:  0, procedure:  0, awareness: 0 },
  departure_handoff:   { safety:  0, efficiency:  0, communication: 10, procedure: 15, awareness: 0 },
  arrived_gate:        { safety:  0, efficiency: 10, communication:  0, procedure:  0, awareness: 0 },
  missed_approach:     { safety: -40, efficiency: -30, communication: 0, procedure:  0, awareness: 0 },
  separation_violation: { safety: -80, efficiency:  0, communication: 0, procedure:  0, awareness: 0 },
} as const

/** Grade thresholds — PRD §10.3 */
export const GRADE_THRESHOLDS = [
  { min: 1500, grade: 'S' as const },
  { min: 1200, grade: 'A' as const },
  { min: 900,  grade: 'B' as const },
  { min: 600,  grade: 'C' as const },
  { min: 0,    grade: 'D' as const },
] as const

// ─── Readback Delay ───────────────────────────────────────────────────────────

/** Min pilot readback delay in ms */
export const READBACK_DELAY_MIN_MS = 1500
/** Max pilot readback delay in ms */
export const READBACK_DELAY_MAX_MS = 2500

// ─── AI Controller Pacing ─────────────────────────────────────────────────────

/** Minimum real time between two AI-issued commands for the same aircraft —
 *  keeps the AI from machine-gunning a command the instant a phase changes,
 *  matching a human-like decision cadence. */
export const AI_MIN_DECISION_INTERVAL_MS = 4000

// ─── Simulation Timing ───────────────────────────────────────────────────────

/** Simulation tick interval (ms) — 1 Hz */
export const SIM_TICK_INTERVAL_MS = 1000

/** Target render FPS */
export const TARGET_FPS = 60

// ─── TTS / Audio ──────────────────────────────────────────────────────────────

export const TTS_QUEUE_MAX = 20

// ─── Trail History ────────────────────────────────────────────────────────────

/** Max number of trail dots per aircraft */
export const MAX_TRAIL_LENGTH = 20

// ─── Session Duration ─────────────────────────────────────────────────────────

/** Session duration per difficulty (ms) */
const FIFTEEN_MIN_MS = 15 * 60 * 1000
const THIRTY_MIN_MS = 30 * 60 * 1000

// ─── Difficulty Presets ───────────────────────────────────────────────────────

export const DIFFICULTY_PRESETS: Record<string, DifficultyPreset> = {
  easy: {
    level: 'easy',
    spawnIntervalMs: 45_000,
    maxAircraft: 5,
    windDirection: 340,
    windSpeed: 4,
    sessionDurationMs: FIFTEEN_MIN_MS,
  },
  medium: {
    level: 'medium',
    spawnIntervalMs: 25_000,
    maxAircraft: 8,
    windDirection: 70,
    windSpeed: 8,
    sessionDurationMs: FIFTEEN_MIN_MS,
  },
  hard: {
    level: 'hard',
    spawnIntervalMs: 12_000,
    maxAircraft: 12,
    windDirection: 90,
    windSpeed: 15,
    sessionDurationMs: THIRTY_MIN_MS,
  },
} as const

// ─── Aircraft Type Catalog ────────────────────────────────────────────────────
// PRD §7.2 — 9 types with performance data

export const AIRCRAFT_TYPES: ReadonlyArray<AircraftType> = [
  {
    icao: 'B738', name: 'Boeing 737-800', category: 'M', approachCategory: 'C',
    cruiseSpeed: 460, approachSpeed: 137, rotationSpeed: 145, taxiSpeed: 20,
    climbRate: 2500, descentRate: 1800, serviceCeiling: 41000,
  },
  {
    icao: 'A320', name: 'Airbus A320', category: 'M', approachCategory: 'C',
    cruiseSpeed: 450, approachSpeed: 135, rotationSpeed: 142, taxiSpeed: 20,
    climbRate: 2400, descentRate: 1800, serviceCeiling: 39000,
  },
  {
    icao: 'CRJ9', name: 'Bombardier CRJ-900', category: 'M', approachCategory: 'C',
    cruiseSpeed: 430, approachSpeed: 130, rotationSpeed: 135, taxiSpeed: 18,
    climbRate: 2200, descentRate: 1600, serviceCeiling: 41000,
  },
  {
    icao: 'E175', name: 'Embraer E175', category: 'M', approachCategory: 'C',
    cruiseSpeed: 430, approachSpeed: 128, rotationSpeed: 130, taxiSpeed: 18,
    climbRate: 2200, descentRate: 1500, serviceCeiling: 41000,
  },
  {
    icao: 'B772', name: 'Boeing 777-200', category: 'H', approachCategory: 'D',
    cruiseSpeed: 490, approachSpeed: 145, rotationSpeed: 155, taxiSpeed: 20,
    climbRate: 2000, descentRate: 1800, serviceCeiling: 43100,
  },
  {
    icao: 'B744', name: 'Boeing 747-400', category: 'H', approachCategory: 'D',
    cruiseSpeed: 490, approachSpeed: 150, rotationSpeed: 160, taxiSpeed: 20,
    climbRate: 1800, descentRate: 1700, serviceCeiling: 45100,
  },
  {
    icao: 'A388', name: 'Airbus A380-800', category: 'J', approachCategory: 'D',
    cruiseSpeed: 480, approachSpeed: 145, rotationSpeed: 155, taxiSpeed: 20,
    climbRate: 1600, descentRate: 1500, serviceCeiling: 43000,
  },
  {
    icao: 'C172', name: 'Cessna 172 Skyhawk', category: 'L', approachCategory: 'C',
    cruiseSpeed: 120, approachSpeed: 60, rotationSpeed: 55, taxiSpeed: 10,
    climbRate: 700, descentRate: 500, serviceCeiling: 14000,
  },
  {
    icao: 'BE20', name: 'Beechcraft King Air 200', category: 'L', approachCategory: 'C',
    cruiseSpeed: 280, approachSpeed: 100, rotationSpeed: 105, taxiSpeed: 15,
    climbRate: 1500, descentRate: 1200, serviceCeiling: 35000,
  },
] as const

// ─── Airline Prefixes ─────────────────────────────────────────────────────────

export const AIRLINE_PREFIXES = [
  { prefix: 'UAL', callsignWord: 'UNITED' },
  { prefix: 'AAL', callsignWord: 'AMERICAN' },
  { prefix: 'DAL', callsignWord: 'DELTA' },
  { prefix: 'SWA', callsignWord: 'SOUTHWEST' },
  { prefix: 'BAW', callsignWord: 'SPEEDBIRD' },
  { prefix: 'DLH', callsignWord: 'LUFTHANSA' },
  { prefix: 'AFR', callsignWord: 'AIR FRANCE' },
  { prefix: 'ETH', callsignWord: 'ETHIOPIAN' },
  { prefix: 'MSR', callsignWord: 'EGYPTAIR' },
  { prefix: 'KQA', callsignWord: 'KENYA' },
  { prefix: 'THY', callsignWord: 'TURKISH' },
  { prefix: 'UAE', callsignWord: 'EMIRATES' },
] as const

// ─── Phase → Controller Mapping ──────────────────────────────────────────────
// PRD §8 — which controller handles which phases

export const PHASE_CONTROLLER: Record<AircraftPhase, ControllerStation> = {
  [Phase.PARKED]: Station.GROUND,
  [Phase.TAXI_OUT]: Station.GROUND,
  [Phase.HOLD_SHORT]: Station.TOWER,
  [Phase.LINE_UP]: Station.TOWER,
  [Phase.TAKEOFF_ROLL]: Station.TOWER,
  [Phase.CLIMBING]: Station.TOWER,
  [Phase.DEPARTED]: Station.AREA,
  [Phase.ENTERING]: Station.APPROACH,
  [Phase.APPROACH]: Station.APPROACH,
  [Phase.FINAL]: Station.TOWER,
  [Phase.LANDING]: Station.TOWER,
  [Phase.ROLLOUT]: Station.TOWER,
  [Phase.TAXI_IN]: Station.GROUND,
  [Phase.ARRIVED]: Station.GROUND,
  [Phase.MISSED]: Station.APPROACH,
} as const

// ─── Controller → Allowed Commands ───────────────────────────────────────────
// PRD §8 — which commands each controller can issue

export const CONTROLLER_COMMANDS: Record<ControllerStation, ReadonlyArray<CommandType>> = {
  [Station.GROUND]: [Cmd.TAXI, Cmd.HOLD_SHORT, Cmd.CANCEL_TAXI, Cmd.SQUAWK],
  [Station.TOWER]: [
    Cmd.LINE_UP_WAIT, Cmd.CLEARED_TAKEOFF, Cmd.CLEARED_LAND,
    Cmd.GO_AROUND, Cmd.CONTACT_DEPARTURE, Cmd.CONTACT_GROUND,
    Cmd.EXIT_RUNWAY, Cmd.SQUAWK, Cmd.ALTITUDE, Cmd.SPEED,
  ],
  [Station.APPROACH]: [Cmd.CLEARED_APPROACH, Cmd.VECTOR, Cmd.ALTITUDE, Cmd.SPEED, Cmd.CONTACT_TOWER],
  [Station.AREA]: [],
} as const

// ─── Phase → Allowed Commands ─────────────────────────────────────────────────
// More granular: which commands are valid for each specific phase

export const PHASE_COMMANDS: Record<AircraftPhase, ReadonlyArray<CommandType>> = {
  [Phase.PARKED]:       [Cmd.TAXI, Cmd.SQUAWK],
  [Phase.TAXI_OUT]:     [Cmd.HOLD_SHORT, Cmd.CANCEL_TAXI, Cmd.SQUAWK],
  [Phase.HOLD_SHORT]:   [Cmd.LINE_UP_WAIT, Cmd.SQUAWK],
  [Phase.LINE_UP]:      [Cmd.CLEARED_TAKEOFF, Cmd.SQUAWK],
  [Phase.TAKEOFF_ROLL]: [Cmd.SQUAWK],
  [Phase.CLIMBING]:     [Cmd.CONTACT_DEPARTURE, Cmd.ALTITUDE, Cmd.SPEED, Cmd.SQUAWK],
  [Phase.DEPARTED]:     [],
  [Phase.ENTERING]:     [Cmd.CLEARED_APPROACH, Cmd.VECTOR, Cmd.ALTITUDE, Cmd.SPEED, Cmd.SQUAWK],
  [Phase.APPROACH]:     [Cmd.CLEARED_APPROACH, Cmd.VECTOR, Cmd.ALTITUDE, Cmd.SPEED, Cmd.CONTACT_TOWER, Cmd.SQUAWK],
  [Phase.FINAL]:        [Cmd.CLEARED_LAND, Cmd.GO_AROUND, Cmd.SPEED, Cmd.SQUAWK],
  [Phase.LANDING]:      [Cmd.GO_AROUND, Cmd.SQUAWK],
  [Phase.ROLLOUT]:      [Cmd.EXIT_RUNWAY, Cmd.SQUAWK],
  [Phase.TAXI_IN]:      [Cmd.CONTACT_GROUND, Cmd.SQUAWK],
  [Phase.ARRIVED]:      [],
  [Phase.MISSED]:       [Cmd.VECTOR, Cmd.ALTITUDE, Cmd.SPEED, Cmd.SQUAWK],
} as const

// ─── Airborne Phases (for separation checking) ───────────────────────────────

export const AIRBORNE_PHASES: ReadonlySet<AircraftPhase> = new Set([
  Phase.CLIMBING,
  Phase.ENTERING,
  Phase.APPROACH,
  Phase.FINAL,
  Phase.LANDING,
  Phase.MISSED,
]) as ReadonlySet<AircraftPhase>

// ─── Speed Limit for Category D ───────────────────────────────────────────────
// PRD §14 — Cat D aircraft: 210 kt outbound, 185 kt procedure turn

export const CAT_D_APPROACH_SPEED_LIMIT = 210
export const CAT_D_PROCEDURE_TURN_LIMIT = 185

// ─── Controller Frequencies (defaults, overridden by airport data) ────────────

export const DEFAULT_FREQUENCIES: Record<ControllerStation, number> = {
  [Station.GROUND]: 121.9,
  [Station.TOWER]: 118.1,
  [Station.APPROACH]: 120.7,
  [Station.AREA]: 0,
} as const

// ─── XP per Score Reason (Career System) ──────────────────────────────────────

export const XP_PER_REASON: Record<ScoreReason, number> = {
  command_issued: 1,
  takeoff: 5,
  landing: 8,
  departure_handoff: 6,
  arrived_gate: 5,
  missed_approach: 0,
  separation_violation: 0,
} as const

// ─── Colors ───────────────────────────────────────────────────────────────────
// PRD §18.3

export const COLORS = {
  bg: {
    primary: 0x0e1116,
    surface: 0x161b22,
    card: 0x1d2430,
  },
  accent: {
    primary: 0x34d399,
    blue: 0x60a5fa,
    amber: 0xfbbf24,
    red: 0xf87171,
  },
  aircraft: {
    departure: 0x39d98a,
    arrival: 0x5cbfff,
    urgent: 0xffaa33,
    violation: 0xff3232,
  },
  text: {
    primary: 0xf3f4f6,
    secondary: 0x94a3b8,
    muted: 0x64748b,
    disabled: 0x646464,
  },
  log: {
    atc: 0x39d98a,
    pilot: 0x5cbfff,
    system: 0xb4b4b4,
    critical: 0xff4646,
  },
} as const

// ─── CSS Color Strings (for React components) ────────────────────────────────

export const CSS_COLORS = {
  bg: {
    primary: '#0E1116',
    surface: '#161B22',
    card: '#1D2430',
  },
  accent: {
    primary: '#34D399',
    blue: '#60A5FA',
    amber: '#FBBF24',
    red: '#F87171',
  },
  aircraft: {
    departure: '#39D98A',
    arrival: '#5CBFFF',
    urgent: '#FFAA33',
    violation: '#FF3232',
  },
  text: {
    primary: '#F3F4F6',
    secondary: '#94A3B8',
    muted: '#64748B',
    disabled: '#646464',
  },
  log: {
    atc: '#39D98A',
    pilot: '#5CBFFF',
    system: '#B4B4B4',
    critical: '#FF4646',
  },
} as const
