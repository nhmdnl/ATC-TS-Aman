import { describe, it, expect } from 'vitest'
import { nearestNodeId, findTaxiPath, findNodeByRef, buildTaxiRoute } from '../taxi-routing'
import { buildTaxiwayGraph } from '../airport-loader'
import type { Airport, TaxiwayGraph } from '../types'

/**
 * Graph shaped like:
 *
 *   n0 ──1── n1 ──1── n2 (hold-short 07/25)
 *    │                │
 *    └──── n3 ────────┘   (long way round: 3 + 3)
 *
 *   n4 isolated (disconnected)
 */
function makeAirport(): Airport {
  return {
    version: 1,
    metadata: { icao: 'TEST', iata: '', name: 'Test', country: '', elevationFt: 0, magneticVariation: 0 },
    runways: [],
    taxiways: [
      {
        id: 'TAXI',
        width: 23,
        surface: 'asphalt',
        nodes: [
          { id: 'n0', x: 0, y: 0, kind: 'gate', ref: 'G1' },
          { id: 'n1', x: 1, y: 0 },
          { id: 'n2', x: 2, y: 0, kind: 'hold-short', ref: '07/25' },
          { id: 'n3', x: 1, y: -3 },
          { id: 'n4', x: 10, y: 10, kind: 'gate', ref: 'G9' },
        ],
        edges: [
          { from: 'n0', to: 'n1' },
          { from: 'n1', to: 'n2' },
          { from: 'n0', to: 'n3' },
          { from: 'n3', to: 'n2' },
        ],
      },
    ],
    gates: [{ id: 'G1', x: 0, y: 0, taxiwayId: '' }],
    parking: [],
    frequencies: [],
    navaids: [],
    spawnPoints: [],
  }
}

const airport = makeAirport()
const graph: TaxiwayGraph = buildTaxiwayGraph(airport)

describe('nearestNodeId', () => {
  it('finds the closest node', () => {
    expect(nearestNodeId(graph, 0.9, 0.1)).toBe('n1')
  })

  it('returns null for an empty graph', () => {
    expect(nearestNodeId({ nodes: new Map(), adjacency: new Map() }, 0, 0)).toBeNull()
  })
})

describe('findTaxiPath', () => {
  it('takes the shortest of two routes', () => {
    expect(findTaxiPath(graph, 'n0', 'n2')).toEqual(['n0', 'n1', 'n2'])
  })

  it('returns null when the target is disconnected', () => {
    expect(findTaxiPath(graph, 'n0', 'n4')).toBeNull()
  })

  it('returns a single-node path when already there', () => {
    expect(findTaxiPath(graph, 'n1', 'n1')).toEqual(['n1'])
  })
})

describe('findNodeByRef', () => {
  it('matches hold-short nodes by either runway ident of the pair', () => {
    expect(findNodeByRef(airport, 'hold-short', '07')?.id).toBe('n2')
    expect(findNodeByRef(airport, 'hold-short', '25')?.id).toBe('n2')
    expect(findNodeByRef(airport, 'hold-short', '30')).toBeNull()
  })

  it('matches gate nodes by exact id', () => {
    expect(findNodeByRef(airport, 'gate', 'G1')?.id).toBe('n0')
    expect(findNodeByRef(airport, 'gate', 'G2')).toBeNull()
  })
})

describe('buildTaxiRoute', () => {
  it('routes from a position near a gate to the runway hold-short', () => {
    const route = buildTaxiRoute(airport, graph, 0.05, 0.05, { kind: 'hold-short', ref: '07' })
    expect(route).toEqual([
      { x: 0, y: 0 },
      { x: 1, y: 0 },
      { x: 2, y: 0 },
    ])
  })

  it('returns null for an unknown goal ref', () => {
    expect(buildTaxiRoute(airport, graph, 0, 0, { kind: 'gate', ref: 'NOPE' })).toBeNull()
  })

  it('returns null when the goal node is unreachable', () => {
    expect(buildTaxiRoute(airport, graph, 0, 0, { kind: 'gate', ref: 'G9' })).toBeNull()
  })
})
