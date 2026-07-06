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
