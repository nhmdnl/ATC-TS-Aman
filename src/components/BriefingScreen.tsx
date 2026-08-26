import React, { useState } from 'react'
import { useGame } from '../state/GameContext'
import type { DifficultyLevel, AircraftClass } from '../engine/types'
import { ControllerStation } from '../engine/types'
import { DIFFICULTY_PRESETS, CSS_COLORS, DEFAULT_ENABLED_AIRCRAFT_CLASSES } from '../engine/constants'
import { careerSystem, DIFFICULTY_UNLOCK_LEVEL, airportUnlockLevel, rankTitle } from '../engine/career-system'
import AirportPreview from './AirportPreview'

const DIFF_ORDER: DifficultyLevel[] = ['easy', 'medium', 'hard']

const DIFF_LABELS: Record<DifficultyLevel, string> = {
  easy: 'EASY',
  medium: 'MEDIUM',
  hard: 'HARD',
}

const STATION_ORDER: ControllerStation[] = [ControllerStation.GROUND, ControllerStation.TOWER, ControllerStation.APPROACH]

const STATION_LABELS: Record<ControllerStation, string> = {
  [ControllerStation.GROUND]: 'GROUND',
  [ControllerStation.TOWER]: 'TOWER',
  [ControllerStation.APPROACH]: 'APPROACH',
  [ControllerStation.AREA]: 'AREA',
}

const CLASS_ORDER: AircraftClass[] = ['LIGHT', 'MEDIUM', 'HEAVY', 'SUPER_HEAVY', 'MILITARY', 'HELICOPTER']

const CLASS_LABELS: Record<AircraftClass, string> = {
  LIGHT: 'Small GA',
  MEDIUM: 'Medium Jets',
  HEAVY: 'Heavy Jets',
  SUPER_HEAVY: 'Super Heavy',
  MILITARY: 'Military',
  HELICOPTER: 'Helicopters',
}

// Menu-local chrome values not covered by CSS_COLORS (hairline borders,
// panel fills) — one place, not sprinkled literals.
const BORDER = '#1D2430'
const FIELD_BG = '#141B26'
const MONO = "ui-monospace, 'Cascadia Mono', Consolas, Menlo, monospace"

const SECTION_LABEL: React.CSSProperties = {
  color: CSS_COLORS.text.secondary,
  fontSize: 10,
  textTransform: 'uppercase',
  letterSpacing: 1.5,
  marginBottom: 6,
}

const HELPER: React.CSSProperties = {
  marginTop: 6,
  fontSize: 10,
  color: CSS_COLORS.text.muted,
}

/** Segmented selector button (difficulty / stations). */
function segStyle(active: boolean, locked: boolean): React.CSSProperties {
  return {
    flex: 1,
    padding: '9px 0',
    background: active ? CSS_COLORS.accent.blue : FIELD_BG,
    color: locked ? CSS_COLORS.text.disabled : active ? CSS_COLORS.bg.primary : CSS_COLORS.text.secondary,
    border: active ? `1px solid ${CSS_COLORS.accent.blue}` : `1px solid ${BORDER}`,
    borderRadius: 3,
    cursor: locked ? 'not-allowed' : 'pointer',
    opacity: locked ? 0.55 : 1,
    fontWeight: active ? 700 : 400,
    fontSize: 12,
    fontFamily: 'inherit',
  }
}

function ParamCell({ label, value }: { label: string; value: string }): React.ReactElement {
  return (
    <div style={{ background: CSS_COLORS.bg.card, border: `1px solid ${BORDER}`, borderRadius: 3, padding: '6px 8px' }}>
      <div style={{ fontSize: 9, color: CSS_COLORS.text.muted, textTransform: 'uppercase', letterSpacing: 1 }}>{label}</div>
      <div style={{ fontSize: 12, color: CSS_COLORS.text.primary, fontFamily: MONO, marginTop: 2 }}>{value}</div>
    </div>
  )
}

