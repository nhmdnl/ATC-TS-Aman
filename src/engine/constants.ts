import type { AircraftType, DifficultyPreset, AircraftPhase, ControllerStation, CommandType, ScoreReason } from './types'
import { AircraftPhase as Phase, ControllerStation as Station, CommandType as Cmd, WakeCategory as Wake } from './types'

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

/** Minimum vertical separation in feet */
export const SEPARATION_FT = 1000

/** Cooldown between repeated separation violations for the same pair (ms) */
export const SEPARATION_COOLDOWN_MS = 5000

/** MRS = minimum radar separation (3 NM) — used when no extra wake required */
export const MRS_NM = 3

/**
 * TS3 wake turbulence distance-based separation matrix (NM).
 * Index: WAKE_SEPARATION_NM[leader][trailer] = required NM between them.
 * Leader = aircraft ahead (closer to threshold); trailer = aircraft behind.
 */
export const WAKE_SEPARATION_NM: Record<string, Record<string, number>> = {
  [Wake.SUPER_HEAVY]: { [Wake.SUPER_HEAVY]: MRS_NM, [Wake.HEAVY]: 6, [Wake.MEDIUM]: 7, [Wake.LIGHT]: 8 },
  [Wake.HEAVY]:       { [Wake.SUPER_HEAVY]: MRS_NM, [Wake.HEAVY]: 4, [Wake.MEDIUM]: 5, [Wake.LIGHT]: 6 },
  [Wake.MEDIUM]:      { [Wake.SUPER_HEAVY]: MRS_NM, [Wake.HEAVY]: MRS_NM, [Wake.MEDIUM]: MRS_NM, [Wake.LIGHT]: 5 },
  [Wake.LIGHT]:       { [Wake.SUPER_HEAVY]: MRS_NM, [Wake.HEAVY]: MRS_NM, [Wake.MEDIUM]: MRS_NM, [Wake.LIGHT]: MRS_NM },
} as const

// ─── Terrain / MVA ────────────────────────────────────────────────────────────

/** Fallback Minimum Vectoring Altitude — 8800 ft MSL (HHAS circling minima
 *  Cat C). Airports loaded from file carry their own `mvaFt`; this is only
 *  used when the airport is missing or predates the field. */
export const MVA_FT = 8800

// ─── Spawning ─────────────────────────────────────────────────────────────────

/** Aircraft leaving the field beyond this radius are removed — the 4th radar
 *  ring (20 NM), visibly inside the display and safely outside the ~15 NM
 *  arrival spawn radius */
export const REMOVAL_RADIUS_NM = 20

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
// Below zero on purpose (user decision 2026-07-18): a 0-floor made every
// violation after a bad streak free. -500 keeps violations costing through
// any realistic session; the grade is already D below 600.
export const MIN_SCORE = -500
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
  missed_handoff: -100,
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
  missed_handoff:       { safety:  0, efficiency:  0, communication: -3, procedure: -2, awareness:  0 },
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
    // Good VMC, but a visibility readout appears — approaches stay visual.
    visibilityNM: 8,
    ceiling: 3500,
    sessionDurationMs: FIFTEEN_MIN_MS,
  },
  hard: {
    level: 'hard',
    spawnIntervalMs: 12_000,
    maxAircraft: 12,
    windDirection: 90,
    windSpeed: 15,
    // IMC (vis < 3 NM, ceiling < 1000 ft): forces ILS approaches, exercising
    // the IMC/ILS validator and the missed-approach path.
    visibilityNM: 2,
    ceiling: 700,
    sessionDurationMs: THIRTY_MIN_MS,
  },
} as const

// ─── Aircraft Type Catalog ────────────────────────────────────────────────────
// ─── Aircraft Type Catalog ────────────────────────────────────────────────────

export const DEFAULT_ENABLED_AIRCRAFT_CLASSES: ReadonlyArray<import('./types').AircraftClass> = [
  'LIGHT',
  'MEDIUM',
  'HEAVY',
  'SUPER_HEAVY',
  'MILITARY',
  'HELICOPTER',
]

