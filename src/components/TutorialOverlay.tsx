import React, { useEffect, useLayoutEffect, useState } from 'react'
import { TUTORIAL_TOPICS } from '../data/tutorialContent'
import type { TutorialDemoAircraft } from '../data/tutorialContent'

interface Rect { top: number; left: number; width: number; height: number }

interface TutorialOverlayProps {
  topicId: string | null
  onBack: () => void
}

export default function TutorialOverlay({ topicId, onBack }: TutorialOverlayProps) {
  const [stepIdx, setStepIdx] = useState(0)
  const [rect, setRect] = useState<Rect | null>(null)

  const topic = topicId ? TUTORIAL_TOPICS.find(t => t.id === topicId) ?? null : null
  const step = topic ? topic.steps[stepIdx] : null

  // Track the highlighted element's rect (recomputed per step and on resize)
  useLayoutEffect(() => {
    if (!step) return
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
  }, [step])

  // Reset to the first step whenever a new topic opens
  useEffect(() => {
    if (topicId) setStepIdx(0)
  }, [topicId])

  // Esc/arrow navigation. Esc steps back to the topic menu — it never fully
  // closes from inside a topic (App.tsx's T-key handler is what fully closes).
  useEffect(() => {
    if (!topic) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onBack()
      if (e.key === 'ArrowRight') setStepIdx(i => Math.min(i + 1, topic.steps.length - 1))
      if (e.key === 'ArrowLeft') setStepIdx(i => Math.max(i - 1, 0))
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [topic, onBack])

  // Stage/clear demo aircraft for the current step, and frame the radar so
  // the illustration is centered regardless of where the player had panned.
  useEffect(() => {
    if (!step) return
    if (step.demo) {
      window.dispatchEvent(new CustomEvent('radar-reset-view'))
      window.dispatchEvent(new CustomEvent<TutorialDemoAircraft[]>('tutorial-demo-aircraft', { detail: step.demo as TutorialDemoAircraft[] }))
    } else {
      window.dispatchEvent(new CustomEvent<null>('tutorial-demo-aircraft', { detail: null }))
    }
    return () => {
      window.dispatchEvent(new CustomEvent<null>('tutorial-demo-aircraft', { detail: null }))
    }
  }, [step])

  if (!topic || !step) return null

  const isLast = stepIdx === topic.steps.length - 1

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
    <div style={{ position: 'fixed', inset: 0, zIndex: 1500 }}>
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
          <span style={{ color: '#475569', fontSize: 9 }}>{stepIdx + 1} / {topic.steps.length}</span>
        </div>

        <div style={{ lineHeight: 1.6, marginBottom: 12 }}>{step.body}</div>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <button
            onClick={onBack}
            style={{ background: 'none', border: 'none', color: '#64748b', fontSize: 10, cursor: 'pointer', padding: 0 }}
          >
            Back to menu (Esc)
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
              onClick={() => isLast ? onBack() : setStepIdx(i => i + 1)}
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
