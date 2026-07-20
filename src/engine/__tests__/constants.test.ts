import { describe, it, expect } from 'vitest'
import {
  SCORE_DELTAS,
  GRADE_THRESHOLDS,
  DIFFICULTY_PRESETS,
  MRS_NM,
  SEPARATION_FT,
  MVA_FT,
  INITIAL_SCORE,
  MIN_SCORE,
  MAX_SCORE,
  PX_PER_NM,
  AIRBORNE_PHASES,
  PHASE_CONTROLLER,
} from '../constants'
import {
  AircraftPhase,
  ControllerStation,
  DifficultyLevel,
} from '../types'

describe('constants', () => {
  describe('SCORE_DELTAS', () => {
    const expectedReasons = [
      'command_issued',
      'takeoff',
      'landing',
      'departure_handoff',
      'arrived_gate',
      'missed_approach',
      'separation_violation',
    ] as const

    it('has entries for every expected ScoreReason', () => {
      for (const reason of expectedReasons) {
        expect(SCORE_DELTAS).toHaveProperty(reason)
      }
    })

    it('has positive deltas for good events', () => {
      expect(SCORE_DELTAS.command_issued).toBeGreaterThan(0)
      expect(SCORE_DELTAS.takeoff).toBeGreaterThan(0)
      expect(SCORE_DELTAS.landing).toBeGreaterThan(0)
      expect(SCORE_DELTAS.departure_handoff).toBeGreaterThan(0)
      expect(SCORE_DELTAS.arrived_gate).toBeGreaterThan(0)
    })

    it('has negative deltas for bad events', () => {
      expect(SCORE_DELTAS.missed_approach).toBeLessThan(0)
      expect(SCORE_DELTAS.separation_violation).toBeLessThan(0)
    })

    it('separation_violation is the most severe penalty', () => {
      expect(SCORE_DELTAS.separation_violation).toBeLessThan(SCORE_DELTAS.missed_approach)
    })
  })

  describe('GRADE_THRESHOLDS', () => {
    it('has exactly 5 grades: S, A, B, C, D', () => {
      expect(GRADE_THRESHOLDS).toHaveLength(5)
      const grades = GRADE_THRESHOLDS.map(g => g.grade)
      expect(grades).toEqual(['S', 'A', 'B', 'C', 'D'])
    })

    it('is sorted descending by min score', () => {
      for (let i = 1; i < GRADE_THRESHOLDS.length; i++) {
        expect(GRADE_THRESHOLDS[i - 1].min).toBeGreaterThan(GRADE_THRESHOLDS[i].min)
      }
    })

    it('S grade requires at least 1500', () => {
      expect(GRADE_THRESHOLDS[0]).toEqual({ min: 1500, grade: 'S' })
    })

    it('D grade covers score 0 and above', () => {
      const d = GRADE_THRESHOLDS[GRADE_THRESHOLDS.length - 1]
      expect(d.grade).toBe('D')
      expect(d.min).toBe(0)
    })

    it('all grade thresholds are within score bounds', () => {
      for (const { min } of GRADE_THRESHOLDS) {
        expect(min).toBeGreaterThanOrEqual(0)
        expect(min).toBeLessThanOrEqual(MAX_SCORE)
      }
    })
  })

  describe('DIFFICULTY_PRESETS', () => {
    const levels: DifficultyLevel[] = ['easy', 'medium', 'hard']

    for (const level of levels) {
      it(`has correct structure for ${level}`, () => {
        const preset = DIFFICULTY_PRESETS[level]
        expect(preset).toBeDefined()
        expect(preset.level).toBe(level)
        expect(preset.spawnIntervalMs).toBeGreaterThan(0)
        expect(preset.maxAircraft).toBeGreaterThan(0)
        expect(preset.windDirection).toBeGreaterThanOrEqual(0)
        expect(preset.windDirection).toBeLessThan(360)
        expect(preset.windSpeed).toBeGreaterThanOrEqual(0)
        expect(preset.sessionDurationMs).toBeGreaterThan(0)
      })
    }

    it('easy has longer spawn interval than medium', () => {
      expect(DIFFICULTY_PRESETS.easy.spawnIntervalMs)
        .toBeGreaterThan(DIFFICULTY_PRESETS.medium.spawnIntervalMs)
    })

    it('medium has longer spawn interval than hard', () => {
      expect(DIFFICULTY_PRESETS.medium.spawnIntervalMs)
        .toBeGreaterThan(DIFFICULTY_PRESETS.hard.spawnIntervalMs)
    })

    it('easy has fewer max aircraft than medium', () => {
      expect(DIFFICULTY_PRESETS.easy.maxAircraft)
        .toBeLessThan(DIFFICULTY_PRESETS.medium.maxAircraft)
    })

    it('medium has fewer max aircraft than hard', () => {
      expect(DIFFICULTY_PRESETS.medium.maxAircraft)
        .toBeLessThan(DIFFICULTY_PRESETS.hard.maxAircraft)
    })

    it('increasing wind speed with difficulty', () => {
      expect(DIFFICULTY_PRESETS.easy.windSpeed)
        .toBeLessThan(DIFFICULTY_PRESETS.medium.windSpeed)
      expect(DIFFICULTY_PRESETS.medium.windSpeed)
        .toBeLessThan(DIFFICULTY_PRESETS.hard.windSpeed)
    })
  })

  describe('separation constants', () => {
    it('minimum radar separation is 3 NM', () => {
      expect(MRS_NM).toBe(3)
    })

    it('vertical separation is 1000 ft', () => {
      expect(SEPARATION_FT).toBe(1000)
    })

    it('MVA is 8800 ft', () => {
      expect(MVA_FT).toBe(8800)
    })
  })

  describe('score bounds', () => {
    it('initial score is 1000', () => {
      expect(INITIAL_SCORE).toBe(1000)
    })

    it('min score is -500 (violations keep costing below zero, user decision 2026-07-18)', () => {
      expect(MIN_SCORE).toBe(-500)
    })

    it('max score is 2000', () => {
      expect(MAX_SCORE).toBe(2000)
    })
  })

  describe('PX_PER_NM', () => {
    it('is 64 pixels per nautical mile', () => {
      expect(PX_PER_NM).toBe(64)
    })
  })

  describe('PHASE_CONTROLLER', () => {
    it('maps every AircraftPhase to a ControllerStation', () => {
      const phases = Object.values(AircraftPhase)
      for (const phase of phases) {
        expect(PHASE_CONTROLLER).toHaveProperty(phase)
        const station = PHASE_CONTROLLER[phase]
        expect(Object.values(ControllerStation)).toContain(station)
      }
    })

    it('ground handles taxi phases', () => {
      expect(PHASE_CONTROLLER[AircraftPhase.AT_GATE]).toBe(ControllerStation.GROUND)
      expect(PHASE_CONTROLLER[AircraftPhase.TAXI_OUT]).toBe(ControllerStation.GROUND)
      expect(PHASE_CONTROLLER[AircraftPhase.TAXI_IN]).toBe(ControllerStation.GROUND)
      expect(PHASE_CONTROLLER[AircraftPhase.ARRIVED]).toBe(ControllerStation.GROUND)
    })

    it('tower handles runway phases', () => {
      expect(PHASE_CONTROLLER[AircraftPhase.HOLD_SHORT]).toBe(ControllerStation.TOWER)
      expect(PHASE_CONTROLLER[AircraftPhase.LINE_UP]).toBe(ControllerStation.TOWER)
      expect(PHASE_CONTROLLER[AircraftPhase.TAKEOFF_ROLL]).toBe(ControllerStation.TOWER)
      expect(PHASE_CONTROLLER[AircraftPhase.LANDING]).toBe(ControllerStation.TOWER)
      expect(PHASE_CONTROLLER[AircraftPhase.ROLLOUT]).toBe(ControllerStation.TOWER)
    })

    it('approach handles arrival phases', () => {
      expect(PHASE_CONTROLLER[AircraftPhase.ENTERING]).toBe(ControllerStation.APPROACH)
      expect(PHASE_CONTROLLER[AircraftPhase.APPROACH]).toBe(ControllerStation.APPROACH)
      expect(PHASE_CONTROLLER[AircraftPhase.MISSED]).toBe(ControllerStation.APPROACH)
    })
  })

  describe('AIRBORNE_PHASES', () => {
    it('contains all flying phases', () => {
      expect(AIRBORNE_PHASES.has(AircraftPhase.CLIMBING)).toBe(true)
      expect(AIRBORNE_PHASES.has(AircraftPhase.ENTERING)).toBe(true)
      expect(AIRBORNE_PHASES.has(AircraftPhase.APPROACH)).toBe(true)
      expect(AIRBORNE_PHASES.has(AircraftPhase.FINAL)).toBe(true)
      expect(AIRBORNE_PHASES.has(AircraftPhase.LANDING)).toBe(true)
      expect(AIRBORNE_PHASES.has(AircraftPhase.MISSED)).toBe(true)
    })

    it('does not contain ground phases', () => {
      expect(AIRBORNE_PHASES.has(AircraftPhase.AT_GATE)).toBe(false)
      expect(AIRBORNE_PHASES.has(AircraftPhase.TAXI_OUT)).toBe(false)
      expect(AIRBORNE_PHASES.has(AircraftPhase.HOLD_SHORT)).toBe(false)
      expect(AIRBORNE_PHASES.has(AircraftPhase.DEPARTED)).toBe(false)
      expect(AIRBORNE_PHASES.has(AircraftPhase.ARRIVED)).toBe(false)
    })
  })
})