export const AIRCRAFT_TYPES: ReadonlyArray<AircraftType> = [
  {
    icao: 'B738', name: 'Boeing 737-800', category: 'M', approachCategory: 'C', wakeCategory: Wake.MEDIUM, aircraftClass: 'MEDIUM',
    cruiseSpeed: 460, approachSpeed: 137, rotationSpeed: 145, taxiSpeed: 20,
    climbRate: 2500, descentRate: 1800, serviceCeiling: 41000, minRunwayLengthFt: 6200,
  },
  {
    icao: 'A320', name: 'Airbus A320', category: 'M', approachCategory: 'C', wakeCategory: Wake.MEDIUM, aircraftClass: 'MEDIUM',
    cruiseSpeed: 450, approachSpeed: 135, rotationSpeed: 142, taxiSpeed: 20,
    climbRate: 2400, descentRate: 1800, serviceCeiling: 39000, minRunwayLengthFt: 6200,
  },
  {
    icao: 'CRJ9', name: 'Bombardier CRJ-900', category: 'M', approachCategory: 'C', wakeCategory: Wake.MEDIUM, aircraftClass: 'MEDIUM',
    cruiseSpeed: 430, approachSpeed: 130, rotationSpeed: 135, taxiSpeed: 18,
    climbRate: 2200, descentRate: 1600, serviceCeiling: 41000, minRunwayLengthFt: 5200,
  },
  {
    icao: 'E175', name: 'Embraer E175', category: 'M', approachCategory: 'C', wakeCategory: Wake.MEDIUM, aircraftClass: 'MEDIUM',
    cruiseSpeed: 430, approachSpeed: 128, rotationSpeed: 130, taxiSpeed: 18,
    climbRate: 2200, descentRate: 1500, serviceCeiling: 41000, minRunwayLengthFt: 5200,
  },
  {
    icao: 'B772', name: 'Boeing 777-200', category: 'H', approachCategory: 'D', wakeCategory: Wake.HEAVY, aircraftClass: 'HEAVY',
    cruiseSpeed: 490, approachSpeed: 145, rotationSpeed: 155, taxiSpeed: 20,
    climbRate: 2000, descentRate: 1800, serviceCeiling: 43100, minRunwayLengthFt: 8200,
  },
  {
    icao: 'B744', name: 'Boeing 747-400', category: 'H', approachCategory: 'D', wakeCategory: Wake.HEAVY, aircraftClass: 'HEAVY',
    cruiseSpeed: 490, approachSpeed: 150, rotationSpeed: 160, taxiSpeed: 20,
    climbRate: 1800, descentRate: 1700, serviceCeiling: 45100, minRunwayLengthFt: 8200,
  },
  {
    icao: 'A388', name: 'Airbus A380-800', category: 'J', approachCategory: 'D', wakeCategory: Wake.SUPER_HEAVY, aircraftClass: 'SUPER_HEAVY',
    cruiseSpeed: 480, approachSpeed: 145, rotationSpeed: 155, taxiSpeed: 20,
    climbRate: 1600, descentRate: 1500, serviceCeiling: 43000, minRunwayLengthFt: 9500,
  },
  {
    icao: 'C172', name: 'Cessna 172 Skyhawk', category: 'L', approachCategory: 'C', wakeCategory: Wake.LIGHT, aircraftClass: 'LIGHT',
    cruiseSpeed: 120, approachSpeed: 60, rotationSpeed: 55, taxiSpeed: 10,
    climbRate: 700, descentRate: 500, serviceCeiling: 14000, minRunwayLengthFt: 1600,
  },
  {
    icao: 'BE20', name: 'Beechcraft King Air 200', category: 'L', approachCategory: 'C', wakeCategory: Wake.LIGHT, aircraftClass: 'LIGHT',
    cruiseSpeed: 280, approachSpeed: 100, rotationSpeed: 105, taxiSpeed: 15,
    climbRate: 1500, descentRate: 1200, serviceCeiling: 35000, minRunwayLengthFt: 2500,
  },
  {
    icao: 'C130', name: 'Lockheed C-130 Hercules', category: 'H', approachCategory: 'C', wakeCategory: Wake.HEAVY, aircraftClass: 'MILITARY',
    cruiseSpeed: 320, approachSpeed: 120, rotationSpeed: 115, taxiSpeed: 18,
    climbRate: 1900, descentRate: 1500, serviceCeiling: 33000, minRunwayLengthFt: 3000,
  },
  {
    icao: 'F16', name: 'F-16 Fighting Falcon', category: 'M', approachCategory: 'D', wakeCategory: Wake.MEDIUM, aircraftClass: 'MILITARY',
    cruiseSpeed: 550, approachSpeed: 150, rotationSpeed: 160, taxiSpeed: 22,
    climbRate: 4500, descentRate: 3000, serviceCeiling: 50000, minRunwayLengthFt: 3500,
  },
  {
    icao: 'H60', name: 'Sikorsky UH-60 Black Hawk', category: 'L', approachCategory: 'C', wakeCategory: Wake.LIGHT, aircraftClass: 'HELICOPTER',
    cruiseSpeed: 150, approachSpeed: 60, rotationSpeed: 40, taxiSpeed: 12,
    climbRate: 1200, descentRate: 1000, serviceCeiling: 19000, minRunwayLengthFt: 0,
  },
  {
    icao: 'EC35', name: 'Eurocopter EC135', category: 'L', approachCategory: 'C', wakeCategory: Wake.LIGHT, aircraftClass: 'HELICOPTER',
    cruiseSpeed: 135, approachSpeed: 55, rotationSpeed: 35, taxiSpeed: 10,
    climbRate: 1400, descentRate: 1100, serviceCeiling: 20000, minRunwayLengthFt: 0,
  },
] as const

