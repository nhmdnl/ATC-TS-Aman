import type { CareerState, Grade, ScoreReason } from './types'
import { XP_PER_REASON, GRADE_THRESHOLDS } from './constants'
import { eventBus } from './event-bus'
import { GameEventType } from './types'
import type { GameEvent } from './types'

const STORAGE_KEY = 'atc_aman_career'

export class CareerSystem {
  state: CareerState = {
    xp: 0,
    level: 1,
    sessionsPlayed: 0,
    bestGrade: null,
    highScore: 0
  }

  constructor() {
    this.load()
    // Listen for score events to accumulate XP
    eventBus.on(GameEventType.SCORE_CHANGED, (e: GameEvent) => {
      const reason = e.payload.reason as ScoreReason
      if (reason && XP_PER_REASON[reason]) {
        this.addXP(XP_PER_REASON[reason])
      }
    })

    // Listen for session end to record stats
    eventBus.on(GameEventType.SESSION_ENDED, (e: GameEvent) => {
      this.state.sessionsPlayed++
      const score = e.payload.score as number | undefined
      const grade = e.payload.grade as Grade | undefined
      if (typeof score === 'number' && grade) {
        this.recordSessionResult(score, grade)
      }
      this.save()
    })
  }

  addXP(amount: number): void {
    this.state.xp += amount
    
    // Level up every 100 XP
    const newLevel = Math.floor(this.state.xp / 100) + 1
    if (newLevel > this.state.level) {
      this.state.level = newLevel
      // Could emit LEVEL_UP event here
    }
    
    this.save()
  }

  recordSessionResult(score: number, grade: Grade): void {
    if (score > this.state.highScore) {
      this.state.highScore = score
    }

    // Grade comparison (S > A > B > C > D)
    const gradeRanks = { 'S': 5, 'A': 4, 'B': 3, 'C': 2, 'D': 1 }
    const currentBestRank = this.state.bestGrade ? gradeRanks[this.state.bestGrade] : 0
    if (gradeRanks[grade] > currentBestRank) {
      this.state.bestGrade = grade
    }

    this.save()
  }

  private load(): void {
    try {
      const stored = localStorage.getItem(STORAGE_KEY)
      if (stored) {
        this.state = JSON.parse(stored)
      }
    } catch (e) {
      console.warn('Failed to load career state', e)
    }
  }

  private save(): void {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.state))
    } catch (e) {
      console.warn('Failed to save career state', e)
    }
  }
}

export const careerSystem = new CareerSystem()

// ─── Career unlocks ───────────────────────────────────────────────────────────
// Level gates content: harder difficulties, extra airports, and a rank title.
// Level 1 = always available. Levels come from addXP (100 XP each).

/** Controller rank shown on the end screen — highest entry the level clears. */
export const RANK_TITLES: ReadonlyArray<{ minLevel: number; title: string }> = [
  { minLevel: 1, title: 'Trainee' },
  { minLevel: 2, title: 'Ground Controller' },
  { minLevel: 3, title: 'Tower Controller' },
  { minLevel: 5, title: 'Approach Controller' },
  { minLevel: 8, title: 'Center Controller' },
  { minLevel: 12, title: 'Watch Supervisor' },
]

export function rankTitle(level: number): string {
  let title = RANK_TITLES[0].title
  for (const r of RANK_TITLES) if (level >= r.minLevel) title = r.title
  return title
}

/** Minimum level to select each difficulty preset. */
export const DIFFICULTY_UNLOCK_LEVEL: Record<string, number> = { easy: 1, medium: 2, hard: 3 }

/** Minimum level to select each airport (by ICAO); unlisted airports are open. */
export const AIRPORT_UNLOCK_LEVEL: Record<string, number> = { HHAS: 1, DRMLND: 2 }

export function airportUnlockLevel(icao: string): number {
  return AIRPORT_UNLOCK_LEVEL[icao] ?? 1
}