export default function BriefingScreen(): React.ReactElement {
  const { setDifficulty, setPlayerStations, setEnabledAircraftClasses, startSession, muted, toggleMute, airports, selectedAirportId, setAirport } = useGame()
  const level = careerSystem.state.level
  const diffUnlocked = (d: DifficultyLevel) => level >= (DIFFICULTY_UNLOCK_LEVEL[d] ?? 1)
  const [selected, setSelected] = useState<DifficultyLevel>(
    () => [...DIFF_ORDER].reverse().find(diffUnlocked) ?? 'easy'
  )
  const [stations, setStations] = useState<ControllerStation[]>(STATION_ORDER)
  const [classes, setClasses] = useState<AircraftClass[]>([...DEFAULT_ENABLED_AIRCRAFT_CLASSES])

  const preset = DIFFICULTY_PRESETS[selected]
  const airportEntry = airports.find(a => a.id === selectedAirportId) ?? airports[0]

  const toggleStation = (station: ControllerStation) => {
    setStations(prev => {
      if (prev.includes(station)) {
        if (prev.length === 1) return prev
        return prev.filter(s => s !== station)
      }
      return [...prev, station]
    })
  }

  const toggleClass = (acClass: AircraftClass) => {
    setClasses(prev => {
      if (prev.includes(acClass)) {
        if (prev.length === 1) return prev // keep at least one category active
        return prev.filter(c => c !== acClass)
      }
      return [...prev, acClass]
    })
  }

  const handleStart = () => {
    setDifficulty(selected)
    setPlayerStations(stations)
    setEnabledAircraftClasses(classes)
    startSession()
  }

  return (
    <div style={{
      position: 'absolute',
      inset: 0,
      zIndex: 1000,
      // Opaque title-screen backdrop — the game UI keeps warming up behind it
      // (Pixi/WebGL init), it just shouldn't bleed through the main menu.
      background: `radial-gradient(ellipse at center, #131A24 0%, ${CSS_COLORS.bg.primary} 75%)`,
      display: 'flex',
      flexDirection: 'column',
      padding: '20px 28px 16px',
      overflowY: 'auto',
    }}>
      <div style={{
        width: '100%',
        maxWidth: 1180,
        margin: '0 auto',
        display: 'flex',
        flexDirection: 'column',
        flex: 1,
        minHeight: 0,
      }}>
        {/* ── Identity header ─────────────────────────────────────────── */}
        <header style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', marginBottom: 14 }}>
          <div>
            <h1 style={{ margin: 0, color: CSS_COLORS.accent.blue, fontSize: 28, fontWeight: 700, letterSpacing: 4, lineHeight: 1.1 }}>ATC AMAN</h1>
            <p style={{ margin: '2px 0 0', color: CSS_COLORS.text.muted, fontSize: 12 }}>
              {airportEntry ? `${airportEntry.airport.metadata.icao} — ${airportEntry.airport.metadata.name}` : 'No airports found'}
            </p>
            </div>
          <div style={{ color: CSS_COLORS.accent.amber, fontSize: 11, letterSpacing: 1.5, textTransform: 'uppercase', paddingBottom: 2 }}>
            {rankTitle(level)} · Level {level}
          </div>
        </header>

        {/* ── Briefing sheet: airport context | session setup ─────────── */}
        <main style={{ display: 'flex', gap: 20, flex: 1, minHeight: 0, alignItems: 'stretch' }}>

          {/* Left — the field you will control */}
          <section style={{ flex: '1.25 1 0', display: 'flex', flexDirection: 'column', minWidth: 0 }}>
            <div style={SECTION_LABEL}>Airport</div>
            {airports.length > 1 && (
              <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
                {airports.map((a) => {
                  const locked = level < airportUnlockLevel(a.id)
                  const active = selectedAirportId === a.id
                  return (
                    <button
                      key={a.id}
                      className="briefing-btn"
                      onClick={() => !locked && setAirport(a.id)}
                      disabled={locked}
                      title={locked ? `Unlocks at level ${airportUnlockLevel(a.id)}` : undefined}
                      style={segStyle(active, locked)}
                    >
                      {locked ? `${a.id} · L${airportUnlockLevel(a.id)}` : a.id}
                    </button>
                  )
                })}
              </div>
            )}
            {airportEntry && (
              <div style={{ background: CSS_COLORS.bg.surface, border: `1px solid ${BORDER}`, borderRadius: 4, overflow: 'hidden', display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
                <div style={{ flex: 1, minHeight: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 8 }}>
                  <AirportPreview airport={airportEntry.airport} height="100%" />
                </div>
                <div style={{
                  padding: '7px 12px',
                  fontSize: 11,
                  fontFamily: MONO,
                  color: CSS_COLORS.text.secondary,
                  display: 'flex',
                  justifyContent: 'space-between',
                  borderTop: `1px solid ${BORDER}`,
                  background: CSS_COLORS.bg.card,
                }}>
                  <span>RWY {Array.from(new Set(airportEntry.airport.runways.map(r => r.id))).join(' / ')}</span>
                  <span>{airportEntry.airport.gates.length} GATES</span>
                  <span>ELEV {airportEntry.airport.metadata.elevationFt} FT</span>
                </div>
              </div>
            )}
          </section>

          {/* Right — the session you are about to run */}
          <section style={{ flex: '1 1 0', display: 'flex', flexDirection: 'column', gap: 14, minWidth: 280 }}>
            <div>
              <div style={SECTION_LABEL}>Difficulty</div>
              <div style={{ display: 'flex', gap: 6 }}>
                {DIFF_ORDER.map((d) => {
                  const locked = !diffUnlocked(d)
                  const active = selected === d
                  return (
                    <button
                      key={d}
                      className="briefing-btn"
                      onClick={() => !locked && setSelected(d)}
                      disabled={locked}
                      title={locked ? `Unlocks at level ${DIFFICULTY_UNLOCK_LEVEL[d]}` : undefined}
                      style={segStyle(active, locked)}
                    >
                      {locked ? `${DIFF_LABELS[d]} · L${DIFFICULTY_UNLOCK_LEVEL[d]}` : DIFF_LABELS[d]}
                    </button>
                  )
                })}
              </div>
            </div>

            <div>
              <div style={SECTION_LABEL}>Your Stations</div>
              <div style={{ display: 'flex', gap: 6 }}>
                {STATION_ORDER.map((s) => {
                  const active = stations.includes(s)
                  return (
                    <button
                      key={s}
                      className="briefing-btn"
                      onClick={() => toggleStation(s)}
                      style={segStyle(active, false)}
                    >
                      {STATION_LABELS[s]}
                    </button>
                  )
                })}
              </div>
              <div style={HELPER}>Unselected stations are handled by the computer.</div>
            </div>

            <div>
              <div style={SECTION_LABEL}>Fleet</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 6 }}>
                {CLASS_ORDER.map((c) => {
                  const active = classes.includes(c)
                  return (
                    <button
                      key={c}
                      className="briefing-btn"
                      onClick={() => toggleClass(c)}
                      style={{
                        padding: '7px 4px',
                        background: active ? CSS_COLORS.bg.card : 'transparent',
                        color: active ? CSS_COLORS.text.primary : CSS_COLORS.text.muted,
                        border: active ? `1px solid ${CSS_COLORS.accent.blue}` : `1px solid ${BORDER}`,
                        borderRadius: 3,
                        cursor: 'pointer',
                        fontWeight: active ? 700 : 400,
                        fontSize: 11,
                        fontFamily: 'inherit',
                      }}
                    >
                      {active ? '✓ ' : ''}{CLASS_LABELS[c]}
                    </button>
                  )
                })}
              </div>
              <div style={HELPER}>Aircraft types that may spawn this session.</div>
            </div>

            {preset && (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
                <ParamCell label="Spawn interval" value={`${preset.spawnIntervalMs / 1000}s`} />
                <ParamCell label="Max traffic" value={`${preset.maxAircraft}`} />
                <ParamCell label="Wind" value={`${preset.windDirection}° / ${preset.windSpeed}kt`} />
                <ParamCell label="Duration" value={`${preset.sessionDurationMs / 60000} min`} />
              </div>
            )}
          </section>
        </main>

        {/* ── Actions ─────────────────────────────────────────────────── */}
        <footer style={{ marginTop: 14 }}>
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              autoFocus
              className="briefing-btn"
              onClick={handleStart}
              style={{
                flex: 1.4,
                padding: '12px 0',
                background: CSS_COLORS.accent.primary,
                color: CSS_COLORS.bg.primary,
                border: 'none',
                borderRadius: 3,
                cursor: 'pointer',
                fontWeight: 700,
                fontSize: 14,
                letterSpacing: 2,
                fontFamily: 'inherit',
              }}
            >
              START
            </button>
            <button
              className="briefing-btn"
              onClick={() => window.dispatchEvent(new CustomEvent('toggle-tutorial'))}
              style={{ padding: '12px 18px', background: FIELD_BG, color: CSS_COLORS.text.secondary, border: `1px solid ${BORDER}`, borderRadius: 3, cursor: 'pointer', fontWeight: 700, fontSize: 12, fontFamily: 'inherit' }}
            >
              TUTORIALS
            </button>
            <button
              className="briefing-btn"
              onClick={toggleMute}
              title={muted ? 'Enable audio' : 'Mute audio'}
              style={{ padding: '12px 18px', background: FIELD_BG, color: CSS_COLORS.text.secondary, border: `1px solid ${BORDER}`, borderRadius: 3, cursor: 'pointer', fontWeight: 700, fontSize: 12, fontFamily: 'inherit' }}
            >
              {muted ? 'UNMUTE' : 'MUTE'}
            </button>
            {window.electronAPI && (
              <button
                className="briefing-btn"
                onClick={() => window.electronAPI.send('app-quit', null)}
                style={{ padding: '12px 18px', background: FIELD_BG, color: CSS_COLORS.text.secondary, border: `1px solid ${BORDER}`, borderRadius: 3, cursor: 'pointer', fontWeight: 700, fontSize: 12, fontFamily: 'inherit' }}
              >
                QUIT
              </button>
            )}
          </div>
          <div style={{ marginTop: 10, fontSize: 10, color: CSS_COLORS.text.muted, textAlign: 'center', lineHeight: 1.6 }}>
            Click aircraft on radar → select commands → issue via buttons, or type commands in the input bar below
          </div>
        </footer>
      </div>
    </div>
  )
}