// ─── Airline Prefixes ─────────────────────────────────────────────────────────

// Real HHAS (Asmara) carriers as of 2026: the six scheduled international
// operators plus Eritrean Airlines as the home flag carrier. Used as the
// random-spawn fallback roster; the authored schedule (hhas.schedule.json)
// draws from the same set.
export const AIRLINE_PREFIXES = [
  { prefix: 'ERE', callsignWord: 'ERITREAN' },
  { prefix: 'ETD', callsignWord: 'ETIHAD' },
  { prefix: 'MSR', callsignWord: 'EGYPTAIR' },
  { prefix: 'FDB', callsignWord: 'FLYDUBAI' },
  { prefix: 'KNE', callsignWord: 'NAS' },
  { prefix: 'TQR', callsignWord: 'TARCO' },
  { prefix: 'THY', callsignWord: 'TURKISH' },
] as const

// ─── Phase → Controller Mapping ──────────────────────────────────────────────
// PRD §8 — which controller handles which phases

export const PHASE_CONTROLLER: Record<AircraftPhase, ControllerStation> = {
  // Departure
  [Phase.AT_GATE]: Station.GROUND,
  [Phase.AWAITING_PUSHBACK]: Station.GROUND,
  [Phase.PUSHING_BACK]: Station.GROUND,
  [Phase.READY_TO_TAXI]: Station.GROUND,
  [Phase.TAXI_OUT]: Station.GROUND,
  [Phase.HOLD_SHORT]: Station.TOWER,
  [Phase.LINE_UP]: Station.TOWER,
  [Phase.TAKEOFF_ROLL]: Station.TOWER,
  [Phase.CLIMBING]: Station.TOWER,
  [Phase.DEPARTED]: Station.AREA,
  // Arrival
  [Phase.ENTERING]: Station.APPROACH,
  [Phase.INBOUND_UNCONTROLLED]: Station.TOWER,
  [Phase.APPROACH]: Station.APPROACH,
  [Phase.FINAL]: Station.TOWER,
  [Phase.LANDING]: Station.TOWER,
  [Phase.ROLLOUT]: Station.TOWER,
  [Phase.VACATED]: Station.GROUND,
  [Phase.TAXI_IN]: Station.GROUND,
  [Phase.ARRIVED]: Station.GROUND,
  [Phase.MISSED]: Station.APPROACH,
} as const

