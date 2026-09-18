import { useEffect, useState } from 'react'
import { achievementSystem } from '../engine/achievement-system'
import { COMMENDATIONS, CSS_COLORS } from '../engine/constants'
import type { CommendationId } from '../engine/constants'

const MONO = "ui-monospace, 'Cascadia Mono', Consolas, Menlo, monospace"

export function CommendationList(): React.ReactElement {
  return (
    <div>
      {COMMENDATIONS.map((c) => {
        const unlocked = achievementSystem.isUnlocked(c.id)
        return (
          <div
            key={c.id}
            style={{
              display: 'flex',
              gap: 8,
              alignItems: 'baseline',
              marginBottom: 4,
              opacity: unlocked ? 1 : 0.45,
              fontFamily: MONO,
              fontSize: 11,
            }}
          >
            <span style={{ color: unlocked ? CSS_COLORS.accent.amber : CSS_COLORS.text.muted, width: 10 }}>
              {unlocked ? '●' : '○'}
            </span>
            <span style={{ color: CSS_COLORS.text.primary, fontWeight: 700, minWidth: 130 }}>
              {c.title}
            </span>
            <span style={{ color: CSS_COLORS.text.secondary }}>{c.description}</span>
          </div>
        )
      })}
    </div>
  )
}

export function CommendationToast(): React.ReactElement | null {
  const [id, setId] = useState<CommendationId | null>(null)

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined
    const unsub = achievementSystem.onUnlock((next) => {
      setId(next)
      if (timer) clearTimeout(timer)
      timer = setTimeout(() => setId(null), 4000)
    })
    return () => {
      unsub()
      if (timer) clearTimeout(timer)
    }
  }, [])

  if (!id) return null
  const def = COMMENDATIONS.find(c => c.id === id)
  if (!def) return null

  return (
    <div
      style={{
        position: 'absolute',
        top: 48,
        right: 16,
        zIndex: 1100,
        background: CSS_COLORS.bg.card,
        border: `1px solid ${CSS_COLORS.accent.amber}`,
        padding: '10px 14px',
        minWidth: 240,
        pointerEvents: 'none',
      }}
    >
      <div style={{ fontSize: 9, letterSpacing: 1.5, color: CSS_COLORS.accent.amber, textTransform: 'uppercase' }}>
        Commendation
      </div>
      <div style={{ fontSize: 14, fontWeight: 700, color: CSS_COLORS.text.primary, marginTop: 2 }}>
        {def.title}
      </div>
      <div style={{ fontSize: 11, color: CSS_COLORS.text.secondary, marginTop: 2 }}>
        {def.description}
      </div>
    </div>
  )
}
