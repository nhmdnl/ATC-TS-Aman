import 'pixi.js/unsafe-eval'
import React, { useEffect, useRef } from 'react'
import * as PIXI from 'pixi.js'
import { useGame } from '../state/GameContext'
import { AircraftPhase } from '../engine/types'
import type { TutorialDemoAircraft } from '../data/tutorialContent'
import { RADAR_RENDER_CONFIG } from '../engine/constants'

const COMPASS_LABEL_DEGS = [0, 30, 60, 90, 120, 150, 180, 210, 240, 270, 300, 330]
const CARDINAL_LABELS: Record<number, string> = { 0: 'N', 90: 'E', 180: 'S', 270: 'W' }
const RANGE_RING_STEP_NM = 5
const RANGE_RING_COUNT = 6 // 5, 10, 15, 20, 25, 30 NM
const RANGE_LABEL_BEARING_DEG = 315 // fixed radial (NW) so labels never sit under traffic

/** Key Terminal Navaid fixes for HHAS (Asmara) display */
const HHAS_NAVAIDS = [
  { id: 'ASM', name: 'ASM VOR', x: 0, y: 0, type: 'VOR' },
  { id: 'GASOR', name: 'GASOR', x: -8.8, y: -4.2, type: 'FIX' },
  { id: 'NUBER', name: 'NUBER', x: 8.8, y: 4.2, type: 'FIX' },
  { id: 'DABAK', name: 'DABAK', x: -10.5, y: 10.5, type: 'FIX' },
  { id: 'ERIMO', name: 'ERIMO', x: 12.0, y: -9.5, type: 'FIX' },
] as const

/** Aircraft phases drawn as ground traffic (rect blip, no vector/trail vector line). */
const GROUND_PHASES: ReadonlyArray<AircraftPhase> = [
  AircraftPhase.AT_GATE, AircraftPhase.AWAITING_PUSHBACK, AircraftPhase.PUSHING_BACK, AircraftPhase.READY_TO_TAXI,
  AircraftPhase.VACATED, AircraftPhase.TAXI_IN, AircraftPhase.TAXI_OUT, AircraftPhase.HOLD_SHORT, AircraftPhase.LINE_UP,
]

interface DrawableAircraft {
  readonly id: string
  readonly callsign: string
  readonly x: number
  readonly y: number
  readonly altitude: number
  readonly speed: number
  readonly heading: number
  readonly isGround: boolean
  readonly flightType?: string
  readonly squawk?: string
  readonly isSelected?: boolean
  readonly inViolation?: boolean
  readonly urgent?: boolean
  readonly clearedAltitude?: number | null
  readonly clearedSpeed?: number | null
  readonly trail?: ReadonlyArray<{ x: number; y: number }>
  readonly type?: { readonly icao: string; readonly wakeCategory?: string }
  readonly forceLabel?: boolean
}

/** Draws one aircraft's blip, history dots, hover ring, violation pulse, vector ticks,
 *  and 3-line leader-line datablock into the given sprite. */
function drawAircraftBody(
  g: PIXI.Graphics,
  text: PIXI.Text,
  data: DrawableAircraft,
  mapX: (x: number) => number,
  mapY: (y: number) => number,
  zoom: number,
  hoveredId: string | null,
): void {
  const x = mapX(data.x)
  const y = mapY(data.y)
  const isGround = data.isGround
  const isDep = data.flightType === 'departure'

  // Authentic Phosphor Scope Color Palette
  let color = isDep ? 0x00ff66 : 0x00e5ff // Phosphor Green (Dep) / Electric Cyan (Arr)
  if (data.isSelected) color = 0xffffff // High-Vis White
  if (data.urgent) color = 0xffd600 // Vivid Amber
  if (data.inViolation) color = 0xff1744 // Alert Red
  if (isGround) color = 0x4a6572 // Muted Steel Green

  g.clear()
  g.hitArea = new PIXI.Circle(x, y, 14)

  // 1. History Trail - Discrete 4-step decaying phosphor history dots
  if (data.trail && data.trail.length > 1) {
    const history = data.trail.slice(-RADAR_RENDER_CONFIG.HISTORY_DOT_COUNT)
    const alphas = RADAR_RENDER_CONFIG.HISTORY_DECAY_ALPHAS
    const startIndex = Math.max(0, alphas.length - history.length)
    
    for (let i = 0; i < history.length; i++) {
      const hx = mapX(history[i].x)
      const hy = mapY(history[i].y)
      const alpha = alphas[startIndex + i]
      const radius = 1 + (i / Math.max(1, history.length - 1)) * 1.5
      g.circle(hx, hy, radius)
      g.fill({ color, alpha })
    }
  }

  // Hover ring
  if (hoveredId === data.id && !data.isSelected) {
    g.setStrokeStyle({ width: 1, color: 0xe2e8f0, alpha: 0.6 })
    g.circle(x, y, 8)
    g.stroke()
  }

  // Selection ring
  if (data.isSelected) {
    g.setStrokeStyle({ width: 1.5, color: 0xffffd6, alpha: 0.9 })
    g.circle(x, y, 10)
    g.stroke()
  }

  // Violation pulse halo
  if (data.inViolation) {
    const phase = (Date.now() % 1200) / 1200
    g.setStrokeStyle({ width: 2, color: 0xff1744, alpha: 0.7 * (1 - phase) })
    g.circle(x, y, 6 + phase * 10)
    g.stroke()
  }

  // 2. ICAO Target Symbol Rendering
  const rad = data.heading * (Math.PI / 180)
  if (isGround) {
    // Ground: Small 4x4 rect
    g.rect(x - 2, y - 2, 4, 4)
    g.fill(color)
  } else if (isDep) {
    // Departure: Open Square Target (5x5)
    g.setStrokeStyle({ width: 1.5, color })
    g.rect(x - 3, y - 3, 6, 6)
    g.stroke()
  } else {
    // Arrival / Inbound: Diamond Target (◇)
    g.setStrokeStyle({ width: 1.5, color })
    g.moveTo(x, y - 4)
    g.lineTo(x + 4, y)
    g.lineTo(x, y + 4)
    g.lineTo(x - 4, y)
    g.closePath()
    g.stroke()
  }

  // Directional Apex Chevron on Target Center
  if (!isGround) {
    const chvLen = 6
    const cx1 = x + Math.sin(rad) * chvLen
    const cy1 = y - Math.cos(rad) * chvLen
    g.setStrokeStyle({ width: 1.5, color })
    g.moveTo(x, y)
    g.lineTo(cx1, cy1)
    g.stroke()
  }

  // 3. Velocity Vector Line + 1-min and 2-min Projection Ticks
  if (!isGround && data.speed > 10) {
    const dist1MinNM = data.speed / 60
    const lx1 = x + Math.sin(rad) * dist1MinNM * zoom
    const ly1 = y - Math.cos(rad) * dist1MinNM * zoom
    const dist2MinNM = (data.speed / 60) * 2
    const lx2 = x + Math.sin(rad) * dist2MinNM * zoom
    const ly2 = y - Math.cos(rad) * dist2MinNM * zoom

    g.setStrokeStyle({ width: 1, color, alpha: 0.8 })
    g.moveTo(x, y)
    g.lineTo(lx2, ly2)
    g.stroke()

    // Perpendicular ticks at 1-min and 2-min positions
    const perpX = Math.cos(rad) * 3
    const perpY = Math.sin(rad) * 3
    
    // 1-min tick
    g.setStrokeStyle({ width: 1, color, alpha: 0.9 })
    g.moveTo(lx1 - perpX, ly1 - perpY)
    g.lineTo(lx1 + perpX, ly1 + perpY)
    g.stroke()

    // 2-min tick
    g.moveTo(lx2 - perpX, ly2 - perpY)
    g.lineTo(lx2 + perpX, ly2 + perpY)
    g.stroke()
  }

  // 4. Standardized 3-Line ATC Data Block (Leader Line + Tag)
  if (!isGround || data.isSelected || data.forceLabel) {
    text.visible = true
    const anchorX = x + 16
    const anchorY = y - 16
    
    // Angled leader line with joggle
    g.setStrokeStyle({ width: 1, color, alpha: 0.6 })
    g.moveTo(x + 3, y - 3)
    g.lineTo(anchorX - 2, anchorY + 2)
    g.stroke()

    text.position.set(anchorX + 2, anchorY - 8)
    text.style.fill = color

    const altStr = data.altitude < 100 ? 'GND' : Math.round(data.altitude / 100).toString().padStart(3, '0')
    const spdStr = Math.round(data.speed / 10).toString().padStart(2, '0')
    const cAltStr = data.clearedAltitude != null ? Math.round(data.clearedAltitude / 100).toString().padStart(3, '0') : ''
    const cSpdStr = data.clearedSpeed != null ? Math.round(data.clearedSpeed / 10).toString().padStart(2, '0') : ''

    const trend = !isGround && data.clearedAltitude != null && Math.abs(data.clearedAltitude - data.altitude) > 100
      ? (data.clearedAltitude > data.altitude ? '↑' : '↓')
      : '='

    const wakeStr = data.type?.wakeCategory ? ` ${data.type.wakeCategory.slice(0, 1)}` : ''
    const squawkStr = data.squawk ? ` ${data.squawk}` : ''

    // Full Data Block (FDB) vs Partial Data Block (PDB)
    const isFDB = data.isSelected || data.urgent || data.inViolation || data.forceLabel

    if (isFDB) {
      // 3-Line FDB:
      // Line 1: CALLSIGN WAKE SQUAWK
      // Line 2: ALT TREND SPD
      // Line 3: C:ALT SPD
      let label = `${data.callsign}${wakeStr}${squawkStr}\n${altStr} ${trend} ${spdStr}`
      if (cAltStr || cSpdStr) {
        label += `\nC:${cAltStr || '---'} ${cSpdStr || '--'}`
      }
      text.text = label
    } else {
      // 2-Line PDB for unselected background traffic:
      // Line 1: CALLSIGN
      // Line 2: ALT SPD
      text.text = `${data.callsign}\n${altStr} ${spdStr}`
    }
  } else {
    text.visible = false
  }
}

