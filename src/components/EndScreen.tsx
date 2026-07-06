import React from 'react'
import { useGame } from '../state/GameContext'
import { careerSystem } from '../engine/career-system'
import type { Grade, ScoreDimensions } from '../engine/types'

const GRADE_COLORS: Record<Grade, string> = {
  S: '#f59e0b',
  A: '#22c55e',
  B: '#0ea5e9',
  C: '#94a3b8',
  D: '#ef4444',
}

const DIMENSION_LABELS: Array<{ key: keyof ScoreDimensions; label: string }> = [
  { key: 'safety', label: 'Safety' },
  { key: 'efficiency', label: 'Efficiency' },
  { key: 'communication', label: 'Communication' },
  { key: 'procedure', label: 'Procedure' },
  { key: 'awareness', label: 'Awareness' },
]

function formatDuration(ms: number): string {
  const totalSec = Math.floor(ms / 1000)
  const min = Math.floor(totalSec / 60)
  const sec = totalSec % 60
  return `${min}:${sec.toString().padStart(2, '0')}`
}

export default function EndScreen() {
  const { state, resetGame } = useGame()

  if (!state.sessionEnded) return null

  const maxDim = Math.max(1, ...DIMENSION_LABELS.map(d => state.scoreDimensions[d.key]))
  const career = careerSystem.state

  return (
    <div style={{
      position: 'absolute',
      top: 0, left: 0, right: 0, bottom: 0,
      backgroundColor: 'rgba(15, 23, 42, 0.9)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 1000
    }}>
      <div className="panel-bg" style={{ padding: '32px 40px', textAlign: 'center', border: '1px solid #334155', borderRadius: 8, minWidth: 420 }}>
        <h1 style={{ color: '#0ea5e9', fontSize: 28, margin: '0 0 20px 0' }}>SESSION COMPLETE</h1>

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 24, marginBottom: 24 }}>
          <div style={{
            width: 84, height: 84, borderRadius: 8,
            border: `2px solid ${GRADE_COLORS[state.grade]}`,
            color: GRADE_COLORS[state.grade],
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 52, fontWeight: 700,
          }}>
            {state.grade}
          </div>
          <div style={{ textAlign: 'left' }}>
            <div style={{ fontSize: 22, color: '#e2e8f0' }}>
              Score: <span style={{ color: '#22c55e', fontWeight: 'bold' }}>{state.score}</span>
            </div>
            <div style={{ fontSize: 13, color: '#94a3b8', marginTop: 4 }}>
              Aircraft handled: {state.aircraftHandled}
            </div>
            <div style={{ fontSize: 13, color: '#94a3b8' }}>
              Duration: {formatDuration(state.elapsedMs)}
            </div>
          </div>
        </div>

        <div style={{ textAlign: 'left', marginBottom: 24 }}>
          {DIMENSION_LABELS.map(({ key, label }) => {
            const value = state.scoreDimensions[key]
            const pct = Math.round((value / maxDim) * 100)
            return (
              <div key={key} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6, fontSize: 12 }}>
                <span style={{ width: 110, color: '#94a3b8' }}>{label}</span>
                <div style={{ flex: 1, height: 8, background: '#1e293b', borderRadius: 4, overflow: 'hidden' }}>
                  <div style={{ width: `${pct}%`, height: '100%', background: '#0ea5e9', borderRadius: 4 }} />
                </div>
                <span style={{ width: 36, textAlign: 'right', color: '#e2e8f0' }}>{value}</span>
              </div>
            )
          })}
        </div>

        <div style={{
          display: 'flex', justifyContent: 'space-between', gap: 12,
          background: '#1e293b', borderRadius: 6, padding: '10px 16px',
          marginBottom: 24, fontSize: 12, color: '#94a3b8',
        }}>
          <span>Level <span style={{ color: '#e2e8f0' }}>{career.level}</span></span>
          <span>XP <span style={{ color: '#e2e8f0' }}>{career.xp}</span></span>
          <span>Best <span style={{ color: '#e2e8f0' }}>{career.bestGrade ?? '—'}</span></span>
          <span>High score <span style={{ color: '#e2e8f0' }}>{career.highScore}</span></span>
          <span>Sessions <span style={{ color: '#e2e8f0' }}>{career.sessionsPlayed}</span></span>
        </div>

        <button
          onClick={resetGame}
          style={{
            background: '#0ea5e9',
            color: 'white',
            border: 'none',
            padding: '12px 24px',
            fontSize: 16,
            fontWeight: 'bold',
            borderRadius: 4,
            cursor: 'pointer',
            fontFamily: 'inherit',
          }}
        >
          PLAY AGAIN
        </button>
      </div>
    </div>
  )
}
