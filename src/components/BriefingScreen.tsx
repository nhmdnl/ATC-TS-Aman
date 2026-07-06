import { useState } from 'react'
import { useGame } from '../state/GameContext'
import type { DifficultyLevel } from '../engine/types'
import { DIFFICULTY_PRESETS, CSS_COLORS } from '../engine/constants'

const DIFF_ORDER: DifficultyLevel[] = ['easy', 'medium', 'hard']

const DIFF_LABELS: Record<DifficultyLevel, string> = {
  easy: 'EASY',
  medium: 'MEDIUM',
  hard: 'HARD',
}

export default function BriefingScreen() {
  const { setDifficulty, startSession } = useGame()
  const [selected, setSelected] = useState<DifficultyLevel>('medium')

  const preset = DIFFICULTY_PRESETS[selected]

  const handleStart = () => {
    setDifficulty(selected)
    startSession()
  }

  return (
    <div style={{
      position: 'absolute',
      inset: 0,
      zIndex: 1000,
      background: 'rgba(15, 23, 42, 0.92)',
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
        <h1 style={{ margin: '0 0 4px', color: '#0EA5E9', fontSize: 22, fontWeight: 700 }}>ATC AMAN</h1>
        <p style={{ margin: '0 0 20px', color: CSS_COLORS.text.muted, fontSize: 12 }}>
          HHAS — Asmara International Airport
        </p>

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
        </div>

        <div style={{ marginTop: 16, fontSize: 10, color: CSS_COLORS.text.muted, textAlign: 'center', lineHeight: 1.6 }}>
          Click aircraft on radar → select commands → issue via buttons<br />
          or type commands in the input bar below
        </div>
      </div>
    </div>
  )
}
