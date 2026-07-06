import type {
  Aircraft,
  Airport,
  DifficultyPreset,
  DifficultyLevel,
  ScoreEvent,
  ScoreDimensions,
  Grade,
  Wind,
  RadioMessage,
  GameStateSnapshot,
  TaxiwayGraph,
} from './types'
import { ControllerStation } from './types'
import {
  INITIAL_SCORE,
  MIN_SCORE,
  MAX_SCORE,
  MAX_SCORE_EVENTS,
  GRADE_THRESHOLDS,
  DIFFICULTY_PRESETS,
} from './constants'

// ─── Game State ───────────────────────────────────────────────────────────────
/**
 * Central mutable game state. Owns all aircraft, scoring, and session data.
 * React components read snapshots; the simulation tick mutates directly.
 */
export class GameState {
  // ── Aircraft ──
  /** All active aircraft keyed by id */
  aircraft: Map<string, Aircraft> = new Map()

  /** Currently selected aircraft id (null = none) */
  selectedAircraftId: string | null = null

  // ── Scoring ──
  score: number = INITIAL_SCORE
  scoreDimensions: ScoreDimensions = {
    safety: 0,
    efficiency: 0,
    communication: 0,
    procedure: 0,
    awareness: 0,
  }
  scoreEvents: ScoreEvent[] = []
  aircraftHandled: number = 0

  // ── Session ──
  paused: boolean = false
  elapsedMs: number = 0
  difficulty: DifficultyPreset = DIFFICULTY_PRESETS.easy
  wind: Wind = { direction: 340, speed: 4 }
  sessionStartTime: number = 0
  sessionStarted: boolean = false
  sessionEnded: boolean = false
  /** Which stations the player personally controls this session; any station
   *  not in this list is driven by ai-controller.ts. Defaults to all three
   *  (today's behavior) unless narrowed at the briefing screen. */
  playerStations: ControllerStation[] = [ControllerStation.GROUND, ControllerStation.TOWER, ControllerStation.APPROACH]

  // ── Airport ──
  airport: Airport | null = null
  taxiwayGraph: TaxiwayGraph | null = null

  // ── Spawning ──
  lastSpawnTime: number = 0
  occupiedGateIds: Set<string> = new Set()

  // ── Separation ──
  /** Pair keys that are currently in cooldown */
  separationCooldowns: Map<string, number> = new Map()

  // ── Radio Log ──
  radioLog: RadioMessage[] = []

  // ── Methods ──

  /** Add an aircraft to the simulation */
  addAircraft(aircraft: Aircraft): void {
    this.aircraft.set(aircraft.id, aircraft)
    if (aircraft.assignedGate) {
      this.occupiedGateIds.add(aircraft.assignedGate)
    }
  }

  /** Remove an aircraft by id */
  removeAircraft(id: string): void {
    const ac = this.aircraft.get(id)
    if (ac?.assignedGate) {
      this.occupiedGateIds.delete(ac.assignedGate)
    }
    this.aircraft.delete(id)
  }

  /** Get aircraft by callsign (case-insensitive) */
  getAircraftByCallsign(callsign: string): Aircraft | undefined {
    const upper = callsign.toUpperCase()
    for (const ac of this.aircraft.values()) {
      if (ac.callsign.toUpperCase() === upper) return ac
    }
    return undefined
  }

  /** Get all aircraft in a given phase */
  getAircraftByPhase(phase: string): Aircraft[] {
    return Array.from(this.aircraft.values()).filter(ac => ac.phase === phase)
  }

  /** Get currently selected aircraft */
  getSelectedAircraft(): Aircraft | null {
    if (!this.selectedAircraftId) return null
    return this.aircraft.get(this.selectedAircraftId) ?? null
  }

  /** Select an aircraft by id (deselects previous) */
  selectAircraft(id: string | null): void {
    // Deselect previous
    if (this.selectedAircraftId) {
      const prev = this.aircraft.get(this.selectedAircraftId)
      if (prev) prev.isSelected = false
    }
    this.selectedAircraftId = id
    if (id) {
      const ac = this.aircraft.get(id)
      if (ac) ac.isSelected = true
    }
  }

  /** Record a score event */
  addScoreEvent(event: ScoreEvent): void {
    this.scoreEvents.push(event)
    if (this.scoreEvents.length > MAX_SCORE_EVENTS) {
      this.scoreEvents.shift()
    }
    this.score = Math.max(MIN_SCORE, Math.min(MAX_SCORE, this.score + event.delta))
  }

  /** Add a radio message to the log */
  addRadioMessage(message: RadioMessage): void {
    this.radioLog.push(message)
    // Keep log manageable — last 200 messages
    if (this.radioLog.length > 200) {
      this.radioLog.shift()
    }
  }

  /** Compute letter grade from current score */
  getGrade(): Grade {
    for (const { min, grade } of GRADE_THRESHOLDS) {
      if (this.score >= min) return grade
    }
    return 'D'
  }

  /** Check if session time has expired */
  isSessionExpired(): boolean {
    return this.elapsedMs >= this.difficulty.sessionDurationMs
  }

  /** Set difficulty and apply wind */
  setDifficulty(level: DifficultyLevel): void {
    this.difficulty = DIFFICULTY_PRESETS[level]
    this.wind = {
      direction: this.difficulty.windDirection,
      speed: this.difficulty.windSpeed,
    }
  }

  /** Reset to initial state for a new session */
  reset(): void {
    this.aircraft.clear()
    this.selectedAircraftId = null
    this.score = INITIAL_SCORE
    this.scoreDimensions = { safety: 0, efficiency: 0, communication: 0, procedure: 0, awareness: 0 }
    this.scoreEvents = []
    this.aircraftHandled = 0
    this.paused = false
    this.elapsedMs = 0
    this.sessionStartTime = Date.now()
    this.sessionStarted = false
    this.sessionEnded = false
    this.playerStations = [ControllerStation.GROUND, ControllerStation.TOWER, ControllerStation.APPROACH]
    this.lastSpawnTime = 0
    this.occupiedGateIds.clear()
    this.separationCooldowns.clear()
    this.radioLog = []
  }

  /** Create a read-only snapshot for mission checks */
  snapshot(): GameStateSnapshot {
    return {
      aircraft: new Map(this.aircraft),
      score: this.score,
      scoreDimensions: { ...this.scoreDimensions },
      elapsedMs: this.elapsedMs,
      aircraftHandled: this.aircraftHandled,
      paused: this.paused,
      difficulty: this.difficulty.level,
      grade: this.getGrade(),
      sessionStarted: this.sessionStarted,
      sessionEnded: this.sessionEnded,
      airport: this.airport,
      radioMessages: [...this.radioLog],
      wind: { ...this.wind },
      playerStations: [...this.playerStations],
    }
  }

  /** Get all aircraft as an array (convenience) */
  allAircraft(): Aircraft[] {
    return Array.from(this.aircraft.values())
  }

  /** Count of active aircraft */
  get trafficCount(): number {
    return this.aircraft.size
  }
}

/** Singleton game state instance */
export const gameState = new GameState()
