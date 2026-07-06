import React, { useEffect, useLayoutEffect, useState } from 'react'
import { useToggleEvent } from '../state/useToggleEvent'

interface TutorialStep {
  readonly title: string
  readonly body: string
  readonly selector: string | null   // null = centered welcome/finish card
}

const STEPS: ReadonlyArray<TutorialStep> = [
  {
    title: 'WELCOME TO ASMARA TOWER',
    body: 'You are the air traffic controller for Asmara International (HHAS). Guide departures from gate to the sky and arrivals from the sector boundary down to their gate — safely and efficiently. This tour shows you the console.',
    selector: null,
  },
  {
    title: 'STATUS BAR',
    body: 'Session time, your score, and the current traffic count (AIR airborne / GND on the ground). The PAUSE button — or Space — freezes the simulation.',
    selector: '#status-bar-container',
  },
  {
    title: 'FLIGHT STRIPS',
    body: 'Every aircraft under your control gets a strip: departures on top, arrivals below. Each shows callsign, type, phase, and altitude/speed. Click a strip to select that aircraft.',
    selector: '#flight-strips-container',
  },
  {
    title: 'RADAR SCOPE',
    body: 'Click a blip to select an aircraft. Drag to pan, scroll to zoom (or + / - / 0 keys). Press R and drag to measure distance and bearing. Keep airborne traffic separated by 3 NM or 1,000 ft — violations flash red.',
    selector: '#radar-container',
  },
  {
    title: 'COMMAND PANEL',
    body: 'With an aircraft selected, issue clearances from here. The GND / TWR / APP tabs mirror the three controller positions — an aircraft only accepts commands from the frequency it is on. Hand aircraft between positions with the CONTACT buttons.',
    selector: '#commands-container',
  },
  {
    title: 'COMMAND INPUT',
    body: 'Prefer typing? Enter commands like "DAL123 DESCEND 90" here. Press / to focus it from anywhere; auto-complete suggests callsigns and verbs as you type.',
    selector: '#command-input-container',
  },
  {
    title: 'RADIO LOG',
    body: 'The party line. Your transmissions, pilot readbacks, and system warnings appear here. Pilots take a moment to read back and comply — just like the real thing.',
    selector: '#radio-log-container',
  },
  {
    title: 'YOU HAVE THE POSITION',
    body: 'Press G for the full controller guide, O for the mission tracker, and T to reopen this tour. Good luck — Asmara Tower is yours.',
    selector: null,
  },
]

interface Rect { top: number; left: number; width: number; height: number }

export default function TutorialOverlay() {
  const [open, setOpen] = useToggleEvent('toggle-tutorial')
  const [stepIdx, setStepIdx] = useState(0)
  const [rect, setRect] = useState<Rect | null>(null)

  const step = STEPS[stepIdx]

  // Track the highlighted element's rect (recomputed per step and on resize)
  useLayoutEffect(() => {
    if (!open) return
    const measure = () => {
      if (!step.selector) { setRect(null); return }
      const el = document.querySelector(step.selector)
      if (!el) { setRect(null); return }
      const r = el.getBoundingClientRect()
      setRect({ top: r.top, left: r.left, width: r.width, height: r.height })
    }
    measure()
    window.addEventListener('resize', measure)
    return () => window.removeEventListener('resize', measure)
  }, [open, step.selector])

  // Reset to the first step each time the tutorial opens; Esc closes
  useEffect(() => {
    if (!open) return
    setStepIdx(0)
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
      if (e.key === 'ArrowRight') setStepIdx(i => Math.min(i + 1, STEPS.length - 1))
      if (e.key === 'ArrowLeft') setStepIdx(i => Math.max(i - 1, 0))
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, setOpen])

  if (!open) return null

  const isLast = stepIdx === STEPS.length - 1

  // Tooltip placement: below the spotlight if there is room, otherwise above;
  // centered cards for selector-less steps.
  const CARD_W = 380
  const CARD_H_EST = 170
  let cardStyle: React.CSSProperties
  if (rect) {
    const below = rect.top + rect.height + CARD_H_EST + 16 < window.innerHeight
    const top = below ? rect.top + rect.height + 12 : Math.max(8, rect.top - CARD_H_EST - 12)
    const left = Math.min(Math.max(8, rect.left + rect.width / 2 - CARD_W / 2), window.innerWidth - CARD_W - 8)
    cardStyle = { position: 'fixed', top, left, width: CARD_W }
  } else {
    cardStyle = { position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', width: CARD_W }
  }

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 200 }}>
      {rect ? (
        <div style={{
          position: 'fixed',
          top: rect.top - 3,
          left: rect.left - 3,
          width: rect.width + 6,
          height: rect.height + 6,
          border: '2px solid #0ea5e9',
          borderRadius: 4,
          boxShadow: '0 0 0 9999px rgba(8, 12, 20, 0.72)',
          pointerEvents: 'none',
        }} />
      ) : (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(8, 12, 20, 0.72)' }} />
      )}

      <div style={{
        ...cardStyle,
        background: '#161B22',
        border: '1px solid #334155',
        borderRadius: 6,
        padding: '14px 16px',
        color: '#94a3b8',
        fontSize: 11,
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
          <span style={{ color: '#0ea5e9', fontWeight: 700, fontSize: 11, letterSpacing: 1 }}>{step.title}</span>
          <span style={{ color: '#475569', fontSize: 9 }}>{stepIdx + 1} / {STEPS.length}</span>
        </div>

        <div style={{ lineHeight: 1.6, marginBottom: 12 }}>{step.body}</div>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <button
            onClick={() => setOpen(false)}
            style={{ background: 'none', border: 'none', color: '#64748b', fontSize: 10, cursor: 'pointer', padding: 0 }}
          >
            Skip (Esc)
          </button>
          <div style={{ display: 'flex', gap: 8 }}>
            {stepIdx > 0 && (
              <button
                onClick={() => setStepIdx(i => i - 1)}
                style={{ background: '#1e293b', border: '1px solid #334155', color: '#e2e8f0', fontSize: 10, padding: '5px 12px', borderRadius: 4, cursor: 'pointer' }}
              >
                BACK
              </button>
            )}
            <button
              onClick={() => isLast ? setOpen(false) : setStepIdx(i => i + 1)}
              style={{ background: '#0ea5e9', border: 'none', color: '#0f172a', fontWeight: 700, fontSize: 10, padding: '5px 14px', borderRadius: 4, cursor: 'pointer' }}
            >
              {isLast ? 'FINISH' : 'NEXT'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
