import { describe, it, expect } from 'vitest'
import {
  rankTitle,
  RANK_TITLES,
  DIFFICULTY_UNLOCK_LEVEL,
  airportUnlockLevel,
} from '../career-system'

describe('career unlocks', () => {
  describe('rankTitle', () => {
    it('returns the lowest rank at level 1', () => {
      expect(rankTitle(1)).toBe('Trainee')
    })

    it('picks the highest rank the level clears', () => {
      expect(rankTitle(2)).toBe('Ground Controller')
      expect(rankTitle(3)).toBe('Tower Controller')
      expect(rankTitle(4)).toBe('Tower Controller') // no threshold at 4 — holds
      expect(rankTitle(5)).toBe('Approach Controller')
    })

    it('never exceeds the top rank', () => {
      expect(rankTitle(999)).toBe(RANK_TITLES[RANK_TITLES.length - 1].title)
    })

    it('clamps sub-1 levels to the first rank', () => {
      expect(rankTitle(0)).toBe('Trainee')
    })
  })

  describe('unlock levels', () => {
    it('easy is always available; harder tiers gate up', () => {
      expect(DIFFICULTY_UNLOCK_LEVEL.easy).toBe(1)
      expect(DIFFICULTY_UNLOCK_LEVEL.medium).toBeGreaterThan(1)
      expect(DIFFICULTY_UNLOCK_LEVEL.hard).toBeGreaterThan(DIFFICULTY_UNLOCK_LEVEL.medium)
    })

    it('HHAS is open at level 1; extra airports gate higher', () => {
      expect(airportUnlockLevel('HHAS')).toBe(1)
      expect(airportUnlockLevel('DRMLND')).toBeGreaterThan(1)
    })

    it('unlisted airports default to open', () => {
      expect(airportUnlockLevel('ZZZZ')).toBe(1)
    })
  })
})
