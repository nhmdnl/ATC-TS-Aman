import React from 'react'
import { useGame } from '../state/GameContext'
import { useToggleEvent } from '../state/useToggleEvent'
import { missionSystem } from '../engine/mission-system'
import { AircraftPhase } from '../engine/types'
import type { Grade, ScoreDimensions } from '../engine/types'

const GRADE_COLORS: Record<Grade, string> = {
  S: '#f59e0b',
  A: '#22c55e',
  B: '#0ea5e9',
  C: '#94a3b8',
  D: '#ef4444',
}

const DIMENSION_LABELS: Array<{ key: keyof ScoreDimensions; label: string }> = [
  { key: 'safety', label: 'SAF' },
  { key: 'efficiency', label: 'EFF' },
  { key: 'communication', label: 'COM' },
  { key: 'procedure', label: 'PRO' },
  { key: 'awareness', label: 'AWR' },
]

const AIRBORNE_PHASES = [AircraftPhase.CLIMBING, AircraftPhase.ENTERING, AircraftPhase.APPROACH, AircraftPhase.FINAL]

export default function MissionTracker() {
  const { state } = useGame()
  const [open, setOpen] = useToggleEvent('toggle-mission-tracker')

  if (!open) return null

  const m = Math.floor(state.elapsedMs / 60000)
  const s = Math.floor((state.elapsedMs % 60000) / 1000)
  const timeStr = `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`

  const airborne = Array.from(state.aircraft.values()).filter(a => AIRBORNE_PHASES.includes(a.phase)).length
  const ground = state.aircraft.size - airborne
  const maxDim = Math.max(1, ...DIMENSION_LABELS.map(d => state.scoreDimensions[d.key]))
  const mission = missionSystem.getActiveMission()
  const recentComms = state.radioMessages.slice(-3)

  return (
    <div style={{
      position: 'absolute',
      top: 8,
      right: 8,
      width: 240,
      background: 'rgba(22, 27, 34, 0.95)',
      border: '1px solid #334155',
      borderRadius: 6,
      padding: 10,
      zIndex: 50,
      fontSize: 10,
      color: '#94a3b8',
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
        <span style={{ fontSize: 10, letterSpacing: 1, color: '#0ea5e9', fontWeight: 700 }}>MISSION TRACKER</span>
        <button
          onClick={() => setOpen(false)}
          style={{ background: 'none', border: 'none', color: '#64748b', cursor: 'pointer', fontSize: 12, padding: 0, lineHeight: 1 }}
          aria-label="Close mission tracker"
        >
          ✕
        </button>
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8, fontFamily: 'SF Mono, Consolas, monospace' }}>
        <span>
          SCORE <span style={{ color: '#e2e8f0' }}>{state.score}</span>{' '}
          <span style={{ color: GRADE_COLORS[state.grade], fontWeight: 700 }}>{state.grade}</span>
        </span>
        <span>T+<span style={{ color: '#e2e8f0' }}>{timeStr}</span></span>
        <span>
          <span style={{ color: '#22c55e' }}>A{airborne}</span> <span style={{ color: '#eab308' }}>G{ground}</span>
        </span>
      </div>

      <div style={{ marginBottom: 8 }}>
        {DIMENSION_LABELS.map(({ key, label }) => {
          const value = state.scoreDimensions[key]
          const pct = Math.round((value / maxDim) * 100)
          return (
            <div key={key} style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3 }}>
              <span style={{ width: 26 }}>{label}</span>
              <div style={{ flex: 1, height: 5, background: '#1e293b', borderRadius: 2, overflow: 'hidden' }}>
                <div style={{ width: `${pct}%`, height: '100%', background: '#0ea5e9' }} />
              </div>
              <span style={{ width: 28, textAlign: 'right', color: '#e2e8f0', fontFamily: 'SF Mono, Consolas, monospace' }}>{value}</span>
            </div>
          )
        })}
      </div>

      {mission && (
        <div style={{ marginBottom: 8 }}>
          <div style={{ color: '#fbbf24', marginBottom: 3, fontWeight: 600 }}>◆ {mission.name}</div>
          {mission.objectives.map(obj => (
            <div key={obj.id} style={{ display: 'flex', gap: 5, marginBottom: 2 }}>
              <span style={{ color: obj.completed ? '#22c55e' : '#475569' }}>{obj.completed ? '✓' : '○'}</span>
              <span style={{ color: obj.completed ? '#64748b' : '#cbd5e1', textDecoration: obj.completed ? 'line-through' : 'none' }}>
                {obj.description}
              </span>
            </div>
          ))}
        </div>
      )}

      {recentComms.length > 0 && (
        <div style={{ borderTop: '1px solid #1e293b', paddingTop: 6 }}>
          {recentComms.map((msg, i) => (
            <div key={`${msg.timestamp}-${i}`} style={{ marginBottom: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              <span style={{ color: msg.speaker === 'ATC' ? '#39D98A' : '#5CBFFF' }}>{msg.speaker}</span>{' '}
              <span style={{ color: '#94a3b8' }}>{msg.message}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
