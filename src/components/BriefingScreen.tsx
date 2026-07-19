import React, { useState } from 'react'
import { useGame } from '../state/GameContext'
import type { DifficultyLevel } from '../engine/types'
import { ControllerStation } from '../engine/types'
import { DIFFICULTY_PRESETS, CSS_COLORS } from '../engine/constants'
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
  [ControllerStation.AREA]: 'AREA', // never shown — not a player-selectable station
}

const SECONDARY_BUTTON: React.CSSProperties = {
  padding: '10px 16px',
  background: '#1D2430',
  color: '#E2E8F0',
  border: '1px solid #334155',
  borderRadius: 4,
  cursor: 'pointer',
  fontWeight: 700,
  fontSize: 14,
  fontFamily: 'inherit',
}

export default function BriefingScreen() {
  const { setDifficulty, setPlayerStations, startSession, muted, toggleMute, airports, selectedAirportId, setAirport } = useGame()
  const [selected, setSelected] = useState<DifficultyLevel>('medium')
  const [stations, setStations] = useState<ControllerStation[]>(STATION_ORDER)

  const preset = DIFFICULTY_PRESETS[selected]
  const airportEntry = airports.find(a => a.id === selectedAirportId) ?? airports[0]

  const toggleStation = (station: ControllerStation) => {
    setStations(prev => {
      if (prev.includes(station)) {
        if (prev.length === 1) return prev // at least one must stay selected
        return prev.filter(s => s !== station)
      }
      return [...prev, station]
    })
  }

  const handleStart = () => {
    setDifficulty(selected)
    setPlayerStations(stations)
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
      alignItems: 'center',
      justifyContent: 'center',
    }}>
      <div style={{
        background: CSS_COLORS.bg.surface,
        border: '1px solid #1D2430',
        borderRadius: 8,
        padding: 32,
        maxWidth: 420,
        width: '90%',
      }}>
        <h1 style={{ margin: '0 0 4px', color: '#0EA5E9', fontSize: 32, fontWeight: 700, letterSpacing: 3, textAlign: 'center' }}>ATC AMAN</h1>
        <p style={{ margin: '0 0 24px', color: CSS_COLORS.text.muted, fontSize: 12, textAlign: 'center' }}>
          {airportEntry ? `${airportEntry.airport.metadata.icao} — ${airportEntry.airport.metadata.name}` : 'No airports found'}
        </p>

        <div style={{ marginBottom: 20 }}>
          <div style={{ color: CSS_COLORS.text.secondary, fontSize: 10, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 }}>
            Airport
          </div>
          {airports.length > 1 && (
            <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
              {airports.map((a) => (
                <button
                  key={a.id}
                  onClick={() => setAirport(a.id)}
                  style={{
                    flex: 1,
                    padding: '8px 0',
                    background: selectedAirportId === a.id ? '#0EA5E9' : '#1D2430',
                    color: selectedAirportId === a.id ? '#FFF' : CSS_COLORS.text.secondary,
                    border: selectedAirportId === a.id ? '1px solid #0EA5E9' : '1px solid #1E293B',
                    borderRadius: 4,
                    cursor: 'pointer',
                    fontWeight: selectedAirportId === a.id ? 700 : 400,
                    fontSize: 12,
                    fontFamily: 'inherit',
                    transition: 'all 0.1s',
                  }}
                >
                  {a.id}
                </button>
              ))}
            </div>
          )}
          {airportEntry && (
            <div style={{ background: '#0B1017', border: '1px solid #1E293B', borderRadius: 4, overflow: 'hidden' }}>
              <AirportPreview airport={airportEntry.airport} />
              <div style={{ padding: '6px 10px', fontSize: 10, color: CSS_COLORS.text.muted, display: 'flex', justifyContent: 'space-between' }}>
                <span>RWY {Array.from(new Set(airportEntry.airport.runways.map(r => r.id))).join(' / ')}</span>
                <span>{airportEntry.airport.gates.length} gates</span>
                <span>ELEV {airportEntry.airport.metadata.elevationFt} ft</span>
              </div>
            </div>
          )}
        </div>

        <div style={{ marginBottom: 20 }}>
          <div style={{ color: CSS_COLORS.text.secondary, fontSize: 10, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 }}>
            Difficulty
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            {DIFF_ORDER.map((d) => (
              <button
                key={d}
                onClick={() => setSelected(d)}
                style={{
                  flex: 1,
                  padding: '8px 0',
                  background: selected === d ? '#0EA5E9' : '#1D2430',
                  color: selected === d ? '#FFF' : CSS_COLORS.text.secondary,
                  border: selected === d ? '1px solid #0EA5E9' : '1px solid #1E293B',
                  borderRadius: 4,
                  cursor: 'pointer',
                  fontWeight: selected === d ? 700 : 400,
                  fontSize: 12,
                  fontFamily: 'inherit',
                  transition: 'all 0.1s',
                }}
              >
                {DIFF_LABELS[d]}
              </button>
            ))}
          </div>
        </div>

        <div style={{ marginBottom: 20 }}>
          <div style={{ color: CSS_COLORS.text.secondary, fontSize: 10, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 }}>
            Your Stations
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            {STATION_ORDER.map((s) => {
              const active = stations.includes(s)
              return (
                <button
                  key={s}
                  onClick={() => toggleStation(s)}
                  style={{
                    flex: 1,
                    padding: '8px 0',
                    background: active ? '#0EA5E9' : '#1D2430',
                    color: active ? '#FFF' : CSS_COLORS.text.secondary,
                    border: active ? '1px solid #0EA5E9' : '1px solid #1E293B',
                    borderRadius: 4,
                    cursor: 'pointer',
                    fontWeight: active ? 700 : 400,
                    fontSize: 12,
                    fontFamily: 'inherit',
                    transition: 'all 0.1s',
                  }}
                >
                  {STATION_LABELS[s]}
                </button>
              )
            })}
          </div>
          <div style={{ marginTop: 6, fontSize: 10, color: CSS_COLORS.text.muted }}>
            Unselected stations are handled automatically.
          </div>
        </div>

        {preset && (
          <div style={{
            background: '#1D2430',
            borderRadius: 4,
            padding: 12,
            marginBottom: 20,
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            gap: '4px 12px',
            fontSize: 11,
            color: CSS_COLORS.text.secondary,
          }}>
            <span>Spawn interval: <span style={{ color: CSS_COLORS.text.primary }}>{preset.spawnIntervalMs / 1000}s</span></span>
            <span>Max traffic: <span style={{ color: CSS_COLORS.text.primary }}>{preset.maxAircraft}</span></span>
            <span>Wind: <span style={{ color: CSS_COLORS.text.primary }}>{preset.windDirection}° / {preset.windSpeed}kt</span></span>
            <span>Duration: <span style={{ color: CSS_COLORS.text.primary }}>{preset.sessionDurationMs / 60000}min</span></span>
          </div>
        )}

        <div style={{ display: 'flex', gap: 8 }}>
          <button
            onClick={handleStart}
            style={{
              flex: 1,
              padding: '10px 0',
              background: '#22C55E',
              color: '#FFF',
              border: 'none',
              borderRadius: 4,
              cursor: 'pointer',
              fontWeight: 700,
              fontSize: 14,
              fontFamily: 'inherit',
            }}
          >
            START
          </button>
          <button
            onClick={() => window.dispatchEvent(new CustomEvent('toggle-tutorial'))}
            style={SECONDARY_BUTTON}
          >
            TUTORIALS
          </button>
        </div>

        <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
          <button onClick={toggleMute} style={{ ...SECONDARY_BUTTON, flex: 1, fontSize: 12 }}>
            SOUND: {muted ? 'OFF' : 'ON'}
          </button>
          {window.electronAPI && (
            <button
              onClick={() => window.electronAPI.send('app-quit', null)}
              style={{ ...SECONDARY_BUTTON, flex: 1, fontSize: 12 }}
            >
              QUIT
            </button>
          )}
        </div>

        <div style={{ marginTop: 16, fontSize: 10, color: CSS_COLORS.text.muted, textAlign: 'center', lineHeight: 1.6 }}>
          Click aircraft on radar → select commands → issue via buttons<br />
          or type commands in the input bar below
        </div>
      </div>
    </div>
  )
}
