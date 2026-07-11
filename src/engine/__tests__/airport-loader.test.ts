import { describe, it, expect } from 'vitest'
import { loadAirport, selectActiveRunway, buildTaxiwayGraph } from '../airport-loader'
import hhasData from '../../data/airports/hhas.airport.json'

const airport = loadAirport(hhasData)

/** Minimal meter-true "1.1" editor file: one 3000 m runway along +X, an
 *  L-shaped taxiway to a gate, and the export-derived taxi graph. */
function makeV11File(): any {
  return {
    version: '1.1',
    metadata: {
      name: 'Test Field', icao: 'TEST', iata: 'TST', country: 'XX',
      elevation: 5000, magneticVariation: 0,
      frequencies: [
        { name: 'TOWER', frequency: 119.5, callsign: 'Testfield Tower' },
        { name: 'GROUND', frequency: 121.6, callsign: 'Testfield Ground' },
      ],
    },
    objects: [
      {
        type: 'runway', name: 'RWY 09/27', position: { x: 1500, y: 0 },
        start: { x: 0, y: 0 }, end: { x: 3000, y: 0 }, width: 45, surface: 'asphalt',
        identifiers: { forward: '09', reverse: '27' },
        ops: {
          forward: { ils: true, pattern: 'right', missedHeading: 120, missedAltitude: 9000 },
          reverse: { ils: false, pattern: 'left', missedHeading: null, missedAltitude: null },
        },
      },
      { type: 'gate', name: 'G1', position: { x: 1000, y: 500 } },
      { type: 'spawn', name: 'ARR_NE', position: { x: 20000, y: 20000 }, heading: 225, altitude: 11000 },
    ],
    taxiGraph: {
      nodes: [
        { id: 'n0', x: 1000, y: 0, kind: 'runway-entry', ref: '09/27' },
        { id: 'n1', x: 1000, y: 83, kind: 'hold-short', ref: '09/27' },
        { id: 'n2', x: 1000, y: 500, kind: 'gate', ref: 'G1' },
      ],
      edges: [
        { from: 'n0', to: 'n1', name: 'A' },
        { from: 'n1', to: 'n2', name: 'A' },
      ],
    },
  }
}

describe('loadAirport — editor v1.1 (meter-true)', () => {
  const v11 = loadAirport(makeV11File())

  it('converts meter coordinates at 1/1852 (3000 m runway ≈ 9843 ft)', () => {
    const rwy09 = v11.runways.find(r => r.id === '09')!
    expect(rwy09.length).toBeCloseTo((3000 / 1852) * 6076.12, 0)
  })

  it('applies per-end runway ops (ils, pattern, missed approach)', () => {
    const rwy09 = v11.runways.find(r => r.id === '09')!
    const rwy27 = v11.runways.find(r => r.id === '27')!
    expect(rwy09.ils).toEqual({ frequency: 0, available: true })
    expect(rwy09.pattern).toBe('right')
    expect(rwy09.missedHeading).toBe(120)
    expect(rwy09.missedAltitude).toBe(9000)
    expect(rwy27.ils).toBeNull()
    expect(rwy27.missedHeading).toBeNull()
  })

  it('uses metadata frequencies instead of defaults', () => {
    expect(v11.frequencies.find(f => f.name === 'TOWER')?.frequency).toBe(119.5)
    expect(v11.frequencies.find(f => f.name === 'TOWER')?.callsign).toBe('Testfield Tower')
  })

  it('parses spawn objects as arrival spawn points in NM', () => {
    const sp = v11.spawnPoints.find(s => s.id === 'ARR_NE')!
    expect(sp.type).toBe('arrival')
    expect(sp.heading).toBe(225)
    expect(sp.altitude).toBe(11000)
    // 20000 m east of the runway-position origin at (1500, 0)
    expect(sp.x).toBeCloseTo((20000 - 1500) / 1852, 3)
  })

  it('turns taxiGraph into a routable TaxiwayData that buildTaxiwayGraph accepts', () => {
    expect(v11.taxiways).toHaveLength(1)
    const nodes = v11.taxiways[0].nodes
    expect(nodes.find(n => n.id === 'n1')?.kind).toBe('hold-short')
    expect(nodes.find(n => n.id === 'n1')?.ref).toBe('09/27')
    const graph = buildTaxiwayGraph(v11)
    expect(graph.adjacency.get('n1')).toEqual(['n0', 'n2'])
  })

  it('does not mock gates for 1.1 files (real gate only)', () => {
    expect(v11.gates.map(g => g.id)).toEqual(['G1'])
  })

  it('derives generic callsigns from airport name when frequencies are absent', () => {
    const file = makeV11File()
    delete file.metadata.frequencies
    const apt = loadAirport(file)
    expect(apt.frequencies.find(f => f.name === 'TOWER')?.callsign).toBe('Test Field Tower')
  })
})

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