export default function RadarCanvas() {
  const { state, selectAircraft } = useGame()
  const canvasRef = useRef<HTMLDivElement>(null)

  // PIXI references
  const appRef = useRef<PIXI.Application | null>(null)
  const staticLayerRef = useRef<PIXI.Graphics | null>(null)
  const dynamicLayerRef = useRef<PIXI.Container | null>(null)
  const aircraftSpritesRef = useRef<Map<string, { g: PIXI.Graphics, text: PIXI.Text }>>(new Map())
  const demoSpritesRef = useRef<Map<string, { g: PIXI.Graphics, text: PIXI.Text }>>(new Map())
  const taxiRouteLayerRef = useRef<PIXI.Graphics | null>(null)
  const tutorialDemoRef = useRef<readonly TutorialDemoAircraft[] | null>(null)

  // Zoom and pan state (refs to avoid re-render, read synchronously in draw calls)
  const zoomRef = useRef(15)
  const offsetXRef = useRef(0)
  const offsetYRef = useRef(0)
  const isDraggingRef = useRef(false)
  const dragStartRef = useRef({ x: 0, y: 0 })
  const dragPrevOffsetRef = useRef({ x: 0, y: 0 })

  // Sweep line
  const sweepLayerRef = useRef<PIXI.Graphics | null>(null)

  // Ruler tool (world coords in NM; active flag toggled by the R key)
  const rulerActiveRef = useRef(false)
  const rulerStartRef = useRef<{ x: number; y: number } | null>(null)
  const rulerEndRef = useRef<{ x: number; y: number } | null>(null)
  const rulerMeasuringRef = useRef(false)
  const rulerLayerRef = useRef<PIXI.Graphics | null>(null)
  const rulerTextRef = useRef<PIXI.Text | null>(null)

  // Range ring labels (world layer, so they clip with the glass like everything else)
  const rangeLabelContainerRef = useRef<PIXI.Container | null>(null)
  const rangeLabelTextsRef = useRef<PIXI.Text[]>([])

  // Airport diagram labels (runway numbers + gate names), rebuilt on airport change
  const airportLabelTextsRef = useRef<PIXI.Text[]>([])
  const airportLabelKeyRef = useRef('')

  // Compass dial: bezel ring + compass rose
  const scopeRadiusRef = useRef(150)
  const glassBgRef = useRef<PIXI.Graphics | null>(null)
  const bezelLayerRef = useRef<PIXI.Container | null>(null)
  const bezelGraphicsRef = useRef<PIXI.Graphics | null>(null)
  const compassLabelsRef = useRef<PIXI.Text[]>([])

  // HUD corner readouts & AMAN timeline layer
  const hudRangeTextRef = useRef<PIXI.Text | null>(null)
  const hudCursorTextRef = useRef<PIXI.Text | null>(null)
  const hudWindTextRef = useRef<PIXI.Text | null>(null)
  const windArrowGRef = useRef<PIXI.Graphics | null>(null)
  const amanContainerRef = useRef<PIXI.Container | null>(null)
  const amanGraphicsRef = useRef<PIXI.Graphics | null>(null)
  const amanTextsRef = useRef<PIXI.Text[]>([])

  // Hover state
  const hoveredIdRef = useRef<string | null>(null)
  const pointerWorldRef = useRef<{ x: number; y: number } | null>(null)
  const pointerInsideRef = useRef(false)

  /** Convert a pointer event to world NM coordinates */
  function pointerToWorld(e: { clientX: number; clientY: number }): { x: number; y: number } | null {
    const app = appRef.current
    if (!app || !canvasRef.current) return null
    const rect = canvasRef.current.getBoundingClientRect()
    const mx = e.clientX - rect.left
    const my = e.clientY - rect.top
    const cx = app.screen.width / 2
    const cy = app.screen.height / 2
    return {
      x: (mx - cx - offsetXRef.current) / zoomRef.current,
      y: (cy - my + offsetYRef.current) / zoomRef.current,
    }
  }

  // Glass background + scope radius in Pitch Black phosphor style
  function redrawBezel() {
    const app = appRef.current
    const glass = glassBgRef.current
    if (!app || !glass) return

    const w = app.screen.width
    const h = app.screen.height
    scopeRadiusRef.current = Math.max(40, Math.min(w, h) * 0.48 - 14)

    glass.clear()
    glass.rect(0, 0, w, h)
    glass.fill({ color: RADAR_RENDER_CONFIG.SCOPE_BG_COLOR })

    redrawCompass()
  }

  // Compass ring + tick marks + heading labels. Centered on the same point
  // as the range rings and the ARP marker (screen center + pan offset) so
  // the compass, the picture, and the bearing readout all agree — a compass
  // rose fixed to the screen while the picture pans underneath it would
  // drift out of alignment with the aircraft it's supposed to be measuring.
  // Cheap enough to redraw every frame like the rest of the scene.
  function redrawCompass() {
    const app = appRef.current
    const bezel = bezelGraphicsRef.current
    const bezelLayer = bezelLayerRef.current
    if (!app || !bezel || !bezelLayer) return

    const cx = app.screen.width / 2 + offsetXRef.current
    const cy = app.screen.height / 2 + offsetYRef.current
    const R = scopeRadiusRef.current

    bezel.clear()
    bezel.setStrokeStyle({ width: 3, color: 0x263042 })
    bezel.circle(cx, cy, R + 2)
    bezel.stroke()
    bezel.setStrokeStyle({ width: 1, color: 0x3b4a61 })
    bezel.circle(cx, cy, R)
    bezel.stroke()

    // Compass tick marks: minor every 10°, major (labeled) every 30°
    for (let deg = 0; deg < 360; deg += 10) {
      const major = deg % 30 === 0
      const rad = (deg * Math.PI) / 180
      const sx = Math.sin(rad)
      const sy = -Math.cos(rad)
      const innerR = R - (major ? 10 : 5)
      bezel.setStrokeStyle({ width: major ? 1.5 : 1, color: major ? 0x64748b : 0x334155 })
      bezel.moveTo(cx + sx * R, cy + sy * R)
      bezel.lineTo(cx + sx * innerR, cy + sy * innerR)
      bezel.stroke()
    }

    // Heading labels (lazily created, reused across redraws)
    let labels = compassLabelsRef.current
    if (labels.length === 0) {
      labels = COMPASS_LABEL_DEGS.map(() => {
        const t = new PIXI.Text({ text: '', style: { fontFamily: 'SF Mono, Consolas, monospace', fontSize: 9, fill: 0x64748b } })
        t.anchor.set(0.5)
        bezelLayer.addChild(t)
        return t
      })
      compassLabelsRef.current = labels
    }
    COMPASS_LABEL_DEGS.forEach((deg, i) => {
      const t = labels[i]
      const rad = (deg * Math.PI) / 180
      const sx = Math.sin(rad)
      const sy = -Math.cos(rad)
      const Rl = R + 13
      t.position.set(cx + sx * Rl, cy + sy * Rl)
      const cardinal = CARDINAL_LABELS[deg]
      t.text = cardinal ?? deg.toString().padStart(3, '0')
      t.style.fill = cardinal ? 0xe2e8f0 : 0x64748b
      t.style.fontSize = cardinal ? 12 : 9
      t.style.fontWeight = cardinal ? '700' : '400'
    })
  }

  // Redraw static layer (airport diagram, runways, extended approach funnels, navaids, range rings)
  function redrawStatic() {
    const app = appRef.current
    const g = staticLayerRef.current
    if (!app || !g || !state.airport) return
    g.clear()

    const zoom = zoomRef.current
    const ox = offsetXRef.current
    const oy = offsetYRef.current
    const cx = app.screen.width / 2
    const cy = app.screen.height / 2
    const mapX = (x: number) => cx + x * zoom + ox
    const mapY = (y: number) => cy - y * zoom + oy

    // Airport diagram (aprons → taxiways → buildings → gates)
    const diagram = state.airport.diagram
    if (diagram) {
      for (const poly of diagram.aprons) {
        g.poly(poly.flatMap(p => [mapX(p.x), mapY(p.y)]))
        g.fill({ color: 0x141c28 })
      }
      for (const twy of diagram.taxiways) {
        if (twy.points.length < 2) continue
        g.setStrokeStyle({ width: Math.max(2, twy.widthNM * zoom), color: 0x1d293b })
        g.moveTo(mapX(twy.points[0].x), mapY(twy.points[0].y))
        for (let i = 1; i < twy.points.length; i++) {
          g.lineTo(mapX(twy.points[i].x), mapY(twy.points[i].y))
        }
        g.stroke()
      }
      for (const poly of diagram.buildings) {
        g.poly(poly.flatMap(p => [mapX(p.x), mapY(p.y)]))
        g.fill({ color: 0x243246 })
      }
      for (const gate of state.airport.gates) {
        g.rect(mapX(gate.x) - 2, mapY(gate.y) - 2, 4, 4)
        g.stroke({ width: 1, color: 0x334155 })
      }
      // Heliports (T-014): marked circle with the classic H
      for (const pad of state.airport.heliports ?? []) {
        const px = mapX(pad.x)
        const py = mapY(pad.y)
        g.circle(px, py, 5)
        g.stroke({ width: 1.5, color: 0x94a3b8 })
        g.moveTo(px - 2.5, py)
        g.lineTo(px + 2.5, py)
        g.moveTo(px, py - 2.5)
        g.lineTo(px, py + 2.5)
        g.stroke({ width: 1.5, color: 0x94a3b8 })
      }
    }

    // Airport Runways & Extended Approach Corridors
    for (const rwy of state.airport.runways) {
      const widthPx = Math.max(3, (rwy.width / 6076.12) * zoom)
      g.setStrokeStyle({ width: widthPx, color: 0x94a3b8 })
      g.moveTo(mapX(rwy.thresholdX), mapY(rwy.thresholdY))
      g.lineTo(mapX(rwy.endX), mapY(rwy.endY))
      g.stroke()

      // Extended Centerline up to 10 NM with 1 NM tick marks
      const rad = (rwy.trueHeading - 180) * (Math.PI / 180)
      const extX = rwy.thresholdX + Math.sin(rad) * 10
      const extY = rwy.thresholdY + Math.cos(rad) * 10
      g.setStrokeStyle({ width: 1, color: 0x1e3a5f, alpha: 0.8 })
      g.moveTo(mapX(rwy.thresholdX), mapY(rwy.thresholdY))
      g.lineTo(mapX(extX), mapY(extY))
      g.stroke()

      // 1 NM tick marks & Approach Funnel (Glide Cone)
      const perpRad = rad + Math.PI / 2
      const perpX = Math.sin(perpRad)
      const perpY = Math.cos(perpRad)

      for (let nm = 1; nm <= 10; nm++) {
        const tx = rwy.thresholdX + Math.sin(rad) * nm
        const ty = rwy.thresholdY + Math.cos(rad) * nm
        const tickWidthNM = nm === 5 || nm === 10 ? 0.3 : 0.15
        
        g.setStrokeStyle({ width: nm === 5 || nm === 10 ? 1.5 : 1, color: 0x1e3a5f, alpha: 0.9 })
        g.moveTo(mapX(tx - perpX * tickWidthNM), mapY(ty - perpY * tickWidthNM))
        g.lineTo(mapX(tx + perpX * tickWidthNM), mapY(ty + perpY * tickWidthNM))
        g.stroke()
      }

      // Approach Funnel guidelines (3° cone width out to 10 NM)
      const funnelAngleNM = 0.5 // 0.5 NM half-width at 10 NM
      const fLeftX = extX + perpX * funnelAngleNM
      const fLeftY = extY + perpY * funnelAngleNM
      const fRightX = extX - perpX * funnelAngleNM
      const fRightY = extY - perpY * funnelAngleNM

      g.setStrokeStyle({ width: 1, color: 0x1e3a5f, alpha: 0.4 })
      g.moveTo(mapX(rwy.thresholdX), mapY(rwy.thresholdY))
      g.lineTo(mapX(fLeftX), mapY(fLeftY))
      g.moveTo(mapX(rwy.thresholdX), mapY(rwy.thresholdY))
      g.lineTo(mapX(fRightX), mapY(fRightY))
      g.stroke()
    }

    // Terminal Navaids / Waypoint Fixes
    for (const fix of HHAS_NAVAIDS) {
      const fx = mapX(fix.x)
      const fy = mapY(fix.y)
      const r = 4

      g.setStrokeStyle({ width: 1.5, color: RADAR_RENDER_CONFIG.NAVAID_SYMBOL_COLOR, alpha: 0.7 })
      g.moveTo(fx, fy - r)
      g.lineTo(fx + r, fy + r)
      g.lineTo(fx - r, fy + r)
      g.closePath()
      g.stroke()
    }

    // Hold-short bars
    for (const twy of state.airport.taxiways) {
      for (const node of twy.nodes) {
        if (node.kind !== 'hold-short') continue
        const edge = twy.edges.find(e => e.from === node.id || e.to === node.id)
        const otherId = edge ? (edge.from === node.id ? edge.to : edge.from) : null
        const other = otherId ? twy.nodes.find(n => n.id === otherId) : null
        const angle = other
          ? Math.atan2(mapY(other.y) - mapY(node.y), mapX(other.x) - mapX(node.x))
          : 0
        const px = Math.cos(angle + Math.PI / 2)
        const py = Math.sin(angle + Math.PI / 2)
        const half = Math.max(5, (twy.width / 1852) * zoom)
        g.setStrokeStyle({ width: 2, color: 0xf59e0b, alpha: 0.8 })
        g.moveTo(mapX(node.x) - px * half, mapY(node.y) - py * half)
        g.lineTo(mapX(node.x) + px * half, mapY(node.y) + py * half)
        g.stroke()
      }
    }

    // Airport Reference Point (ARP)
    const arpR = 5
    g.setStrokeStyle({ width: 1.5, color: 0xf59e0b })
    g.moveTo(mapX(0) - arpR, mapY(0))
    g.lineTo(mapX(0) + arpR, mapY(0))
    g.moveTo(mapX(0), mapY(0) - arpR)
    g.lineTo(mapX(0), mapY(0) + arpR)
    g.stroke()
    g.circle(mapX(0), mapY(0), arpR * 0.6)
    g.stroke()

    // Range Rings + labels
    g.setStrokeStyle({ width: 1, color: 0x162338 })
    for (let i = 1; i <= RANGE_RING_COUNT; i++) {
      g.circle(cx + ox, cy + oy, i * RANGE_RING_STEP_NM * zoom)
      g.stroke()
    }

    const labelContainer = rangeLabelContainerRef.current
    if (labelContainer) {
      let labels = rangeLabelTextsRef.current
      if (labels.length === 0) {
        labels = Array.from({ length: RANGE_RING_COUNT }, () => {
          const t = new PIXI.Text({ text: '', style: { fontFamily: 'SF Mono, Consolas, monospace', fontSize: 9, fill: 0x475569 } })
          t.anchor.set(0.5)
          labelContainer.addChild(t)
          return t
        })
        rangeLabelTextsRef.current = labels
      }
      const bearingRad = (RANGE_LABEL_BEARING_DEG * Math.PI) / 180
      const lsx = Math.sin(bearingRad)
      const lsy = -Math.cos(bearingRad)
      labels.forEach((t, i) => {
        const nm = (i + 1) * RANGE_RING_STEP_NM
        const screenR = nm * zoom
        t.text = `${nm}`
        t.position.set(cx + ox + lsx * screenR, cy + oy + lsy * screenR)
      })
    }

    // Runway numbers + gate labels
    if (labelContainer) {
      const key = state.airport.metadata.icao
      if (airportLabelKeyRef.current !== key) {
        for (const t of airportLabelTextsRef.current) t.destroy()
        airportLabelTextsRef.current = []
        airportLabelKeyRef.current = key
      }
      let texts = airportLabelTextsRef.current
      if (texts.length === 0) {
        texts = [
          ...state.airport.runways.map(() => new PIXI.Text({
            text: '', style: { fontFamily: 'SF Mono, Consolas, monospace', fontSize: 11, fontWeight: '700', fill: 0x94a3b8 },
          })),
          ...state.airport.gates.map(() => new PIXI.Text({
            text: '', style: { fontFamily: 'SF Mono, Consolas, monospace', fontSize: 8, fill: 0x64748b },
          })),
          ...(state.airport.heliports ?? []).map(() => new PIXI.Text({
            text: '', style: { fontFamily: 'SF Mono, Consolas, monospace', fontSize: 8, fontWeight: '700', fill: 0x94a3b8 },
          })),
          ...HHAS_NAVAIDS.map(() => new PIXI.Text({
            text: '', style: { fontFamily: 'SF Mono, Consolas, monospace', fontSize: 9, fontWeight: '600', fill: RADAR_RENDER_CONFIG.NAVAID_SYMBOL_COLOR },
          })),
        ]
        for (const t of texts) {
          t.anchor.set(0.5)
          labelContainer.addChild(t)
        }
        airportLabelTextsRef.current = texts
      }
      let i = 0
      for (const rwy of state.airport.runways) {
        const t = texts[i++]
        const rad = (rwy.trueHeading - 180) * (Math.PI / 180)
        const backNM = 14 / zoom
        t.text = rwy.id
        t.position.set(mapX(rwy.thresholdX + Math.sin(rad) * backNM), mapY(rwy.thresholdY + Math.cos(rad) * backNM))
      }
      const showGates = zoom > 80
      for (const gate of state.airport.gates) {
        const t = texts[i++]
        t.visible = showGates
        t.text = gate.id
        t.anchor.set(0, 0.5)
        t.position.set(mapX(gate.x) + 5, mapY(gate.y))
      }
      for (const pad of state.airport.heliports ?? []) {
        const t = texts[i++]
        t.visible = showGates
        t.text = pad.id
        t.anchor.set(0.5, 0)
        t.position.set(mapX(pad.x), mapY(pad.y) + 7)
      }
      for (const fix of HHAS_NAVAIDS) {
        const t = texts[i++]
        t.visible = true
        t.text = fix.id
        t.anchor.set(0.5, 0)
        t.position.set(mapX(fix.x), mapY(fix.y) + 6)
      }
    }
  }

  // Redraw dynamic layer (aircraft sprites, history trails, vector ticks, datablocks)
  function redrawDynamic() {
    const app = appRef.current
    const container = dynamicLayerRef.current
    if (!app || !container) return

    const zoom = zoomRef.current
    const ox = offsetXRef.current
    const oy = offsetYRef.current
    const cx = app.screen.width / 2
    const cy = app.screen.height / 2
    const mapX = (x: number) => cx + x * zoom + ox
    const mapY = (y: number) => cy - y * zoom + oy

    const sprites = aircraftSpritesRef.current
    const demoSprites = demoSpritesRef.current
    const demo = tutorialDemoRef.current

    if (demo) {
      for (const sprite of sprites.values()) {
        sprite.g.visible = false
        sprite.text.visible = false
      }

      const currentDemoIds = new Set(demo.map(d => d.id))
      for (const [id, sprite] of demoSprites.entries()) {
        if (!currentDemoIds.has(id)) {
          sprite.g.destroy()
          sprite.text.destroy()
          demoSprites.delete(id)
        }
      }

      for (const d of demo) {
        let sprite = demoSprites.get(d.id)
        if (!sprite) {
          const g = new PIXI.Graphics()
          const text = new PIXI.Text({ text: '', style: { fontFamily: 'SF Mono', fontSize: 10, fill: 0xffffff, align: 'left' } })
          container.addChild(g)
          container.addChild(text)
          sprite = { g, text }
          demoSprites.set(d.id, sprite)
        }
        sprite.g.visible = true
        sprite.text.visible = true
        drawAircraftBody(sprite.g, sprite.text, { ...d, forceLabel: true }, mapX, mapY, zoom, null)
      }
      return
    }

    for (const sprite of demoSprites.values()) {
      sprite.g.visible = false
      sprite.text.visible = false
    }

    const currentIds = new Set(state.aircraft.keys())
    for (const [id, sprite] of sprites.entries()) {
      if (!currentIds.has(id)) {
        sprite.g.destroy()
        sprite.text.destroy()
        sprites.delete(id)
      }
    }

    for (const ac of state.aircraft.values()) {
      let sprite = sprites.get(ac.id)
      if (!sprite) {
        const g = new PIXI.Graphics()
        const text = new PIXI.Text({ text: '', style: { fontFamily: 'SF Mono', fontSize: 10, fill: 0xffffff, align: 'left' } })

        g.eventMode = 'static'
        g.cursor = 'pointer'
        g.on('pointerdown', () => selectAircraft(ac.id))
        text.eventMode = 'static'
        text.cursor = 'pointer'
        text.on('pointerdown', () => selectAircraft(ac.id))

        container.addChild(g)
        container.addChild(text)
        sprite = { g, text }
        sprites.set(ac.id, sprite)
      }
      sprite.g.visible = true
      sprite.text.visible = true
      const isGround = GROUND_PHASES.includes(ac.phase)
      drawAircraftBody(sprite.g, sprite.text, {
        ...ac,
        isGround,
        flightType: ac.flightType,
        squawk: ac.squawk,
      }, mapX, mapY, zoom, hoveredIdRef.current)
    }
  }

  // Rotating radar sweep: one revolution every 6 seconds, with a faint trailing wedge
  function redrawSweep() {
    const app = appRef.current
    const g = sweepLayerRef.current
    if (!app || !g) return
    g.clear()

    const zoom = zoomRef.current
    const cx = app.screen.width / 2 + offsetXRef.current
    const cy = app.screen.height / 2 + offsetYRef.current
    const radius = 30 * zoom
    const angle = ((Date.now() % 6000) / 6000) * Math.PI * 2 - Math.PI / 2

    // Trailing wedge (20 degrees behind the line)
    const trail = (20 * Math.PI) / 180
    g.moveTo(cx, cy)
    g.arc(cx, cy, radius, angle - trail, angle)
    g.lineTo(cx, cy)
    g.fill({ color: 0x38bdf8, alpha: 0.05 })

    // Sweep line
    g.moveTo(cx, cy)
    g.lineTo(cx + Math.cos(angle) * radius, cy + Math.sin(angle) * radius)
    g.stroke({ width: 1, color: 0x38bdf8, alpha: 0.35 })
  }

  // Ruler: draws the measurement line + distance/bearing readout
  function redrawRuler() {
    const app = appRef.current
    const g = rulerLayerRef.current
    const text = rulerTextRef.current
    if (!app || !g || !text) return
    g.clear()

    const start = rulerStartRef.current
    const end = rulerEndRef.current
    if (!rulerActiveRef.current || !start || !end) {
      text.visible = false
      return
    }

    const zoom = zoomRef.current
    const ox = offsetXRef.current
    const oy = offsetYRef.current
    const cx = app.screen.width / 2
    const cy = app.screen.height / 2
    const x1 = cx + start.x * zoom + ox
    const y1 = cy - start.y * zoom + oy
    const x2 = cx + end.x * zoom + ox
    const y2 = cy - end.y * zoom + oy

    g.moveTo(x1, y1)
    g.lineTo(x2, y2)
    g.stroke({ width: 1, color: 0xfbbf24 })
    g.circle(x1, y1, 2)
    g.circle(x2, y2, 2)
    g.fill(0xfbbf24)

    const distNM = Math.hypot(end.x - start.x, end.y - start.y)
    const bearing = (Math.atan2(end.x - start.x, end.y - start.y) * 180 / Math.PI + 360) % 360
    text.text = `${distNM.toFixed(1)} NM / ${Math.round(bearing).toString().padStart(3, '0')}°`
    text.position.set((x1 + x2) / 2 + 8, (y1 + y2) / 2 - 16)
    text.visible = true
  }

  // Taxi route: draws the remaining taxiway path for the selected aircraft
  function redrawTaxiRoute() {
    const app = appRef.current
    const g = taxiRouteLayerRef.current
    if (!app || !g) return
    g.clear()

    const zoom = zoomRef.current
    const ox = offsetXRef.current
    const oy = offsetYRef.current
    const cx = app.screen.width / 2
    const cy = app.screen.height / 2
    const mapX = (x: number) => cx + x * zoom + ox
    const mapY = (y: number) => cy - y * zoom + oy

    const ac = Array.from(state.aircraft.values()).find((a) => a.isSelected)
    if (!ac || !ac.taxiRoute || ac.taxiRoute.length === 0) return
    if (ac.phase !== AircraftPhase.TAXI_OUT && ac.phase !== AircraftPhase.TAXI_IN) return

    const remaining = ac.taxiRoute.slice(ac.taxiRouteIndex)
    if (remaining.length < 1) return

    // Polyline from aircraft position through remaining route points
    const pts = [{ x: ac.x, y: ac.y }, ...remaining]
    g.setStrokeStyle({ width: 1, color: 0xf5d90a, alpha: 0.8 })
    g.moveTo(mapX(pts[0].x), mapY(pts[0].y))
    for (let i = 1; i < pts.length; i++) {
      g.lineTo(mapX(pts[i].x), mapY(pts[i].y))
    }
    g.stroke()

    // Small circle on the final point
    const last = remaining[remaining.length - 1]
    g.circle(mapX(last.x), mapY(last.y), 2)
    g.fill(0xf5d90a)
  }

  // HUD corner readouts: visible range, cursor bearing/distance, wind.
  // Screen-fixed, sit in the housing outside the glass — cheap enough to
  // update every frame alongside the rest of the render loop.
  function updateHud() {
    const app = appRef.current
    if (!app) return
    const w = app.screen.width
    const h = app.screen.height
    const margin = 10

    const rangeText = hudRangeTextRef.current
    if (rangeText) {
      const rangeNM = scopeRadiusRef.current / zoomRef.current
      rangeText.text = `RNG ${rangeNM.toFixed(1)} NM`
      rangeText.position.set(margin, margin)
    }

    const cursorText = hudCursorTextRef.current
    if (cursorText) {
      const p = pointerWorldRef.current
      if (p && pointerInsideRef.current) {
        const dist = Math.hypot(p.x, p.y)
        const brg = (Math.atan2(p.x, p.y) * 180 / Math.PI + 360) % 360
        cursorText.text = `BRG ${Math.round(brg).toString().padStart(3, '0')}° / ${dist.toFixed(1)} NM`
        cursorText.visible = true
      } else {
        cursorText.visible = false
      }
      cursorText.position.set(w - margin, margin)
    }

    const windText = hudWindTextRef.current
    const windArrow = windArrowGRef.current
    const wind = state.wind
    if (windText) {
      windText.text = `WIND ${Math.round(wind.direction).toString().padStart(3, '0')}° / ${Math.round(wind.speed)} KT`
      windText.position.set(margin + 26, h - margin)
    }
    if (windArrow) {
      windArrow.clear()
      const ax = margin + 12
      const ay = h - margin - 14
      // Wind direction is where it blows FROM; the arrow points where it
      // blows TOWARD, matching windsock convention.
      const towardRad = ((wind.direction + 180) * Math.PI) / 180
      const dx = Math.sin(towardRad)
      const dy = -Math.cos(towardRad)
      const len = 14
      const tipX = ax + (dx * len) / 2
      const tipY = ay + (dy * len) / 2
      const backX = ax - (dx * len) / 2
      const backY = ay - (dy * len) / 2
      windArrow.setStrokeStyle({ width: 1.5, color: 0xfbbf24 })
      windArrow.moveTo(backX, backY)
      windArrow.lineTo(tipX, tipY)
      windArrow.stroke()

      const headLen = 4
      const wingAngle = (150 * Math.PI) / 180
      const rotate = (vx: number, vy: number, ang: number): [number, number] => [
        vx * Math.cos(ang) - vy * Math.sin(ang),
        vx * Math.sin(ang) + vy * Math.cos(ang),
      ]
      const [w1x, w1y] = rotate(dx, dy, wingAngle)
      const [w2x, w2y] = rotate(dx, dy, -wingAngle)
      windArrow.poly([
        tipX, tipY,
        tipX + w1x * headLen, tipY + w1y * headLen,
        tipX + w2x * headLen, tipY + w2y * headLen,
      ])
      windArrow.fill(0xfbbf24)
    }
  }

  // Initialization
  useEffect(() => {
    if (!canvasRef.current) return

    // React StrictMode mounts/unmounts/remounts this effect once in dev, and this
    // init is async — a cleanup can fire before app.init() resolves. Without this
    // guard, the orphaned first Application still finishes initializing, appends
    // its (never-updated) canvas, and its own instance's refs get silently
    // overwritten by the second run — leaving a visible-but-frozen canvas on
    // screen while the real one gets drawn into an orphaned/off-screen canvas.
    let cancelled = false
    let resizeObserver: ResizeObserver | null = null

    const initPixi = async () => {
      const app = new PIXI.Application()
      await app.init({
        width: canvasRef.current!.clientWidth,
        height: canvasRef.current!.clientHeight,
        backgroundAlpha: 0, // housing shows the panel's own CSS background
        antialias: true,
        resolution: window.devicePixelRatio || 1,
      })

      if (cancelled) {
        app.destroy(true, { children: true, texture: true })
        return
      }

      canvasRef.current!.appendChild(app.canvas)
      appRef.current = app

      // Scope content: everything that represents the "picture" (airport,
      // aircraft, sweep, ruler) — masked to a fixed circular glass so it
      // reads as a contained radar instrument rather than a rectangular pane.
      const scopeContent = new PIXI.Container()
      app.stage.addChild(scopeContent)

      const glassBg = new PIXI.Graphics()
      scopeContent.addChild(glassBg)
      glassBgRef.current = glassBg

      const staticG = new PIXI.Graphics()
      scopeContent.addChild(staticG)
      staticLayerRef.current = staticG

      const rangeLabelContainer = new PIXI.Container()
      scopeContent.addChild(rangeLabelContainer)
      rangeLabelContainerRef.current = rangeLabelContainer

      const taxiRouteG = new PIXI.Graphics()
      scopeContent.addChild(taxiRouteG)
      taxiRouteLayerRef.current = taxiRouteG

      const sweepG = new PIXI.Graphics()
      scopeContent.addChild(sweepG)
      sweepLayerRef.current = sweepG

      const dynamicCont = new PIXI.Container()
      scopeContent.addChild(dynamicCont)
      dynamicLayerRef.current = dynamicCont

      const rulerG = new PIXI.Graphics()
      scopeContent.addChild(rulerG)
      rulerLayerRef.current = rulerG
      const rulerT = new PIXI.Text({ text: '', style: { fontFamily: 'SF Mono', fontSize: 11, fill: 0xfbbf24 } })
      rulerT.visible = false
      scopeContent.addChild(rulerT)
      rulerTextRef.current = rulerT

      // Bezel + compass rose: screen-fixed furniture, drawn over the glass
      const bezelLayer = new PIXI.Container()
      app.stage.addChild(bezelLayer)
      bezelLayerRef.current = bezelLayer
      const bezelGraphics = new PIXI.Graphics()
      bezelLayer.addChild(bezelGraphics)
      bezelGraphicsRef.current = bezelGraphics

      // HUD corner readouts, topmost
      const hudLayer = new PIXI.Container()
      app.stage.addChild(hudLayer)

      const rangeText = new PIXI.Text({ text: '', style: { fontFamily: 'SF Mono, Consolas, monospace', fontSize: 11, fill: 0x94a3b8 } })
      hudLayer.addChild(rangeText)
      hudRangeTextRef.current = rangeText

      const cursorText = new PIXI.Text({ text: '', style: { fontFamily: 'SF Mono, Consolas, monospace', fontSize: 11, fill: 0x64748b } })
      cursorText.anchor.set(1, 0)
      hudLayer.addChild(cursorText)
      hudCursorTextRef.current = cursorText

      const windText = new PIXI.Text({ text: '', style: { fontFamily: 'SF Mono, Consolas, monospace', fontSize: 11, fill: 0x94a3b8 } })
      windText.anchor.set(0, 1)
      hudLayer.addChild(windText)
      hudWindTextRef.current = windText

      const windArrow = new PIXI.Graphics()
      hudLayer.addChild(windArrow)
      windArrowGRef.current = windArrow

      redrawBezel()

      // The container's size can change after mount (window resize, DevTools
      // docking in dev) — without this, the canvas keeps its mount-time size
      // and the scene center drifts into clipped overflow. The renderer just
      // resizes here; the per-frame render effect repaints within a frame.
      resizeObserver = new ResizeObserver(() => {
        const el = canvasRef.current
        const a = appRef.current
        if (!el || !a) return
        a.renderer.resize(el.clientWidth, el.clientHeight)
        redrawBezel()
      })
      resizeObserver.observe(canvasRef.current!)
    }

    initPixi().catch((err) => {
      console.error('Failed to initialize PixiJS radar', err)
    })

    return () => {
      cancelled = true
      resizeObserver?.disconnect()
      if (appRef.current) {
        appRef.current.destroy(true, { children: true, texture: true })
        appRef.current = null
      }
    }
  }, [])

  // Render Loop (Static + Dynamic). Both run on every snapshot update (not just
  // when `state.airport` changes) because the static layer's first draw can
  // otherwise race PixiJS's async init and never get a retry — redrawStatic()
  // is cheap and idempotent, so redrawing it every frame alongside the aircraft
  // layer is negligible overhead and guarantees it eventually paints once ready.
  useEffect(() => {
    redrawStatic()
    redrawDynamic()
    redrawTaxiRoute()
    redrawSweep()
    redrawRuler()
    redrawCompass()
    updateHud()
  }, [state]) // React handles 60 FPS calls to this

  // Keyboard-driven view controls (dispatched by useKeyboardShortcuts).
  // Handlers only mutate the view refs — the per-frame render effect above
  // repaints with them on the next snapshot, so no direct redraw is needed
  // (and calling the stale first-render redraw closures here would be wrong).
  useEffect(() => {
    const applyZoom = (scale: number) => {
      // Zoom about the view center: offsets scale with zoom so the world
      // point currently at center stays at center. Multiplicative steps so
      // the range 5–400 px/NM (whole 30 NM sector down to apron detail) is
      // traversable in a reasonable number of presses.
      const oldZoom = zoomRef.current
      const newZoom = Math.max(5, Math.min(400, oldZoom * scale))
      if (newZoom === oldZoom) return
      const factor = newZoom / oldZoom
      zoomRef.current = newZoom
      offsetXRef.current *= factor
      offsetYRef.current *= factor
    }
    const onCenter = () => {
      offsetXRef.current = 0
      offsetYRef.current = 0
    }
    const onResetView = () => {
      zoomRef.current = 15
      onCenter()
    }
    const onZoomIn = () => applyZoom(1.3)
    const onZoomOut = () => applyZoom(1 / 1.3)

    const onToggleRuler = () => {
      rulerActiveRef.current = !rulerActiveRef.current
      if (!rulerActiveRef.current) {
        rulerStartRef.current = null
        rulerEndRef.current = null
        rulerMeasuringRef.current = false
      }
      if (canvasRef.current) {
        canvasRef.current.style.cursor = rulerActiveRef.current ? 'cell' : 'crosshair'
      }
    }

    const onDemoUpdate = (e: Event) => {
      const detail = (e as CustomEvent<readonly TutorialDemoAircraft[] | null>).detail
      tutorialDemoRef.current = detail ?? null
    }

    window.addEventListener('radar-center', onCenter)
    window.addEventListener('radar-reset-view', onResetView)
    window.addEventListener('radar-zoom-in', onZoomIn)
    window.addEventListener('radar-zoom-out', onZoomOut)
    window.addEventListener('radar-toggle-ruler', onToggleRuler)
    window.addEventListener('tutorial-demo-aircraft', onDemoUpdate)
    return () => {
      window.removeEventListener('radar-center', onCenter)
      window.removeEventListener('radar-reset-view', onResetView)
      window.removeEventListener('radar-zoom-in', onZoomIn)
      window.removeEventListener('radar-zoom-out', onZoomOut)
      window.removeEventListener('radar-toggle-ruler', onToggleRuler)
      window.removeEventListener('tutorial-demo-aircraft', onDemoUpdate)
    }
  }, [])

  // --- Interaction handlers ---

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    // Ruler mode: drag measures instead of panning
    if (rulerActiveRef.current) {
      const w = pointerToWorld(e)
      if (w) {
        rulerStartRef.current = w
        rulerEndRef.current = w
        rulerMeasuringRef.current = true
        try { e.currentTarget.setPointerCapture(e.pointerId) } catch { /* synthetic events have no active pointer */ }
      }
      return
    }

    // Begin potential drag
    hoveredIdRef.current = null
    isDraggingRef.current = true
    dragStartRef.current = { x: e.clientX, y: e.clientY }
    dragPrevOffsetRef.current = { x: offsetXRef.current, y: offsetYRef.current }
    try { e.currentTarget.setPointerCapture(e.pointerId) } catch { /* synthetic events have no active pointer */ }
    e.currentTarget.style.cursor = 'grabbing'

    // Deselect if clicking background (canvas element, not a PIXI datablock)
    if (e.target === canvasRef.current?.firstChild) {
      selectAircraft(null)
    }
  }

  const handlePointerMove = (e: React.PointerEvent) => {
    const w = pointerToWorld(e)
    pointerWorldRef.current = w

    if (rulerMeasuringRef.current) {
      if (w) rulerEndRef.current = w
      return
    }

    if (!isDraggingRef.current) {
      // Hover hit-test against aircraft blips. Done here (a React handler,
      // always a fresh closure over the current `state`) rather than via
      // per-sprite PIXI pointerover/pointerout events, which are attached
      // once at sprite creation and would read stale aircraft positions.
      const app = appRef.current
      if (app && canvasRef.current && !rulerActiveRef.current) {
        const rect = canvasRef.current.getBoundingClientRect()
        const mx = e.clientX - rect.left
        const my = e.clientY - rect.top
        const zoom = zoomRef.current
        const ox = offsetXRef.current
        const oy = offsetYRef.current
        const cx = app.screen.width / 2
        const cy = app.screen.height / 2
        let hoveredId: string | null = null
        let bestDist = 12 // matches the PIXI hitArea radius so hover + click agree
        for (const ac of state.aircraft.values()) {
          const sx = cx + ac.x * zoom + ox
          const sy = cy - ac.y * zoom + oy
          const d = Math.hypot(mx - sx, my - sy)
          if (d < bestDist) { bestDist = d; hoveredId = ac.id }
        }
        if (hoveredIdRef.current !== hoveredId) {
          hoveredIdRef.current = hoveredId
          redrawDynamic()
        }
        canvasRef.current.style.cursor = hoveredId ? 'pointer' : 'crosshair'
      }
      return
    }

    const dx = e.clientX - dragStartRef.current.x
    const dy = e.clientY - dragStartRef.current.y

    // Small dead-zone threshold to avoid micro-pan on click
    if (Math.abs(dx) < 3 && Math.abs(dy) < 3) return

    offsetXRef.current = dragPrevOffsetRef.current.x + dx
    offsetYRef.current = dragPrevOffsetRef.current.y + dy
    redrawDynamic()
    redrawCompass()
  }

  const handlePointerUp = () => {
    rulerMeasuringRef.current = false
    if (!isDraggingRef.current) return
    isDraggingRef.current = false
    if (canvasRef.current) {
      canvasRef.current.style.cursor = rulerActiveRef.current ? 'cell' : 'crosshair'
    }
  }

  const handlePointerCancel = () => {
    isDraggingRef.current = false
    rulerMeasuringRef.current = false
    if (canvasRef.current) {
      canvasRef.current.style.cursor = rulerActiveRef.current ? 'cell' : 'crosshair'
    }
  }

  const handlePointerEnter = () => {
    pointerInsideRef.current = true
  }

  const handlePointerLeave = () => {
    pointerInsideRef.current = false
    if (hudCursorTextRef.current) hudCursorTextRef.current.visible = false
    if (hoveredIdRef.current !== null) {
      hoveredIdRef.current = null
      redrawDynamic()
    }
  }

  const handleWheel = (e: WheelEvent) => {
    e.preventDefault()

    const oldZoom = zoomRef.current
    const scale = e.deltaY > 0 ? 1 / 1.1 : 1.1
    const newZoom = Math.max(5, Math.min(400, oldZoom * scale))
    if (newZoom === oldZoom) return

    const app = appRef.current
    if (!app || !canvasRef.current) return

    const rect = canvasRef.current.getBoundingClientRect()
    const mouseX = e.clientX - rect.left
    const mouseY = e.clientY - rect.top

    const cx = app.screen.width / 2
    const cy = app.screen.height / 2
    const oldOx = offsetXRef.current
    const oldOy = offsetYRef.current

    // World coordinates under cursor before zoom
    const worldX = (mouseX - cx - oldOx) / oldZoom
    const worldY = (cy - mouseY + oldOy) / oldZoom

    // New offset that keeps the same world point under cursor
    const newOx = mouseX - cx - worldX * newZoom
    const newOy = mouseY - cy + worldY * newZoom

    zoomRef.current = newZoom
    offsetXRef.current = newOx
    offsetYRef.current = newOy

    // Redraw both layers with new zoom/offset
    redrawStatic()
    redrawDynamic()
    redrawTaxiRoute()
    redrawCompass()
    updateHud()
  }

  // React attaches onWheel as a passive listener (for scroll perf), which
  // makes e.preventDefault() inside it a silent no-op and logs "Unable to
  // preventDefault inside passive event listener invocation" on every tick.
  // A native, non-passive listener is the standard fix. handleWheelRef keeps
  // this pointed at the current render's handler (which closes over `state`
  // via redrawStatic/redrawDynamic/updateHud) even though the listener
  // itself is only attached once on mount.
  const handleWheelRef = useRef(handleWheel)
  useEffect(() => {
    handleWheelRef.current = handleWheel
  })

  useEffect(() => {
    const el = canvasRef.current
    if (!el) return
    const onWheel = (e: WheelEvent) => handleWheelRef.current(e)
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [])

  return (
    <div
      ref={canvasRef}
      style={{ width: '100%', height: '100%', overflow: 'hidden', cursor: 'crosshair' }}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerCancel}
      onPointerEnter={handlePointerEnter}
      onPointerLeave={handlePointerLeave}
    />
  )
}
