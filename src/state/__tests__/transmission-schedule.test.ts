import { describe, it, expect } from 'vitest'
import { transmissionSchedule } from '../useAudio'

describe('transmissionSchedule', () => {
  it('pilot readback starts only after ATC finishes plus the gap', () => {
    const s = transmissionSchedule(1000, 0, 3000, 2000)
    expect(s.atcStartMs).toBe(1000)
    expect(s.pilotStartMs).toBeGreaterThanOrEqual(1000 + 3000) // never overlaps ATC
    expect(s.busyUntilMs).toBe(s.pilotStartMs + 2000)
  })

  it('waits for a transmission already on frequency', () => {
    const s = transmissionSchedule(1000, 5000, 3000, 2000)
    expect(s.atcStartMs).toBe(5000)
  })

  it('back-to-back commands never overlap', () => {
    const a = transmissionSchedule(0, 0, 3000, 2000)
    const b = transmissionSchedule(10, a.busyUntilMs, 1000, 1000)
    expect(b.atcStartMs).toBeGreaterThanOrEqual(a.pilotStartMs + 2000)
  })

  it('pilot-only call (no ATC) starts as soon as the frequency is free', () => {
    const s = transmissionSchedule(1000, 0, 0, 2000)
    expect(s.pilotStartMs).toBe(1000)
    expect(s.busyUntilMs).toBe(3000)
  })

  it('ATC-only transmission frees the frequency at ATC end', () => {
    const s = transmissionSchedule(1000, 0, 3000, 0)
    expect(s.busyUntilMs).toBe(4000)
  })
})
