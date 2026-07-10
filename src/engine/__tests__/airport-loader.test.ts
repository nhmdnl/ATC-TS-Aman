import { describe, it, expect } from 'vitest'
import { loadAirport, selectActiveRunway } from '../airport-loader'
import hhasData from '../../data/airports/hhas.airport.json'

const airport = loadAirport(hhasData)

describe('selectActiveRunway', () => {
  it('picks the into-wind end of the main strip', () => {
    expect(selectActiveRunway(airport, { direction: 70, speed: 10 })?.id).toBe('07')
    expect(selectActiveRunway(airport, { direction: 250, speed: 10 })?.id).toBe('25')
  })

  it('keeps the first-listed end in calm wind (previous runways[0] default)', () => {
    expect(selectActiveRunway(airport, { direction: 0, speed: 0 })?.id).toBe('07')
  })

  it('never diverts to the short secondary strip even with wind straight down it', () => {
    // Wind aligned with runway 30 — naive max-headwind would pick it, but
    // 07/25 is the longer strip so ops stay there.
    expect(selectActiveRunway(airport, { direction: 311, speed: 15 })?.id).toBe('25')
  })

  it('returns null when the airport has no runways', () => {
    expect(selectActiveRunway({ ...airport, runways: [] }, { direction: 70, speed: 10 })).toBeNull()
  })
})
