import type { Airport, TaxiwayGraph, TaxiwayData, RunwayData, GateData, SpawnPointData, AirportDiagram, DiagramPoint, Wind, AircraftType } from './types'
import { AIRCRAFT_TYPES } from './constants'

/**
 * MVA floor: explicit `metadata.mva` if the file has one, else field elevation
 * + 1100 ft rounded up to the next 100. The fallback reproduces HHAS's
 * published 8800 ft exactly (7661 + 1100 → 8800).
 */
function computeMvaFt(elevationFt: number, explicit?: number): number {
  return explicit ?? Math.ceil((elevationFt + 1100) / 100) * 100
}

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

  // Support custom format (version 1) and editor formats ("1.0" legacy scale, "1.1" meter-true)
  if (data.version === 1) {
    return loadV1Airport(data)
  } else if (data.version === "1.0") {
    // ponytail: the HHAS "1.0" file was traced under scale (~971 units for the
    // real 3000 m runway), so this fudge compensates. "1.1" files are meter-true.
    return loadEditorAirport(data, 0.001668)
  } else if (data.version === "1.1") {
    return loadEditorAirport(data, 1 / 1852)
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
    stepdowns: r.stepdowns || [],
    missedHeading: r.missed_heading ?? null,
    missedAltitude: r.missed_altitude ?? null
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
    mvaFt: computeMvaFt(data.metadata.elevation_ft || 0, data.metadata.mva),
    runways,
    taxiways: data.taxiways || [],
    gates: data.gates || [],
    heliports: (data.heliports || []).map((h: any) => ({
      id: h.id,
      x: h.x,
      y: h.y,
      taxiwayId: h.taxiway_id || h.taxiwayId || ''
    })),
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

function loadEditorAirport(data: any, SCALE: number): Airport {
  const objects = data.objects || []
  const runways: RunwayData[] = []
  const gates: GateData[] = []
  const spawnPoints: SpawnPointData[] = []
  const diagramTaxiways: Array<{ name: string; points: DiagramPoint[]; widthNM: number }> = []
  const diagramAprons: DiagramPoint[][] = []
  const diagramBuildings: DiagramPoint[][] = []
  const diagramLabels: Array<{ text: string; x: number; y: number }> = []

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
      const opsFwd = obj.ops?.forward
      const opsRev = obj.ops?.reverse

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
        ils: opsFwd?.ils ? { frequency: 0, available: true } : null,
        pattern: opsFwd?.pattern || 'left',
        stepdowns: [],
        missedHeading: opsFwd?.missedHeading ?? null,
        missedAltitude: opsFwd?.missedAltitude ?? null
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
        ils: opsRev?.ils ? { frequency: 0, available: true } : null,
        pattern: opsRev?.pattern || 'left',
        stepdowns: [],
        missedHeading: opsRev?.missedHeading ?? null,
        missedAltitude: opsRev?.missedAltitude ?? null
      })
    } else if (obj.type === 'spawn' && obj.position) {
      const p = toNM(obj.position)
      spawnPoints.push({
        id: obj.name || `ARR_${spawnPoints.length + 1}`,
        type: 'arrival',
        x: p.x,
        y: p.y,
        heading: obj.heading ?? 0,
        altitude: obj.altitude ?? 12000
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

  // Mock gates only for legacy "1.0" files; a "1.1" file with no gates is an
  // editor-side validation error, not something to paper over here.
  if (gates.length === 0 && data.version === '1.0') {
    gates.push({ id: 'G1', x: 0.1, y: 0.1, taxiwayId: 'A' })
    gates.push({ id: 'G2', x: 0.2, y: 0.1, taxiwayId: 'A' })
  }

  if (spawnPoints.length === 0) {
    spawnPoints.push({ id: 'ARR_N', type: 'arrival', x: 0, y: 15, heading: 180, altitude: 12000 })
    spawnPoints.push({ id: 'ARR_S', type: 'arrival', x: 0, y: -15, heading: 360, altitude: 12000 })
    spawnPoints.push({ id: 'ARR_E', type: 'arrival', x: 15, y: 0, heading: 270, altitude: 12000 })
    spawnPoints.push({ id: 'ARR_W', type: 'arrival', x: -15, y: 0, heading: 90, altitude: 12000 })
  }

  const airportName = data.metadata?.name || 'Unknown Airport'
  const frequencies = Array.isArray(data.metadata?.frequencies) && data.metadata.frequencies.length > 0
    ? data.metadata.frequencies.map((f: any) => ({
        name: f.name,
        frequency: f.frequency,
        callsign: f.callsign || `${airportName} ${f.name}`
      }))
    : [
        { name: 'ATIS', frequency: 126.4, callsign: `${airportName} ATIS` },
        { name: 'GROUND', frequency: 121.9, callsign: `${airportName} Ground` },
        { name: 'TOWER', frequency: 118.1, callsign: `${airportName} Tower` },
        { name: 'APPROACH', frequency: 120.7, callsign: `${airportName} Approach` }
      ]

  // Editor-derived taxi graph ("1.1"): one routable TaxiwayData carrying all
  // nodes/edges — buildTaxiwayGraph consumes it unchanged.
  const taxiways: TaxiwayData[] = []
  if (data.taxiGraph && Array.isArray(data.taxiGraph.nodes) && data.taxiGraph.nodes.length > 0) {
    taxiways.push({
      id: 'TAXI',
      width: 23,
      surface: 'asphalt',
      nodes: data.taxiGraph.nodes.map((n: any) => {
        const p = toNM(n)
        return { id: n.id, x: p.x, y: p.y, kind: n.kind, ref: n.ref }
      }),
      edges: (data.taxiGraph.edges || []).map((e: any) => ({ from: e.from, to: e.to }))
    })
  }

  return {
    version: 1,
    metadata: {
      icao: data.metadata?.icao || 'UNKN',
      iata: data.metadata?.iata || '',
      name: airportName,
      country: data.metadata?.country || '',
      elevationFt: data.metadata?.elevation || 0,
      magneticVariation: data.metadata?.magneticVariation || 0
    },
    mvaFt: computeMvaFt(data.metadata?.elevation || 0, data.metadata?.mva),
    runways,
    taxiways,
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

/**
 * Published missed approach for a runway, falling back to a generic climb
 * straight ahead to pattern-ish altitude when the airport file has no ops data.
 */
export function missedApproachParams(runway: RunwayData): { heading: number; altitude: number } {
  return {
    heading: runway.missedHeading ?? runway.trueHeading,
    altitude: runway.missedAltitude ?? runway.elevationFt + 4000,
  }
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

/** Calculate runway length in feet (1 meter = 3.28084 feet) */
export function getRunwayLengthFt(rwy: RunwayData): number {
  return rwy.length * 3.28084
}

/** Calculate maximum runway length available at an airport in feet */
export function getMaxRunwayLengthFt(airport: Airport): number {
  if (!airport.runways || airport.runways.length === 0) return 10000
  return Math.max(...airport.runways.map(getRunwayLengthFt))
}

/** Filter aircraft catalog to models compatible with the airport's runway length capacity and active session aircraft class settings */
export function filterSuitableAircraftTypes(
  airport: Airport,
  enabledClasses?: ReadonlyArray<import('./types').AircraftClass>
): ReadonlyArray<AircraftType> {
  const maxFt = getMaxRunwayLengthFt(airport)
  let catalog = AIRCRAFT_TYPES
  if (enabledClasses && enabledClasses.length > 0) {
    const filtered = catalog.filter((t) => t.aircraftClass && enabledClasses.includes(t.aircraftClass))
    if (filtered.length > 0) catalog = filtered
  }
  const suitable = catalog.filter((t) => (t.minRunwayLengthFt ?? 5000) <= maxFt)
  return suitable.length > 0 ? suitable : catalog
}

