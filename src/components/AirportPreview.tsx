import React from 'react'
import type { Airport } from '../engine/types'

const FEET_PER_NM = 6076.12

interface Props {
  airport: Airport
  height?: number | string
}

/**
 * Static SVG minimap of an airport: runways, taxiway centerlines, aprons,
 * buildings and gates, north-up (world +y is north, so y is flipped for SVG).
 */
export default function AirportPreview({ airport, height = 150 }: Props): React.ReactElement | null {
  // Collect flipped (SVG-space) points to size the viewBox
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
  const see = (x: number, y: number) => {
    if (x < minX) minX = x
    if (x > maxX) maxX = x
    if (-y < minY) minY = -y
    if (-y > maxY) maxY = -y
  }

  for (const r of airport.runways) {
    see(r.thresholdX, r.thresholdY)
    see(r.endX, r.endY)
  }
  const diagram = airport.diagram
  for (const t of diagram?.taxiways ?? []) for (const p of t.points) see(p.x, p.y)
  for (const poly of diagram?.aprons ?? []) for (const p of poly) see(p.x, p.y)
  for (const poly of diagram?.buildings ?? []) for (const p of poly) see(p.x, p.y)
  for (const g of airport.gates) see(g.x, g.y)

  if (minX === Infinity) return null

  const pad = Math.max(maxX - minX, maxY - minY) * 0.08 || 0.1
  minX -= pad; minY -= pad; maxX += pad; maxY += pad
  const w = maxX - minX
  const h = maxY - minY
  const dot = Math.max(w, h) * 0.008

  const polyPoints = (pts: ReadonlyArray<{ x: number; y: number }>) =>
    pts.map(p => `${p.x},${-p.y}`).join(' ')

  return (
    <svg
      viewBox={`${minX} ${minY} ${w} ${h}`}
      preserveAspectRatio="xMidYMid meet"
      style={{ width: '100%', height, display: 'block' }}
    >
      {diagram?.aprons.map((poly, i) => (
        <polygon key={`ap${i}`} points={polyPoints(poly)} fill="#1E293B" />
      ))}
      {diagram?.buildings.map((poly, i) => (
        <polygon key={`bl${i}`} points={polyPoints(poly)} fill="#334155" />
      ))}
      {diagram?.taxiways.map((t, i) => (
        <polyline
          key={`tw${i}`}
          points={polyPoints(t.points)}
          fill="none"
          stroke="#475569"
          strokeWidth={t.widthNM}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      ))}
      {/* Reciprocal runway ends draw the same strip twice — overlap is invisible */}
      {airport.runways.map((r, i) => (
        <line
          key={`rw${i}`}
          x1={r.thresholdX} y1={-r.thresholdY}
          x2={r.endX} y2={-r.endY}
          stroke="#94A3B8"
          strokeWidth={r.width / FEET_PER_NM}
        />
      ))}
      {airport.gates.map((g) => (
        <circle key={`g${g.id}`} cx={g.x} cy={-g.y} r={dot} fill="#0EA5E9" />
      ))}
    </svg>
  )
}