// ─── Controller → Allowed Commands ───────────────────────────────────────────
// PRD §8 — which commands each controller can issue

export const CONTROLLER_COMMANDS: Record<ControllerStation, ReadonlyArray<CommandType>> = {
  [Station.GROUND]: [
    Cmd.PUSHBACK_APPROVED, Cmd.STARTUP_APPROVED,
    Cmd.TAXI, Cmd.HOLD_SHORT, Cmd.CANCEL_TAXI,
    Cmd.CROSS_RUNWAY, Cmd.CONTINUE_TAXI,
    Cmd.SQUAWK, Cmd.STANDBY,
  ],
  [Station.TOWER]: [
    Cmd.LINE_UP_WAIT, Cmd.CLEARED_TAKEOFF, Cmd.CLEARED_LAND,
    Cmd.GO_AROUND, Cmd.CONTACT_DEPARTURE, Cmd.CONTACT_GROUND,
    Cmd.EXIT_RUNWAY, Cmd.SQUAWK, Cmd.STANDBY,
  ],
  [Station.APPROACH]: [Cmd.CLEARED_APPROACH, Cmd.VECTOR, Cmd.CONTACT_TOWER, Cmd.STANDBY],
  [Station.AREA]: [],
} as const

// ─── Phase → Allowed Commands ─────────────────────────────────────────────────
// More granular: which commands are valid for each specific phase

export const PHASE_COMMANDS: Record<AircraftPhase, ReadonlyArray<CommandType>> = {
  // Departure
  [Phase.AT_GATE]:            [Cmd.SQUAWK],
  [Phase.AWAITING_PUSHBACK]:  [Cmd.PUSHBACK_APPROVED, Cmd.STARTUP_APPROVED, Cmd.SQUAWK, Cmd.STANDBY],
  [Phase.PUSHING_BACK]:       [Cmd.SQUAWK],
  [Phase.READY_TO_TAXI]:      [Cmd.TAXI, Cmd.SQUAWK],
  [Phase.TAXI_OUT]:           [Cmd.HOLD_SHORT, Cmd.CANCEL_TAXI, Cmd.CROSS_RUNWAY, Cmd.CONTINUE_TAXI, Cmd.SQUAWK],
  [Phase.HOLD_SHORT]:         [Cmd.LINE_UP_WAIT, Cmd.SQUAWK],
  [Phase.LINE_UP]:            [Cmd.CLEARED_TAKEOFF, Cmd.SQUAWK],
  [Phase.TAKEOFF_ROLL]:       [Cmd.SQUAWK],
  [Phase.CLIMBING]:           [Cmd.CONTACT_DEPARTURE, Cmd.ALTITUDE, Cmd.SPEED, Cmd.SQUAWK],
  [Phase.DEPARTED]:           [],
  // Arrival
  [Phase.ENTERING]:           [],
  [Phase.INBOUND_UNCONTROLLED]: [Cmd.STANDBY, Cmd.WIND],
  [Phase.APPROACH]:           [Cmd.CLEARED_APPROACH, Cmd.VECTOR, Cmd.CONTACT_TOWER, Cmd.SQUAWK],
  [Phase.FINAL]:              [Cmd.CLEARED_LAND, Cmd.GO_AROUND, Cmd.SQUAWK, Cmd.WIND, Cmd.REPORT],
  [Phase.LANDING]:            [Cmd.GO_AROUND, Cmd.SQUAWK],
  [Phase.ROLLOUT]:            [Cmd.EXIT_RUNWAY, Cmd.SQUAWK],
  [Phase.VACATED]:            [Cmd.TAXI, Cmd.SQUAWK],
  [Phase.TAXI_IN]:            [Cmd.HOLD_SHORT, Cmd.CONTINUE_TAXI, Cmd.SQUAWK],
  [Phase.ARRIVED]:            [],
  [Phase.MISSED]:             [Cmd.VECTOR, Cmd.CLEARED_APPROACH, Cmd.SQUAWK],
} as const

