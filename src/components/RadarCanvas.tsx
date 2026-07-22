import 'pixi.js/unsafe-eval'
import React, { useEffect, useRef } from 'react'
import * as PIXI from 'pixi.js'
import { useGame } from '../state/GameContext'
import { AircraftPhase } from '../engine/types'
import type { TutorialDemoAircraft } from '../data/tutorialContent'

const COMPASS_LABEL_DEGS = [0, 30, 60, 90, 120, 150, 180, 210, 240, 270, 300, 330]
const CARDINAL_LABELS: Record<number, string> = { 0: 'N', 90: 'E', 180: 'S', 270: 'W' }
const RANGE_RING_STEP_NM = 5
const RANGE_RING_COUNT = 6 // 5, 10, 15, 20, 25, 30 NM
const RANGE_LABEL_BEARING_DEG = 315 // fixed radial (NW) so labels never sit under traffic

/** Aircraft phases drawn as ground traffic (rect blip, no vector/trail vector line). */
const GROUND_PHASES: ReadonlyArray<AircraftPhase> = [
  AircraftPhase.AT_GATE, AircraftPhase.AWAITING_PUSHBACK, AircraftPhase.PUSHING_BACK, AircraftPhase.READY_TO_TAXI,
  AircraftPhase.VACATED, AircraftPhase.TAXI_IN, AircraftPhase.TAXI_OUT, AircraftPhase.HOLD_SHORT, AircraftPhase.LINE_UP,
]

/** Minimal shape both real Aircraft and TutorialDemoAircraft satisfy — the
 *  only fields drawAircraftBody actually needs. Real Aircraft objects don't
 *  carry `isGround` as a stored field (it's derived from `phase`), so callers
 *  must compute it and spread it onto the aircraft before passing it in. */
interface DrawableAircraft {
  readonly id: string
  readonly callsign: string
  readonly x: number
  readonly y: number
  readonly altitude: number
  readonly speed: number
  readonly heading: number
  readonly isGround: boolean
  readonly isSelected?: boolean
  readonly inViolation?: boolean
  readonly urgent?: boolean
  readonly clearedAltitude?: number | null
  readonly clearedSpeed?: number | null
  readonly trail?: ReadonlyArray<{ x: number; y: number }>
  /** Always show the leader-line datablock even when isGround and not
   *  selected. Used for staged tutorial demo aircraft, which are never
   *  selectable, so ground-phase demos would otherwise render as an
   *  unlabeled blip even while a step narrates its callsign. */
  readonly forceLabel?: boolean
}

