import { describe, it, expect } from 'vitest'
import {
  normalizeHeading,
  headingToRadians,
  distanceNM,
  bearingBetween,
  turnToward,
} from '../movement'

describe('movement — math utilities', () => {
  describe('normalizeHeading', () => {
    it('returns heading unchanged for 0-359', () => {
      expect(normalizeHeading(0)).toBe(0)
      expect(normalizeHeading(90)).toBe(90)
      expect(normalizeHeading(180)).toBe(180)
      expect(normalizeHeading(270)).toBe(270)
      expect(normalizeHeading(359)).toBe(359)
    })

    it('wraps values >= 360', () => {
      expect(normalizeHeading(360)).toBe(0)
      expect(normalizeHeading(450)).toBe(90)
      expect(normalizeHeading(720)).toBe(0)
      expect(normalizeHeading(540)).toBe(180)
    })

    it('wraps negative values to 0-359', () => {
      expect(normalizeHeading(-90)).toBe(270)
      expect(normalizeHeading(-180)).toBe(180)
      expect(normalizeHeading(-1)).toBe(359)
      // Use === (not toBe/Object.is) because JS -0 === +0 is true
      expect(normalizeHeading(-360) === 0).toBe(true)
      expect(normalizeHeading(-450)).toBe(270)
    })

    it('handles large positive values', () => {
      expect(normalizeHeading(3600)).toBe(0)
      expect(normalizeHeading(361)).toBe(1)
    })
  })

  describe('headingToRadians', () => {
    it('heading 0 (North) maps to 90 degrees in radians (Math.cos/sin convention)', () => {
      const rad = headingToRadians(0)
      expect(rad).toBeCloseTo(Math.PI / 2, 6)
    })

    it('heading 90 (East) maps to 0 radians', () => {
      const rad = headingToRadians(90)
      expect(rad).toBeCloseTo(0, 6)
    })

    it('heading 180 (South) maps to -pi/2 radians', () => {
      const rad = headingToRadians(180)
      expect(rad).toBeCloseTo(-Math.PI / 2, 6)
    })

    it('heading 270 (West) maps to -pi radians (equivalent to pi)', () => {
      const rad = headingToRadians(270)
      // (90 - 270) * PI / 180 = -PI, which is equivalent to PI directionally
      expect(Math.abs(rad)).toBeCloseTo(Math.PI, 6)
    })
  })

  describe('distanceNM', () => {
    it('returns 0 for same point', () => {
      expect(distanceNM(0, 0, 0, 0)).toBe(0)
      expect(distanceNM(5, 3, 5, 3)).toBe(0)
    })

    it('returns correct distance for horizontal offset', () => {
      expect(distanceNM(0, 0, 10, 0)).toBe(10)
      expect(distanceNM(0, 0, -5, 0)).toBe(5)
    })

    it('returns correct distance for vertical offset', () => {
      expect(distanceNM(0, 0, 0, 5)).toBe(5)
    })

    it('returns Pythagorean distance', () => {
      const d = distanceNM(0, 0, 3, 4)
      expect(d).toBeCloseTo(5, 6)
    })

    it('order of points does not matter', () => {
      const d1 = distanceNM(1, 2, 5, 6)
      const d2 = distanceNM(5, 6, 1, 2)
      expect(d1).toBeCloseTo(d2, 6)
    })
  })

  describe('bearingBetween', () => {
    it('point straight north (dx=0, dy>0) gives heading 0', () => {
      expect(bearingBetween(0, 0, 0, 1)).toBe(0)
    })

    it('point straight east (dx>0, dy=0) gives heading 90', () => {
      expect(bearingBetween(0, 0, 1, 0)).toBe(90)
    })

    it('point straight south (dx=0, dy<0) gives heading 180', () => {
      expect(bearingBetween(0, 0, 0, -1)).toBe(180)
    })

    it('point straight west (dx<0, dy=0) gives heading 270', () => {
      expect(bearingBetween(0, 0, -1, 0)).toBe(270)
    })

    it('NE direction gives heading around 45', () => {
      const bearing = bearingBetween(0, 0, 1, 1)
      expect(bearing).toBeCloseTo(45, 0)
    })
  })

  describe('turnToward', () => {
    it('returns target heading when within turn rate', () => {
      expect(turnToward(0, 5, 10)).toBe(5)
      expect(turnToward(90, 100, 15)).toBe(100)
    })

    it('turns right when target is clockwise within 180', () => {
      // 0 to 90: clockwise (positive diff = 90)
      const result = turnToward(0, 90, 30)
      expect(result).toBe(30)
    })

    it('turns left when diff > 180 (shorter left path)', () => {
      // 0 to 270: diff = 270 > 180, so left turn: 0 - 30 = 330
      const result = turnToward(0, 270, 30)
      expect(result).toBe(330)
    })

    it('handles crossing 360/0 boundary turning right', () => {
      // 350 to 20: diff = 30, turn right +30 = 20 (within 30 deg rate)
      const result = turnToward(350, 20, 30)
      expect(result).toBe(20)
    })

    it('handles crossing 360/0 boundary turning left', () => {
      // 20 to 350: diff = 330 > 180, left path: -30 = 350 (350)
      const result = turnToward(20, 350, 30)
      expect(result).toBe(350)
    })

    it('exact opposite (180 diff) defaults to right turn', () => {
      // 0 to 180: diff = 180, > 180 is false, turnAmount = 180
      // 180 > maxTurnRate(45), so result = 0 + 45 = 45
      const result = turnToward(0, 180, 45)
      expect(result).toBe(45)
    })

    it('zero turn rate means no movement', () => {
      const result = turnToward(0, 90, 0)
      expect(result).toBe(0)
    })
  })
})
