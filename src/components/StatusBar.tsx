import React from 'react'
import { useGame } from '../state/GameContext'
import { AircraftPhase, ControllerStation } from '../engine/types'

const STATION_ORDER: ControllerStation[] = [ControllerStation.GROUND, ControllerStation.TOWER, ControllerStation.APPROACH]
const STATION_SHORT_LABELS: Record<ControllerStation, string> = {
  [ControllerStation.GROUND]: 'GND',
  [ControllerStation.TOWER]: 'TWR',
  [ControllerStation.APPROACH]: 'APP',
  [ControllerStation.AREA]: 'AREA',
}

export default function StatusBar({ ttsAvailable }: { ttsAvailable: boolean }) {
  const { state, togglePause } = useGame()

  const h = Math.floor(state.elapsedMs / 3600000)
  const m = Math.floor((state.elapsedMs % 3600000) / 60000)
  const s = Math.floor((state.elapsedMs % 60000) / 1000)
  const timeStr = `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`

  const airborneCount = Array.from(state.aircraft.values()).filter(a => [AircraftPhase.CLIMBING, AircraftPhase.ENTERING, AircraftPhase.APPROACH, AircraftPhase.FINAL].includes(a.phase)).length
  const groundCount = state.aircraft.size - airborneCount

  return (
    <div className="panel-bg" style={{ height: '100%', display: 'flex', alignItems: 'center', padding: '0 16px', justifyContent: 'space-between' }}>
      
      <div style={{ display: 'flex', gap: 24, alignItems: 'baseline' }}>
        <div style={{ color: '#0ea5e9', fontWeight: 700, fontSize: 14 }}>ASM-TWR</div>
        
        <div style={{ display: 'flex', gap: 12, fontSize: 11 }}>
          <div style={{ color: '#94A3B8' }}>TIME: <span style={{ color: '#E2E8F0', fontFamily: 'SF Mono, monospace' }}>{timeStr}</span></div>
          <div style={{ color: '#94A3B8' }}>SCORE: <span style={{ color: '#E2E8F0', fontFamily: 'SF Mono, monospace' }}>{state.score}</span></div>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 12, fontSize: 11, alignItems: 'center' }}>
        <div style={{ display: 'flex', gap: 4 }}>
          <span style={{ color: '#22c55e' }}>AIR: {airborneCount}</span>
          <span style={{ color: '#64748B' }}>|</span>
          <span style={{ color: '#eab308' }}>GND: {groundCount}</span>
          <span style={{ color: '#64748B' }}>|</span>
          <span style={{ color: '#94a3b8', fontFamily: 'SF Mono, monospace' }}>
            WND {Math.round(state.wind.direction).toString().padStart(3, '0')}°/{Math.round(state.wind.speed).toString().padStart(2, '0')}KT
            {state.wind.visibilityNM !== undefined && ` VIS ${state.wind.visibilityNM}NM`}
            {' '}<span style={{ color: state.conditions === 'IMC' ? '#ef4444' : '#22c55e', fontWeight: 700 }}>{state.conditions}</span>
          </span>
        </div>

        {!ttsAvailable && (
          <span style={{ color: '#94A3B8' }}>TTS: CAPTIONS ONLY</span>
        )}

        <div style={{ display: 'flex', gap: 6, color: '#64748B' }}>
          {STATION_ORDER.map((s) => (
            <span key={s}>
              {STATION_SHORT_LABELS[s]}:{' '}
              <span style={{ color: state.playerStations.includes(s) ? '#22c55e' : '#eab308' }}>
                {state.playerStations.includes(s) ? 'YOU' : 'AI'}
              </span>
            </span>
          ))}
        </div>

        <button
          onClick={togglePause}
          style={{
            // Amber (not red) for paused — red is reserved for violations/alerts.
            background: state.paused ? '#f59e0b' : '#1e293b',
            border: '1px solid #334155',
            color: state.paused ? '#0b1220' : '#e2e8f0',
            padding: '2px 8px',
            borderRadius: 4,
            fontSize: 10,
            fontWeight: state.paused ? 700 : 400,
            cursor: 'pointer'
          }}
        >
          {state.paused ? 'RESUME' : 'PAUSE'}
        </button>
      </div>
      
    </div>
  )
}
