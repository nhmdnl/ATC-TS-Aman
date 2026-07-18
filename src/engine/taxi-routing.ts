import type { Airport, TaxiwayGraph, TaxiwayNode, TaxiwayNodeKind } from './types'
import { distanceNM } from './movement'

/** Nearest graph node to a point, or null on an empty graph. */
export function nearestNodeId(graph: TaxiwayGraph, x: number, y: number): string | null {
  let best: string | null = null
  let bestDist = Infinity
  for (const [id, p] of graph.nodes) {
    const d = distanceNM(x, y, p.x, p.y)
    if (d < bestDist) {
      bestDist = d
      best = id
    }
  }
  return best
}

/**
 * Shortest node path (euclidean edge weights) or null when unreachable.
 * ponytail: Dijkstra with a linear-scan frontier — airports have dozens of
 * nodes, not thousands; swap in a heap if that ever changes.
 */
export function findTaxiPath(graph: TaxiwayGraph, from: string, to: string): string[] | null {
  if (!graph.nodes.has(from) || !graph.nodes.has(to)) return null
  const dist = new Map<string, number>([[from, 0]])
  const prev = new Map<string, string>()
  const unvisited = new Set(graph.nodes.keys())

  while (unvisited.size > 0) {
    let current: string | null = null
    let currentDist = Infinity
    for (const id of unvisited) {
      const d = dist.get(id) ?? Infinity
      if (d < currentDist) {
        currentDist = d
        current = id
      }
    }
    if (current === null || currentDist === Infinity) break
    if (current === to) break
    unvisited.delete(current)

    const cp = graph.nodes.get(current)!
    for (const neighbor of graph.adjacency.get(current) ?? []) {
      if (!unvisited.has(neighbor)) continue
      const np = graph.nodes.get(neighbor)
      if (!np) continue
      const alt = currentDist + distanceNM(cp.x, cp.y, np.x, np.y)
      if (alt < (dist.get(neighbor) ?? Infinity)) {
        dist.set(neighbor, alt)
        prev.set(neighbor, current)
      }
    }
  }

  if (!dist.has(to) || dist.get(to) === Infinity) return null
  const path: string[] = [to]
  while (path[0] !== from) {
    const p = prev.get(path[0])
    if (!p) return null
    path.unshift(p)
  }
  return path
}

/**
 * Find a special node by kind + reference. Gate nodes match by exact gate id;
 * runway nodes carry an ident pair ("07/25") and match either end.
 */
export function findNodeByRef(airport: Airport, kind: TaxiwayNodeKind, ref: string): TaxiwayNode | null {
  for (const twy of airport.taxiways) {
    for (const node of twy.nodes) {
      if (node.kind !== kind || !node.ref) continue
      if (kind === 'gate' ? node.ref === ref : node.ref.split('/').includes(ref)) {
        return node
      }
    }
  }
  return null
}

/**
 * Nearest matching node by kind + ref — airports can carry several entries
 * for one runway, and line-up should use the one the aircraft is holding at.
 */
export function findNearestNodeByRef(
  airport: Airport,
  kind: TaxiwayNodeKind,
  ref: string,
  x: number,
  y: number
): TaxiwayNode | null {
  let best: TaxiwayNode | null = null
  let bestDist = Infinity
  for (const twy of airport.taxiways) {
    for (const node of twy.nodes) {
      if (node.kind !== kind || !node.ref) continue
      if (!(kind === 'gate' ? node.ref === ref : node.ref.split('/').includes(ref))) continue
      const d = distanceNM(x, y, node.x, node.y)
      if (d < bestDist) {
        bestDist = d
        best = node
      }
    }
  }
  return best
}

/**
 * Build a taxi route (point list) from a position to a hold-short node of a
 * runway or a gate node. Returns null when the airport has no routable graph
 * or the goal is unreachable — callers fall back to straight-line taxi.
 */
export function buildTaxiRoute(
  airport: Airport,
  graph: TaxiwayGraph,
  fromX: number,
  fromY: number,
  goal: { kind: 'hold-short' | 'gate'; ref: string }
): Array<{ x: number; y: number }> | null {
  const goalNode = findNodeByRef(airport, goal.kind, goal.ref)
  if (!goalNode) return null
  const startId = nearestNodeId(graph, fromX, fromY)
  if (!startId) return null
  const path = findTaxiPath(graph, startId, goalNode.id)
  if (!path) return null
  return path.map(id => {
    const p = graph.nodes.get(id)!
    return { x: p.x, y: p.y }
  })
}
