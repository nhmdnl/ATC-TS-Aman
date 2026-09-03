import { describe, it, expect, vi, afterEach } from 'vitest'
import { selectCanonicalEntries } from '../airport-registry'
import type { AirportEntry } from '../airport-registry'
import type { Airport } from '../../engine/types'

/**
 * Regression: an untracked `HHAS2.airport` scratch copy declared ICAO "HHAS"
 * alongside the shipped `hhas.airport.json`, so the registry produced two
 * entries with the same id — React logged "two children with the same key:
 * HHAS" on the briefing picker and both buttons selected the same field.
 */

function entry(id: string, fileName: string): AirportEntry {
  return { id, fileName, airport: { metadata: { icao: id } } as unknown as Airport }
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe('selectCanonicalEntries', () => {
  it('keeps one entry per ICAO', () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    const out = selectCanonicalEntries([
      entry('HHAS', 'HHAS2.airport'),
      entry('HHAS', 'hhas.airport.json'),
    ])
    expect(out).toHaveLength(1)
    expect(out.map(e => e.id)).toEqual(['HHAS'])
  })

  it('prefers the canonical .airport.json over a hand-saved .airport copy', () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    const out = selectCanonicalEntries([
      entry('HHAS', 'HHAS2.airport'),
      entry('HHAS', 'hhas.airport.json'),
    ])
    expect(out[0].fileName).toBe('hhas.airport.json')
  })

  it('warns naming both files so the duplicate is findable', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    selectCanonicalEntries([
      entry('HHAS', 'HHAS2.airport'),
      entry('HHAS', 'hhas.airport.json'),
    ])
    expect(warn).toHaveBeenCalledTimes(1)
    const msg = warn.mock.calls[0][0] as string
    expect(msg).toContain('HHAS2.airport')
    expect(msg).toContain('hhas.airport.json')
  })

  it('produces unique ids — the React key requirement', () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    const out = selectCanonicalEntries([
      entry('HHAS', 'HHAS2.airport'),
      entry('HHAS', 'hhas.airport.json'),
      entry('DRMLND', 'DRMLND.airport'),
    ])
    expect(new Set(out.map(e => e.id)).size).toBe(out.length)
  })

  it('leaves distinct airports alone and lists HHAS first', () => {
    const out = selectCanonicalEntries([
      entry('DRMLND', 'DRMLND.airport'),
      entry('HHAS', 'hhas.airport.json'),
    ])
    expect(out.map(e => e.id)).toEqual(['HHAS', 'DRMLND'])
  })
})
