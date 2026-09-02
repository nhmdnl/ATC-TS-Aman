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
  const { state, togglePause, setSimRate } = useGame()

  const h = Math.floor(state.elapsedMs / 3600000)
  const m = Math.floor((state.elapsedMs % 3600000) / 60000)
  const s = Math.floor((state.elapsedMs % 60000) / 1000)
  const timeStr = `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')} Z`

  const airborneCount = Array.from(state.aircraft.values()).filter(a => [AircraftPhase.CLIMBING, AircraftPhase.ENTERING, AircraftPhase.APPROACH, AircraftPhase.FINAL].includes(a.phase)).length
  const groundCount = state.aircraft.size - airborneCount

  return (
    <div style={{
      height: '100%',
      display: 'flex',
      alignItems: 'center',
      padding: '0 12px',
      justifyContent: 'space-between',
      background: '#020408',
      borderBottom: '1px solid #162338',
      fontFamily: "'SF Mono', 'Cascadia Code', 'Fira Code', monospace",
    }}>
      
      <div style={{ display: 'flex', gap: 20, alignItems: 'center' }}>
        <div style={{ color: '#00E5FF', fontWeight: 800, fontSize: 13, letterSpacing: 1 }}>
          SDA · HHAS TWR
        </div>
        
        <div style={{ display: 'flex', gap: 16, fontSize: 11 }}>
          <div style={{ color: '#64748B' }}>UTC <span style={{ color: '#00FF66', fontWeight: 700 }}>{timeStr}</span></div>
          <div style={{ color: '#64748B' }}>QNH <span style={{ color: '#F8FAFC' }}>1013 hPa</span></div>
          <div style={{ color: '#64748B' }}>SCORE <span style={{ color: '#FFD600', fontWeight: 700 }}>{state.score}</span></div>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 14, fontSize: 11, alignItems: 'center' }}>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          <span style={{ color: '#00E5FF', fontWeight: 700 }}>AIR: {airborneCount}</span>
          <span style={{ color: '#334155' }}>|</span>
          <span style={{ color: '#00FF66', fontWeight: 700 }}>GND: {groundCount}</span>
          <span style={{ color: '#334155' }}>|</span>
          <span style={{ color: '#94A3B8' }}>
            WND {Math.round(state.wind.direction).toString().padStart(3, '0')}°/{Math.round(state.wind.speed).toString().padStart(2, '0')}KT
            {state.wind.visibilityNM !== undefined && ` VIS ${state.wind.visibilityNM}NM`}
            {' '}<span style={{ color: state.conditions === 'IMC' ? '#FF1744' : '#00FF66', fontWeight: 700 }}>{state.conditions}</span>
          </span>
        </div>

        {!ttsAvailable && (
          <span style={{ color: '#64748B', fontSize: 10 }}>TTS: CAPTIONS</span>
        )}

        <div style={{ display: 'flex', gap: 8, color: '#64748B', fontSize: 10 }}>
          {STATION_ORDER.map((s) => (
            <span key={s}>
              {STATION_SHORT_LABELS[s]}:{' '}
              <span style={{ color: state.playerStations.includes(s) ? '#00FF66' : '#FFD600', fontWeight: 700 }}>
                {state.playerStations.includes(s) ? 'YOU' : 'AI'}
              </span>
            </span>
          ))}
        </div>

        <span
          onClick={() => window.dispatchEvent(new CustomEvent('toggle-guide-panel'))}
          title="Keyboard shortcuts — G guide · O missions · T tutorial · M mute"
          style={{ color: '#475569', fontSize: 10, letterSpacing: 1, cursor: 'pointer' }}
        >
          G·O·T·M
        </span>

        <div style={{ display: 'flex', gap: 2, alignItems: 'center' }}>
          {[1, 2, 4].map((rate) => (
            <button
              key={rate}
              onClick={() => setSimRate(rate)}
              title={`Sim rate ${rate}× — keys 1/2/3`}
              style={{
                background: state.simRate === rate ? '#00FF66' : '#121824',
                border: '1px solid #1E293B',
                color: state.simRate === rate ? '#020408' : '#64748B',
                padding: '2px 7px',
                borderRadius: 3,
                fontSize: 10,
                fontWeight: 700,
                fontFamily: 'inherit',
                cursor: 'pointer',
              }}
            >
              {rate}×
            </button>
          ))}
        </div>

        <button
          onClick={togglePause}
          style={{
            background: state.paused ? '#FFD600' : '#121824',
            border: '1px solid #1E293B',
            color: state.paused ? '#020408' : '#F8FAFC',
            padding: '2px 10px',
            borderRadius: 3,
            fontSize: 10,
            fontWeight: 700,
            cursor: 'pointer',
            letterSpacing: 0.5,
          }}
        >
          {state.paused ? 'RESUME' : 'PAUSE'}
        </button>
      </div>
      
    </div>
  )
}

