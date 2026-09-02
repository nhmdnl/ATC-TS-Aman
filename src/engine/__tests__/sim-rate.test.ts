import { describe, it, expect } from 'vitest'
import { gameState } from '../game-state'
import { SIM_RATES } from '../constants'

describe('sim rate', () => {
  it('defaults to real time (1×)', () => {
    expect(gameState.simRate).toBe(1)
  })

  it('is carried on the snapshot for the UI', () => {
    gameState.simRate = 4
    expect(gameState.snapshot().simRate).toBe(4)
    gameState.simRate = 1
  })

  it('resets back to 1× on a new session', () => {
    gameState.simRate = 4
    gameState.reset()
    expect(gameState.simRate).toBe(1)
  })

  it('offers the 1/2/4 multiplier ladder the UI and hotkeys cycle', () => {
    expect([...SIM_RATES]).toEqual([1, 2, 4])
  })
})
