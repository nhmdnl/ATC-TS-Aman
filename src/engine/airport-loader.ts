import type { Airport, TaxiwayGraph, RunwayData, GateData, SpawnPointData, AirportDiagram, DiagramPoint, Wind } from './types'

function computeHeading(dx: number, dy: number): number {
  // dy is inverted in our canvas (usually), but let's trust math.atan2
  // True heading: 0 is North (positive Y), 90 is East (positive X)
  // In typical screen coords, Y goes down.
  // Assuming standard cartesian: East is 90, North is 0.
  // atan2(y, x) -> x is dx, y is dy.
  // heading = 90 - atan2(dy, dx) in degrees.
  const rad = Math.atan2(dy, dx)
  let deg = 90 - (rad * 180 / Math.PI)
  if (deg < 0) deg += 360
  return deg
}

export function loadAirport(data: any): Airport {
  if (typeof data !== 'object' || !data) {
    throw new Error('Airport data must be an object')
  }

  // Support both custom format (version 1) and editor format (version "1.0")
  if (data.version === 1) {
    return loadV1Airport(data)
  } else if (data.version === "1.0") {
    return loadEditorAirport(data)
  }

  throw new Error(`Unsupported airport version: ${data.version}`)
}

function loadV1Airport(data: any): Airport {
  const runways: RunwayData[] = data.runways.map((r: any) => ({
    id: r.id,
    trueHeading: r.true_heading,
    magneticHeading: r.magnetic_heading,
    length: r.length,
    width: r.width,
    surface: r.surface,
    elevationFt: r.elevation_ft,
    thresholdX: r.threshold_x,
    thresholdY: r.threshold_y,
    endX: r.end_x,
    endY: r.end_y,
    displacedThresholdFt: r.displaced_threshold_ft || 0,
    ils: r.ils || null,
    pattern: r.pattern || 'left',
    stepdowns: r.stepdowns || []
  }))

  return {
    version: data.version,
    metadata: {
      icao: data.metadata.icao,
      iata: data.metadata.iata || '',
      name: data.metadata.name,
      country: data.metadata.country || '',
      elevationFt: data.metadata.elevation_ft || 0,
      magneticVariation: data.metadata.magnetic_variation || 0
    },
    runways,
    taxiways: data.taxiways || [],
    gates: data.gates || [],
    parking: data.parking || [],
    frequencies: data.frequencies || [],
    navaids: data.navaids || [],
    spawnPoints: (data.spawn_points || []).map((sp: any) => ({
      id: sp.id,
      type: sp.type,
      gateId: sp.gate_id,
      x: sp.x,
      y: sp.y,
      heading: sp.heading,
      altitude: sp.altitude
    }))
  }
}