// ─── Airborne Phases (for separation checking) ───────────────────────────────

export const AIRBORNE_PHASES: ReadonlySet<AircraftPhase> = new Set([
  Phase.CLIMBING,
  Phase.ENTERING,
  Phase.INBOUND_UNCONTROLLED,
  Phase.APPROACH,
  Phase.FINAL,
  Phase.LANDING,
  Phase.MISSED,
]) as ReadonlySet<AircraftPhase>

/** Pushback call delay after spawn (ms real time) */
export const PUSHBACK_CALL_DELAY_MS = 20_000

/** Duration of the pushing-back phase (ms real time) */
export const PUSHING_BACK_DURATION_MS = 45_000

export const DEPARTURE_HANDOFF_ALT_FT = 10_000

/** Distance in NM from runway threshold at which an inbound arrival fires the "with you" call */
export const WITH_YOU_CALL_NM = 9

/** Distance in NM that triggers ENTERING → INBOUND_UNCONTROLLED */
export const INBOUND_TRIGGER_NM = 12

/** How long before repeating an unacknowledged pilot call (ms) */
export const PILOT_CALL_REPEAT_MS = 20_000

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
  missed_handoff: 0,
} as const

// ─── Colors ───────────────────────────────────────────────────────────────────
// PRD §18.3 - Authentic ATC Phosphor Scope Palette

export const COLORS = {
  bg: {
    primary: 0x020408,
    surface: 0x0a0f16,
    card: 0x121824,
  },
  accent: {
    primary: 0x00ff66,
    blue: 0x00e5ff,
    amber: 0xffd600,
    red: 0xff1744,
  },
  aircraft: {
    departure: 0x00ff66,
    arrival: 0x00e5ff,
    urgent: 0xffd600,
    violation: 0xff1744,
  },
  text: {
    primary: 0xf3f4f6,
    secondary: 0x94a3b8,
    muted: 0x64748b,
    disabled: 0x646464,
  },
  log: {
    atc: 0x00ff66,
    pilot: 0x00e5ff,
    system: 0xb4b4b4,
    critical: 0xff1744,
  },
} as const

// ─── CSS Color Strings (for React components) ────────────────────────────────

export const CSS_COLORS = {
  bg: {
    primary: '#020408',
    surface: '#0A0F16',
    card: '#121824',
  },
  accent: {
    primary: '#00FF66',
    blue: '#00E5FF',
    amber: '#FFD600',
    red: '#FF1744',
  },
  aircraft: {
    departure: '#00FF66',
    arrival: '#00E5FF',
    urgent: '#FFD600',
    violation: '#FF1744',
  },
  text: {
    primary: '#F3F4F6',
    secondary: '#94A3B8',
    muted: '#64748B',
    disabled: '#646464',
  },
  log: {
    atc: '#00FF66',
    pilot: '#00E5FF',
    system: '#B4B4B4',
    critical: '#FF1744',
  },
} as const

// ─── Radar Render Configuration ──────────────────────────────────────────────

export const RADAR_RENDER_CONFIG = {
  HISTORY_DOT_COUNT: 4,
  HISTORY_DECAY_ALPHAS: [0.9, 0.65, 0.4, 0.2],
  VECTOR_TICK_MINUTES: [1, 2],
  SCOPE_BG_COLOR: 0x020408,
  SCOPE_BEZEL_COLOR: 0x1a2332,
  NAVAID_SYMBOL_COLOR: 0x38bdf8,
  APPROACH_FUNNEL_COLOR: 0x1e3a5f,
} as const