/** Draws one aircraft's blip, trail, hover ring, violation pulse, vector,
 *  and leader-line datablock into the given sprite. Used for both real
 *  traffic and staged tutorial demo aircraft so a demo violation looks
 *  pixel-identical to a real one. */
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

  let color = 0x38bdf8 // cyan
  if (data.isSelected) color = 0xffffff
  if (data.urgent) color = 0xeab308
  if (data.inViolation) color = 0xef4444
  if (isGround) color = 0x10b981

  g.clear()
  g.hitArea = new PIXI.Circle(x, y, 9)

  // Trail
  if (data.trail && data.trail.length > 1) {
    g.setStrokeStyle({ width: 1, color, alpha: 0.4 })
    g.moveTo(mapX(data.trail[0].x), mapY(data.trail[0].y))
    for (let i = 1; i < data.trail.length; i++) {
      g.lineTo(mapX(data.trail[i].x), mapY(data.trail[i].y))
    }
    g.stroke()
  }

  // Hover ring
  if (hoveredId === data.id && !data.isSelected) {
    g.setStrokeStyle({ width: 1, color: 0xe2e8f0, alpha: 0.6 })
    g.circle(x, y, 7)
    g.stroke()
  }

  // Violation pulse halo
  if (data.inViolation) {
    const phase = (Date.now() % 1200) / 1200
    g.setStrokeStyle({ width: 2, color: 0xef4444, alpha: 0.6 * (1 - phase) })
    g.circle(x, y, 6 + phase * 8)
    g.stroke()
  }

  // Blip
  if (isGround) {
    g.rect(x - 2, y - 2, 4, 4)
  } else {
    g.circle(x, y, 3)
  }
  g.fill(color)

  // Vector
  if (!isGround) {
    const rad = data.heading * (Math.PI / 180)
    const dist1MinNM = (data.speed / 60)
    const lx = x + Math.sin(rad) * dist1MinNM * zoom
    const ly = y - Math.cos(rad) * dist1MinNM * zoom
    g.setStrokeStyle({ width: 1, color })
    g.moveTo(x, y)
    g.lineTo(lx, ly)
    g.stroke()
  }

  // Leader-line datablock
  if (!isGround || data.isSelected || data.forceLabel) {
    text.visible = true
    const anchorX = x + 14
    const anchorY = y - 14
    g.setStrokeStyle({ width: 1, color, alpha: 0.5 })
    g.moveTo(x + 4, y - 4)
    g.lineTo(anchorX - 2, anchorY + 2)
    g.stroke()

    text.position.set(anchorX + 2, anchorY - 6)
    text.style.fill = color

    const altStr = data.altitude < 100 ? 'GND' : Math.round(data.altitude / 100).toString().padStart(3, '0')
    const spdStr = Math.round(data.speed / 10).toString().padStart(2, '0')
    const cAltStr = data.clearedAltitude ? Math.round(data.clearedAltitude / 100).toString().padStart(3, '0') : ''
    const cSpdStr = data.clearedSpeed ? Math.round(data.clearedSpeed / 10).toString().padStart(2, '0') : ''

    let label = `${data.callsign}\n${altStr} ${spdStr}`
    if (cAltStr || cSpdStr) {
      label += `\nC:${cAltStr} ${cSpdStr}`
    }
    text.text = label
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

  // Compass dial: bezel ring + compass rose (screen-space furniture, drawn
  // over the full-canvas picture rather than clipping it to a circle).
  const scopeRadiusRef = useRef(150)
  const glassBgRef = useRef<PIXI.Graphics | null>(null)
  const bezelLayerRef = useRef<PIXI.Container | null>(null)
  const bezelGraphicsRef = useRef<PIXI.Graphics | null>(null)
  const compassLabelsRef = useRef<PIXI.Text[]>([])

  // HUD corner readouts (screen-space, outside the glass)
  const hudRangeTextRef = useRef<PIXI.Text | null>(null)
  const hudCursorTextRef = useRef<PIXI.Text | null>(null)
  const hudWindTextRef = useRef<PIXI.Text | null>(null)
  const windArrowGRef = useRef<PIXI.Graphics | null>(null)

  // Hover state, tracked from the React-level pointer handler (always a fresh
  // closure) rather than per-sprite PIXI events (which go stale after the
  // sprite's first creation and would read outdated aircraft positions).
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

  // Glass background + scope radius. The radius only depends on canvas
  // size, so it's cached on resize; the compass ring itself is drawn
  // separately (redrawCompass) since its center must track pan.
  function redrawBezel() {
    const app = appRef.current
    const glass = glassBgRef.current
    if (!app || !glass) return

    const w = app.screen.width
    const h = app.screen.height
    scopeRadiusRef.current = Math.max(40, Math.min(w, h) * 0.48 - 14)

    glass.clear()
    glass.rect(0, 0, w, h)
    glass.fill({ color: 0x0f172a })

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

  // Redraw static layer (airport diagram, runways, range rings) — called
  // every frame alongside the dynamic layer (see the render-loop effect
  // below for why).
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

    // Airport diagram (render-only geometry from the .airport file), drawn
    // beneath the runways: aprons → taxiways → buildings → gates.
    const diagram = state.airport.diagram
    if (diagram) {
      for (const poly of diagram.aprons) {
        g.poly(poly.flatMap(p => [mapX(p.x), mapY(p.y)]))
        g.fill({ color: 0x1c2534 })
      }
      for (const twy of diagram.taxiways) {
        if (twy.points.length < 2) continue
        g.setStrokeStyle({ width: Math.max(2, twy.widthNM * zoom), color: 0x24344a })
        g.moveTo(mapX(twy.points[0].x), mapY(twy.points[0].y))
        for (let i = 1; i < twy.points.length; i++) {
          g.lineTo(mapX(twy.points[i].x), mapY(twy.points[i].y))
        }
        g.stroke()
      }
      for (const poly of diagram.buildings) {
        g.poly(poly.flatMap(p => [mapX(p.x), mapY(p.y)]))
        g.fill({ color: 0x2c3a4e })
      }
      for (const gate of state.airport.gates) {
        g.rect(mapX(gate.x) - 2, mapY(gate.y) - 2, 4, 4)
        g.stroke({ width: 1, color: 0x475569 })
      }
    }

    // Airport Runways — the whole airport spans <2 NM, so at default zoom a
    // 1px hairline stroke is invisible; draw a strip with a 3px floor that
    // tracks the runway's real width once zoomed in far enough to exceed it.
    for (const rwy of state.airport.runways) {
      const widthPx = Math.max(3, (rwy.width / 6076.12) * zoom)
      g.setStrokeStyle({ width: widthPx, color: 0x94a3b8 })
      g.moveTo(mapX(rwy.thresholdX), mapY(rwy.thresholdY))
      g.lineTo(mapX(rwy.endX), mapY(rwy.endY))
      g.stroke()

      // Extended centerline
      const rad = (rwy.trueHeading - 180) * (Math.PI / 180)
      const extX = rwy.thresholdX + Math.sin(rad) * 10
      const extY = rwy.thresholdY + Math.cos(rad) * 10
      g.setStrokeStyle({ width: 1, color: 0x334155 })
      g.moveTo(mapX(rwy.thresholdX), mapY(rwy.thresholdY))
      g.lineTo(mapX(extX), mapY(extY))
      g.stroke()
    }

    // Airport Reference Point — a fixed instrument marker distinct from any
    // runway geometry, so the scope's own origin is always identifiable.
    const arpR = 5
    g.setStrokeStyle({ width: 1.5, color: 0xf59e0b })
    g.moveTo(mapX(0) - arpR, mapY(0))
    g.lineTo(mapX(0) + arpR, mapY(0))
    g.moveTo(mapX(0), mapY(0) - arpR)
    g.lineTo(mapX(0), mapY(0) + arpR)
    g.stroke()
    g.circle(mapX(0), mapY(0), arpR * 0.6)
    g.stroke()

    // Range Rings (center follows pan offset) + labels along a fixed radial
    g.setStrokeStyle({ width: 1, color: 0x1e293b })
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
  }

  // Redraw dynamic layer (aircraft sprites, trails, vectors, datablocks)
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
      // A tutorial demo is active: hide real traffic (without touching
      // gameState — it's still there, just not drawn this frame) and draw
      // only the staged mock aircraft.
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

    // No demo active: hide any leftover demo sprites and draw real traffic.
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

        // Make both the blip and its text clickable (bigger effective hit
        // target than the label alone). These handlers only ever call
        // selectAircraft(ac.id) — safe to attach once even though the
        // closure goes stale, since selectAircraft mutates the singleton
        // gameState directly and ac.id never changes for this sprite.
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
      drawAircraftBody(sprite.g, sprite.text, { ...ac, isGround }, mapX, mapY, zoom, hoveredIdRef.current)
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
        let bestDist = 10
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