function loadEditorAirport(data: any): Airport {
  const objects = data.objects || []
  const runways: RunwayData[] = []
  const gates: GateData[] = []
  const spawnPoints: SpawnPointData[] = []
  const diagramTaxiways: Array<{ name: string; points: DiagramPoint[]; widthNM: number }> = []
  const diagramAprons: DiagramPoint[][] = []
  const diagramBuildings: DiagramPoint[][] = []
  const diagramLabels: Array<{ text: string; x: number; y: number }> = []

  // Scale factor: assume editor units to NM.
  // ponytail: the HHAS file was traced under scale (~971 units for the real 3000 m
  // runway), so this fudge compensates. Files drawn to true meter scale in the
  // editor need SCALE = 1/1852 instead — recalibrate when re-tracing HHAS.
  const SCALE = 0.001668

  // We need an origin to center the airport. Let's find the first runway and use its position as origin.
  const firstRwy = objects.find((o: any) => o.type === 'runway')
  const originX = firstRwy ? firstRwy.position.x : 0
  const originY = firstRwy ? firstRwy.position.y : 0

  const toNM = (p: { x: number; y: number }): DiagramPoint => ({
    x: (p.x - originX) * SCALE,
    y: (p.y - originY) * SCALE,
  })

  objects.forEach((obj: any) => {
    if (obj.type === 'runway') {
      const sx = (obj.start.x - originX) * SCALE
      const sy = (obj.start.y - originY) * SCALE
      const ex = (obj.end.x - originX) * SCALE
      const ey = (obj.end.y - originY) * SCALE

      const length = Math.hypot(ex - sx, ey - sy)
      const hdgFwd = computeHeading(ex - sx, ey - sy)
      const hdgRev = (hdgFwd + 180) % 360

      const idFwd = obj.identifiers?.forward || '09'
      const idRev = obj.identifiers?.reverse || '27'

      runways.push({
        id: idFwd,
        trueHeading: hdgFwd,
        magneticHeading: hdgFwd,
        length: length * 6076.12, // NM to feet
        width: obj.width * SCALE * 6076.12,
        surface: obj.surface || 'asphalt',
        elevationFt: data.metadata?.elevation || 0,
        thresholdX: sx,
        thresholdY: sy,
        endX: ex,
        endY: ey,
        displacedThresholdFt: 0,
        ils: null,
        pattern: 'left',
        stepdowns: []
      })

      runways.push({
        id: idRev,
        trueHeading: hdgRev,
        magneticHeading: hdgRev,
        length: length * 6076.12,
        width: obj.width * SCALE * 6076.12,
        surface: obj.surface || 'asphalt',
        elevationFt: data.metadata?.elevation || 0,
        thresholdX: ex,
        thresholdY: ey,
        endX: sx,
        endY: sy,
        displacedThresholdFt: 0,
        ils: null,
        pattern: 'left',
        stepdowns: []
      })
    } else if (obj.type === 'taxiway' && Array.isArray(obj.points) && obj.points.length >= 2) {
      diagramTaxiways.push({
        name: obj.name || 'Taxiway',
        points: obj.points.map(toNM),
        widthNM: (obj.width || 23) * SCALE,
      })
    } else if (obj.type === 'apron' && Array.isArray(obj.points) && obj.points.length >= 3) {
      diagramAprons.push(obj.points.map(toNM))
    } else if (obj.type === 'building' && Array.isArray(obj.polygon) && obj.polygon.length >= 3) {
      diagramBuildings.push(obj.polygon.map(toNM))
    } else if (obj.type === 'gate' && obj.position) {
      const p = toNM(obj.position)
      gates.push({ id: obj.name || `G${gates.length + 1}`, x: p.x, y: p.y, taxiwayId: '' })
    } else if (obj.type === 'label' && obj.position && obj.text) {
      const p = toNM(obj.position)
      diagramLabels.push({ text: obj.text, x: p.x, y: p.y })
    }
  })

  // Mock essential data if not present in the editor JSON
  if (gates.length === 0) {
    gates.push({ id: 'G1', x: 0.1, y: 0.1, taxiwayId: 'A' })
    gates.push({ id: 'G2', x: 0.2, y: 0.1, taxiwayId: 'A' })
  }

  if (spawnPoints.length === 0) {
    spawnPoints.push({ id: 'ARR_N', type: 'arrival', x: 0, y: 15, heading: 180, altitude: 12000 })
    spawnPoints.push({ id: 'ARR_S', type: 'arrival', x: 0, y: -15, heading: 360, altitude: 12000 })
    spawnPoints.push({ id: 'ARR_E', type: 'arrival', x: 15, y: 0, heading: 270, altitude: 12000 })
    spawnPoints.push({ id: 'ARR_W', type: 'arrival', x: -15, y: 0, heading: 90, altitude: 12000 })
  }

  const frequencies = [
    { name: 'ATIS', frequency: 126.4, callsign: 'Asmara ATIS' },
    { name: 'GROUND', frequency: 121.9, callsign: 'Asmara Ground' },
    { name: 'TOWER', frequency: 118.1, callsign: 'Asmara Tower' },
    { name: 'APPROACH', frequency: 120.7, callsign: 'Asmara Approach' }
  ]

  return {
    version: 1,
    metadata: {
      icao: data.metadata?.icao || 'UNKN',
      iata: data.metadata?.iata || '',
      name: data.metadata?.name || 'Unknown Airport',
      country: data.metadata?.country || '',
      elevationFt: data.metadata?.elevation || 0,
      magneticVariation: data.metadata?.magneticVariation || 0
    },
    runways,
    // ponytail: diagram taxiways are render-only polylines — building a routable
    // TaxiwayData node/edge graph from them is the upgrade path for real taxi routing
    taxiways: [],
    gates,
    parking: [],
    frequencies,
    navaids: [],
    spawnPoints,
    diagram: {
      taxiways: diagramTaxiways,
      aprons: diagramAprons,
      buildings: diagramBuildings,
      labels: diagramLabels,
    } satisfies AirportDiagram,
  }
}

