import React, { useEffect } from 'react'
import { TUTORIAL_TOPICS } from '../data/tutorialContent'
import type { TutorialGroup } from '../data/tutorialContent'

const GROUP_LABELS: Record<TutorialGroup, string> = {
  'getting-started': 'GETTING STARTED',
  'atc-knowledge': 'ATC KNOWLEDGE',
  'role': 'ROLE TUTORIALS',
}

const GROUP_ORDER: TutorialGroup[] = ['getting-started', 'atc-knowledge', 'role']

interface TutorialMenuProps {
  open: boolean
  onSelect: (topicId: string) => void
  onClose: () => void
}

export default function TutorialMenu({ open, onSelect, onClose }: TutorialMenuProps) {
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null

  return (
    <div style={{
      position: 'fixed',
      inset: 0,
      zIndex: 1500,
      background: 'rgba(8, 12, 20, 0.72)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
    }}>
      <div style={{
        background: '#161B22',
        border: '1px solid #334155',
        borderRadius: 6,
        padding: '20px 24px',
        width: 420,
        maxHeight: '80vh',
        overflowY: 'auto',
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <span style={{ color: '#0ea5e9', fontWeight: 700, fontSize: 14, letterSpacing: 1 }}>TUTORIALS</span>
          <button
            onClick={onClose}
            style={{ background: 'none', border: 'none', color: '#64748b', fontSize: 12, cursor: 'pointer', padding: 0 }}
          >
            Close (Esc)
          </button>
        </div>

        {GROUP_ORDER.map(group => {
          const topics = TUTORIAL_TOPICS.filter(t => t.group === group)
          if (topics.length === 0) return null
          return (
            <div key={group} style={{ marginBottom: 16 }}>
              <div style={{ color: '#64748b', fontSize: 10, letterSpacing: 1, marginBottom: 6 }}>
                {GROUP_LABELS[group]}
              </div>
              {topics.map(topic => (
                <button
                  key={topic.id}
                  onClick={() => onSelect(topic.id)}
                  style={{
                    display: 'block',
                    width: '100%',
                    textAlign: 'left',
                    background: '#1e293b',
                    border: '1px solid #334155',
                    borderRadius: 4,
                    padding: '10px 12px',
                    marginBottom: 6,
                    cursor: 'pointer',
                    fontFamily: 'inherit',
                  }}
                >
                  <div style={{ color: '#e2e8f0', fontSize: 12, fontWeight: 700, marginBottom: 2 }}>{topic.title}</div>
                  <div style={{ color: '#94a3b8', fontSize: 10 }}>{topic.menuDescription}</div>
                </button>
              ))}
            </div>
          )
        })}
      </div>
    </div>
  )
}
