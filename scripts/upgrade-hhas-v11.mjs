/**
 * One-off script: upgrade hhas.airport.json from v1.0 to v1.1.
 *
 * - Computes true-to-drawn scale from RWY 07/25 (true length 3000 m).
 * - Scales all coordinates, widths, and reference-image properties.
 * - Sets version to "1.1", adds frequencies, per-runway ops, and 4 spawn
 *   points 15 NM from the field midpoint.
 *
 * Usage: node scripts/upgrade-hhas-v11.mjs
 */

import { readFileSync, writeFileSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const FILE = resolve(__dirname, '..', 'src', 'data', 'airports', 'hhas.airport.json')

const data = JSON.parse(readFileSync(FILE, 'utf-8'))

// ---- Step a: compute scale factor from 07/25 runway ----
const rwy0725 = data.objects.find(
  (o) => o.type === 'runway' && o.identifiers?.forward === '07' && o.identifiers?.reverse === '25'
)
if (!rwy0725) throw new Error('Runway 07/25 not found – aborting')

const drawnLength = Math.hypot(
  rwy0725.end.x - rwy0725.start.x,
  rwy0725.end.y - rwy0725.start.y
)
const TRUE_LENGTH_M = 3000 // Navigraph
const FACTOR = TRUE_LENGTH_M / drawnLength

// ---- Step b: scale every coordinate ----
function scalePoint(p) {
  if (p && typeof p.x === 'number' && typeof p.y === 'number') {
    p.x *= FACTOR
    p.y *= FACTOR
  }
}

function scaleCoordArray(arr) {
  if (!Array.isArray(arr)) return
  for (const item of arr) {
    if (item && typeof item.x === 'number' && typeof item.y === 'number') {
      item.x *= FACTOR
      item.y *= FACTOR
    }
  }
}

for (const obj of data.objects) {
  // position
  scalePoint(obj.position)
  // runway start / end
  scalePoint(obj.start)
  scalePoint(obj.end)
  // width (runway and taxiway)
  if (typeof obj.width === 'number') obj.width *= FACTOR
  // points (taxiway, apron)
  scaleCoordArray(obj.points)
  // polygon (building)
  scaleCoordArray(obj.polygon)
}

// reference image
if (data.referenceImage) {
  if (typeof data.referenceImage.offsetX === 'number') data.referenceImage.offsetX *= FACTOR
  if (typeof data.referenceImage.offsetY === 'number') data.referenceImage.offsetY *= FACTOR
  if (typeof data.referenceImage.scale === 'number') data.referenceImage.scale *= FACTOR
}

// ---- Step d: set version ----
data.version = '1.1'

// ---- Step e: add frequencies ----
if (!data.metadata.frequencies) {
  data.metadata.frequencies = [
    { name: 'ATIS', frequency: 126.4, callsign: 'Asmara ATIS' },
    { name: 'GROUND', frequency: 121.9, callsign: 'Asmara Ground' },
    { name: 'TOWER', frequency: 118.1, callsign: 'Asmara Tower' },
    { name: 'APPROACH', frequency: 120.7, callsign: 'Asmara Approach' },
  ]
}

// ---- Step f: add ops to runways ----
for (const obj of data.objects) {
  if (obj.type === 'runway') {
    const ids = obj.identifiers
    if (ids.forward === '07' && ids.reverse === '25') {
      // 07/25 — real chart values
      obj.ops = {
        forward: { ils: false, pattern: 'left', missedHeading: 170, missedAltitude: 11500 },
        reverse: { ils: false, pattern: 'left', missedHeading: 170, missedAltitude: 11500 },
      }
    } else {
      // 12/30 — fallback only
      obj.ops = {
        forward: { ils: false, pattern: 'left', missedHeading: null, missedAltitude: null },
        reverse: { ils: false, pattern: 'left', missedHeading: null, missedAltitude: null },
      }
    }
  }
}

// ---- Step g: append spawn layer ----
const spawnLayerId = 'layer-spawns'
data.layers.push({
  id: spawnLayerId,
  name: 'Spawns',
  visible: true,
  locked: false,
})

// ---- Step h: compute midpoint of scaled 07/25 ----
const midX = (rwy0725.start.x + rwy0725.end.x) / 2
const midY = (rwy0725.start.y + rwy0725.end.y) / 2
const FIFTEEN_NM_M = 15 * 1852 // 27 780 m

const spawns = [
  { id: 'spawn-n', name: 'ARR_N', x: midX, y: midY + FIFTEEN_NM_M, heading: 180 },
  { id: 'spawn-e', name: 'ARR_E', x: midX + FIFTEEN_NM_M, y: midY, heading: 270 },
  { id: 'spawn-s', name: 'ARR_S', x: midX, y: midY - FIFTEEN_NM_M, heading: 0 },
  { id: 'spawn-w', name: 'ARR_W', x: midX - FIFTEEN_NM_M, y: midY, heading: 90 },
]

for (const sp of spawns) {
  data.objects.push({
    id: sp.id,
    type: 'spawn',
    name: sp.name,
    layerId: spawnLayerId,
    position: { x: sp.x, y: sp.y },
    rotation: 0,
    heading: sp.heading,
    altitude: 12000,
  })
}

// ---- Write ----
writeFileSync(FILE, JSON.stringify(data, null, 2), 'utf-8')

// Sanity line
const newLen = Math.hypot(
  rwy0725.end.x - rwy0725.start.x,
  rwy0725.end.y - rwy0725.start.y
)
console.log(`Scale factor: ${FACTOR.toFixed(4)}`)
console.log(`RWY 07/25 new length: ${newLen.toFixed(1)} m (target 3000)`)
console.log(`Done. Objects now include ${data.objects.filter((o) => o.type === 'spawn').length} spawn points.`)