export function buildTaxiwayGraph(airport: Airport): TaxiwayGraph {
  const nodes = new Map<string, { x: number; y: number }>()
  const adjacency = new Map<string, string[]>()

  for (const twy of airport.taxiways) {
    for (const node of twy.nodes) {
      nodes.set(node.id, { x: node.x, y: node.y })
      if (!adjacency.has(node.id)) {
        adjacency.set(node.id, [])
      }
    }

    for (const edge of twy.edges) {
      adjacency.get(edge.from)?.push(edge.to)
      adjacency.get(edge.to)?.push(edge.from)
    }
  }

  return { nodes, adjacency }
}

export function findRunwayById(airport: Airport, id: string): RunwayData | null {
  return airport.runways.find(r => r.id === id) || null
}

export function findGateById(airport: Airport, id: string): GateData | null {
  return airport.gates.find(g => g.id === id) || null
}

export function getFrequency(airport: Airport, stationName: string): number | null {
  const upper = stationName.toUpperCase()
  const freq = airport.frequencies.find(f => f.name.toUpperCase().includes(upper))
  return freq ? freq.frequency : null
}

export function getAvailableGates(airport: Airport, occupiedGateIds: Set<string>): GateData[] {
  return airport.gates.filter(g => !occupiedGateIds.has(g.id))
}

/**
 * Active runway: the end of the longest strip with the most headwind.
 * Only the longest strip is considered so light winds never divert traffic
 * to a short secondary runway. Calm or tied wind keeps the first-listed end
 * (the previous runways[0] default).
 * ponytail: no ILS preference or crosswind limits — add if ops realism matters
 */
export function selectActiveRunway(airport: Airport, wind: Wind): RunwayData | null {
  if (airport.runways.length === 0) return null
  const maxLength = Math.max(...airport.runways.map(r => r.length))
  const candidates = airport.runways.filter(r => r.length === maxLength)
  let best = candidates[0]
  let bestHeadwind = -Infinity
  for (const r of candidates) {
    const headwind = wind.speed * Math.cos(((wind.direction - r.trueHeading) * Math.PI) / 180)
    if (headwind > bestHeadwind) {
      bestHeadwind = headwind
      best = r
    }
  }
  return best
}

export function getArrivalSpawnPoints(airport: Airport): SpawnPointData[] {
  return airport.spawnPoints.filter(sp => sp.type === 'arrival')
}

export function getReciprocalRunway(airport: Airport, runwayId: string): RunwayData | null {
  const rwy = findRunwayById(airport, runwayId)
  if (!rwy) return null

  const reciprocalHeading = (rwy.trueHeading + 180) % 360
  
  let closest: RunwayData | null = null
  let minDiff = 360
  for (const r of airport.runways) {
    const diff = Math.abs(r.trueHeading - reciprocalHeading)
    if (diff < minDiff) {
      minDiff = diff
      closest = r
    }
  }
  
  return minDiff < 5 ? closest : null
}
