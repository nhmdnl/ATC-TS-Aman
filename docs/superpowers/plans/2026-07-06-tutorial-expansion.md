# Tutorial Content Expansion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the single 8-step tutorial walkthrough with a menu of 6 replayable topics (UI Basics, ATC Fundamentals, Handling Incidents, Ground, Tower, Approach), where incident/role topics stage illustrative mock aircraft on the radar, and opening any tutorial auto-pauses a running session.

**Architecture:** A new pure-data file (`tutorialContent.ts`) drives a new menu component (`TutorialMenu`) and a refactored `TutorialOverlay` (same spotlight mechanism, now topic-driven instead of hardcoded). `RadarCanvas`'s per-aircraft drawing code is extracted into a shared function so it can render either real aircraft or render-only mock aircraft identically. State ownership (which topic is open, pause-on-open) moves to `App.tsx`.

**Tech Stack:** React 19, TypeScript, PixiJS 8 (`RadarCanvas`'s existing rendering).

## Global Constraints

- Depends on the Pause Menu plan's Task 1 (`GameContext` gains `muted`/`toggleMute`) only in the sense that both plans touch `App.tsx`'s `GameUI` function — apply this plan's `App.tsx` edits against whatever `GameUI` looks like after the Pause Menu plan has landed (its `useAudio(muted, toggleMute)` call and `<PauseMenu />` mount stay untouched by this plan; this plan adds tutorial-menu state alongside them).
- Render-only mock aircraft (`TutorialDemoAircraft`) must never be written into `gameState` — no changes to `src/engine/scoring.ts`, `src/engine/mission-system.ts`, `src/engine/simulation-tick.ts`, or `src/engine/career-system.ts` anywhere in this plan. If a task appears to need one of those files touched, stop — that means the design has been misapplied.
- No new automated tests — this project's Vitest suite targets `src/engine/` only (`environment: 'node'`, no DOM), and this plan adds no engine code. Verification is `npm run typecheck` plus manual/CDP checks, matching the design spec's own Testing section.
- Keep the exact visual style already established in `TutorialOverlay.tsx` (spotlight border color `#0ea5e9`, backdrop `rgba(8, 12, 20, 0.72)`, card background `#161B22`) — the menu and refactored overlay should look like siblings of the same system, not a redesign.

---

### Task 1: `tutorialContent.ts` data file

**Files:**
- Create: `src/data/tutorialContent.ts`

**Interfaces:**
- Produces: `TutorialDemoAircraft`, `TutorialStep`, `TutorialTopic` types and the `TUTORIAL_TOPICS` constant — consumed by `TutorialMenu` (Task 2), `TutorialOverlay` (Task 3), and `RadarCanvas` (Task 4).

- [ ] **Step 1: Write the full data file**

```ts
// Pure data — no logic. Six replayable tutorial topics, grouped for the
// TutorialMenu. UI Basics is the original 8-step walkthrough, unchanged.

/** A render-only aircraft staged for a tutorial step. Never enters gameState —
 *  RadarCanvas draws it with the same code path as real aircraft, but nothing
 *  in scoring/mission/career/spawn systems ever sees it. */
export interface TutorialDemoAircraft {
  readonly id: string
  readonly callsign: string
  readonly x: number          // world NM, relative to the airport reference point
  readonly y: number
  readonly altitude: number   // ft MSL
  readonly speed: number      // knots
  readonly heading: number    // degrees true
  readonly isGround: boolean
  readonly inViolation?: boolean
  readonly urgent?: boolean
}

export interface TutorialStep {
  readonly title: string
  readonly body: string
  readonly selector: string | null   // null = centered card, same as today
  /** Present = stage these aircraft and hide real traffic for this step. */
  readonly demo?: readonly TutorialDemoAircraft[]
}

export type TutorialGroup = 'getting-started' | 'atc-knowledge' | 'role'

export interface TutorialTopic {
  readonly id: string
  readonly title: string
  readonly group: TutorialGroup
  readonly menuDescription: string
  readonly steps: readonly TutorialStep[]
}

const UI_BASICS_STEPS: readonly TutorialStep[] = [
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
    body: 'Press G for the full controller guide, O for the mission tracker, and T to reopen this tutorial menu. Good luck — Asmara Tower is yours.',
    selector: null,
  },
]

const ATC_FUNDAMENTALS_STEPS: readonly TutorialStep[] = [
  {
    title: 'ATC FUNDAMENTALS',
    body: 'A quick primer on the concepts every controller decision here rests on: separation, datablocks, phase flow, and handoffs.',
    selector: null,
  },
  {
    title: 'SEPARATION MINIMA',
    body: 'Two airborne aircraft must stay at least 3 nautical miles apart laterally, OR 1,000 feet apart vertically. If both fall below those thresholds at once, it is a separation violation — the radar shows it as a pulsing red ring around both aircraft, and it costs you points. Watch converging tracks before they get close, not after.',
    selector: '#radar-container',
  },
  {
    title: 'READING A DATABLOCK',
    body: 'Each aircraft label has up to three lines: callsign; current altitude (in hundreds of feet) and speed (in tens of knots); and, if a clearance is pending, a "C:" line showing the cleared altitude/speed you assigned. A leader line connects the label to the aircraft it belongs to.',
    selector: '#radar-container',
  },
  {
    title: 'THE PHASE-OF-FLIGHT FLOW',
    body: 'Departures move through PARKED → TAXI_OUT → HOLD_SHORT → LINE_UP → TAKEOFF_ROLL → CLIMBING → DEPARTED. Arrivals move through ENTERING → APPROACH → FINAL → LANDING → ROLLOUT → TAXI_IN → ARRIVED. Each phase only accepts specific commands — the command panel greys out anything that is not valid right now, so you cannot get it wrong.',
    selector: '#flight-strips-container',
  },
  {
    title: 'HANDOFFS',
    body: 'An aircraft is always "on frequency" with exactly one controller: Ground, Tower, or Approach. A CONTACT command formally passes it to the next one — until you do, the receiving station\'s commands are not available for that aircraft. This is why an aircraft climbing out under Tower needs CONTACT DEPARTURE before it truly leaves your sector.',
    selector: '#commands-container',
  },
]

const HANDLING_INCIDENTS_STEPS: readonly TutorialStep[] = [
  {
    title: 'HANDLING INCIDENTS',
    body: 'Four situations you will eventually see, staged here so you know exactly what each one looks like before it matters for real.',
    selector: null,
  },
  {
    title: 'SEPARATION VIOLATION',
    body: 'These two aircraft are 2 NM apart at the same altitude — inside the 3 NM / 1,000 ft minimum. Notice the pulsing red ring around both. Fix it fast: turn one aircraft off the other\'s track, or change one\'s altitude by at least 1,000 ft. The longer it persists, the more it costs you.',
    selector: '#radar-container',
    demo: [
      { id: 'demo-sep-1', callsign: 'DEMO01', x: -1, y: 0, altitude: 6000, speed: 220, heading: 90, isGround: false, inViolation: true },
      { id: 'demo-sep-2', callsign: 'DEMO02', x: 1, y: 0, altitude: 6000, speed: 210, heading: 270, isGround: false, inViolation: true },
    ],
  },
  {
    title: 'NOT CLEARED TO LAND',
    body: 'An aircraft on FINAL that you have not cleared to land turns urgent — shown in amber. You must either issue CLEARED LAND before it reaches the runway, or send it around with GO AROUND. Leaving it undecided is the one thing you must never do on short final.',
    selector: '#radar-container',
    demo: [
      { id: 'demo-urgent-1', callsign: 'DEMO03', x: -0.5, y: -0.2, altitude: 500, speed: 140, heading: 70, isGround: false, urgent: true },
    ],
  },
  {
    title: 'GO-AROUND',
    body: 'When an aircraft breaks off its landing — whether you sent it around or a pilot did on their own — it climbs away on a published missed-approach track instead of continuing to the runway. Treat it like a new arrival: it will need to be re-sequenced back onto an approach.',
    selector: '#radar-container',
    demo: [
      { id: 'demo-missed-1', callsign: 'DEMO04', x: -0.3, y: -0.1, altitude: 1200, speed: 160, heading: 170, isGround: false },
    ],
  },
  {
    title: 'LOW ALTITUDE ALERT (MVA)',
    body: 'If an airborne aircraft drops below the Minimum Vectoring Altitude for this sector while not established on approach or final, the radio log shows a CRITICAL "LOW ALTITUDE ALERT — CHECK MVA" warning. Climb the aircraft immediately — this is a terrain-clearance issue, not a scoring nuance.',
    selector: '#radio-log-container',
    demo: [
      { id: 'demo-mva-1', callsign: 'DEMO05', x: -2, y: 1, altitude: 8200, speed: 200, heading: 200, isGround: false },
    ],
  },
]

const GROUND_STEPS: readonly TutorialStep[] = [
  {
    title: 'GROUND: THE TAXI SEQUENCE',
    body: 'Ground owns every aircraft from engine start to the runway hold-short line, and every arrival from rollout to the gate. This aircraft just requested pushback.',
    selector: '#commands-container',
    demo: [{ id: 'demo-gnd-1', callsign: 'DEMO10', x: 0.1, y: 0.15, altitude: 0, speed: 0, heading: 65, isGround: true }],
  },
  {
    title: 'TAXI',
    body: 'Select the aircraft, switch to the GND tab, and issue TAXI. It will roll toward the assigned runway on its own and stop automatically at the hold-short line — you do not drive it turn by turn.',
    selector: '#commands-container',
    demo: [{ id: 'demo-gnd-1', callsign: 'DEMO10', x: 0.1, y: 0.15, altitude: 0, speed: 20, heading: 65, isGround: true }],
  },
  {
    title: 'HANDING OFF TO TOWER',
    body: 'Once it reaches HOLD_SHORT, issue CONTACT TWR. Tower takes it from there for lineup and takeoff. On arrivals, the reverse happens: Tower hands a landed aircraft to you with CONTACT GND once it clears the runway, and you taxi it to a gate.',
    selector: '#commands-container',
    demo: [{ id: 'demo-gnd-1', callsign: 'DEMO10', x: -0.2, y: 0.05, altitude: 0, speed: 0, heading: 70, isGround: true }],
  },
]

const TOWER_STEPS: readonly TutorialStep[] = [
  {
    title: 'TOWER: THE RUNWAY',
    body: 'Tower owns the runway itself — lineup, takeoff clearance, landing clearance, and anything on short final. This aircraft has just been handed off from Ground at the hold-short line.',
    selector: '#commands-container',
    demo: [{ id: 'demo-twr-1', callsign: 'DEMO11', x: -0.25, y: 0.02, altitude: 0, speed: 0, heading: 70, isGround: true }],
  },
  {
    title: 'LINE UP AND CLEARED FOR TAKEOFF',
    body: 'Issue LINE UP to move it onto the runway centerline, then CLEARED T/OFF once the runway is confirmed clear. It accelerates and climbs on its own — your job is timing, not flying.',
    selector: '#commands-container',
    demo: [{ id: 'demo-twr-1', callsign: 'DEMO11', x: -0.15, y: 0, altitude: 0, speed: 0, heading: 70, isGround: true }],
  },
  {
    title: 'CLEARING ARRIVALS TO LAND',
    body: 'For arrivals, once Approach hands you an aircraft established on final, issue CLEARED LAND before it crosses the threshold. Forget, and it turns urgent — see the Handling Incidents tutorial for what that looks like.',
    selector: '#radar-container',
    demo: [{ id: 'demo-twr-2', callsign: 'DEMO12', x: -0.6, y: -0.2, altitude: 300, speed: 130, heading: 70, isGround: false }],
  },
]

const APPROACH_STEPS: readonly TutorialStep[] = [
  {
    title: 'APPROACH: SEQUENCING ARRIVALS',
    body: 'Approach owns arrivals from sector entry until they are established on final and handed to Tower. This aircraft just entered the sector.',
    selector: '#radar-container',
    demo: [{ id: 'demo-app-1', callsign: 'DEMO13', x: -6, y: 3, altitude: 11000, speed: 230, heading: 210, isGround: false }],
  },
  {
    title: 'CLEARED FOR THE APPROACH',
    body: 'Once it is reasonably aligned with the runway, issue CLEARED APPROACH. It automatically assigns the active runway and starts descending itself to intercept the glideslope — you do not need to work out the altitude by hand.',
    selector: '#commands-container',
    demo: [{ id: 'demo-app-1', callsign: 'DEMO13', x: -3, y: 1.5, altitude: 8000, speed: 200, heading: 245, isGround: false }],
  },
  {
    title: 'HANDING OFF TO TOWER',
    body: 'Once established, issue CONTACT TWR to pass it along before it reaches FINAL. If you forget, it stays on your frequency and Tower cannot clear it to land — a common way to accidentally send someone around.',
    selector: '#commands-container',
    demo: [{ id: 'demo-app-1', callsign: 'DEMO13', x: -1, y: 0.4, altitude: 2000, speed: 160, heading: 70, isGround: false }],
  },
]

export const TUTORIAL_TOPICS: readonly TutorialTopic[] = [
  {
    id: 'ui-basics',
    title: 'UI Basics',
    group: 'getting-started',
    menuDescription: 'Tour of the console — status bar, strips, radar, commands, input, radio log.',
    steps: UI_BASICS_STEPS,
  },
  {
    id: 'atc-fundamentals',
    title: 'ATC Fundamentals',
    group: 'atc-knowledge',
    menuDescription: 'Separation minima, datablocks, phase flow, and handoffs.',
    steps: ATC_FUNDAMENTALS_STEPS,
  },
  {
    id: 'handling-incidents',
    title: 'Handling Incidents',
    group: 'atc-knowledge',
    menuDescription: 'Separation violations, urgent aircraft, go-arounds, and MVA alerts — staged live.',
    steps: HANDLING_INCIDENTS_STEPS,
  },
  {
    id: 'role-ground',
    title: 'Ground',
    group: 'role',
    menuDescription: 'Taxi clearances and handing off to Tower.',
    steps: GROUND_STEPS,
  },
  {
    id: 'role-tower',
    title: 'Tower',
    group: 'role',
    menuDescription: 'Lineup, takeoff, and landing clearances.',
    steps: TOWER_STEPS,
  },
  {
    id: 'role-approach',
    title: 'Approach',
    group: 'role',
    menuDescription: 'Sequencing arrivals onto the approach and handing off to Tower.',
    steps: APPROACH_STEPS,
  },
]
```

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: no errors (this file has no dependents yet, so this just confirms the file itself is syntactically and structurally valid TypeScript).

- [ ] **Step 3: Commit**

```bash
git add src/data/tutorialContent.ts
git commit -m "feat: add tutorial topic content data (UI Basics, ATC Fundamentals, Handling Incidents, Ground/Tower/Approach)"
```

---

### Task 2: `TutorialMenu` component

**Files:**
- Create: `src/components/TutorialMenu.tsx`

**Interfaces:**
- Consumes: `TUTORIAL_TOPICS`, `TutorialTopic` from `src/data/tutorialContent.ts` (Task 1).
- Produces: `<TutorialMenu open={boolean} onSelect={(topicId: string) => void} onClose={() => void} />` — consumed by `App.tsx` (Task 5).

- [ ] **Step 1: Write the component**

```tsx
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
```

Note the `zIndex: 1500` — higher than `BriefingScreen`'s `1000` and `EndScreen`/`PauseMenu`'s `1000`, so the tutorial menu can appear on top of any of those (it needs to work pre-game, over the briefing screen, per the design spec's access points).

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/components/TutorialMenu.tsx
git commit -m "feat: add TutorialMenu topic picker"
```

---

### Task 3: Refactor `TutorialOverlay` to be topic-driven

**Files:**
- Modify: `src/components/TutorialOverlay.tsx`

**Interfaces:**
- Consumes: `TUTORIAL_TOPICS` from `src/data/tutorialContent.ts` (Task 1).
- Produces: `<TutorialOverlay topicId={string | null} onBack={() => void} />` — consumed by `App.tsx` (Task 5). This **replaces** the previous `<TutorialOverlay />` (no props, internal `useToggleEvent('toggle-tutorial')` state).
- Produces (side effect): dispatches a `tutorial-demo-aircraft` `CustomEvent` with `detail: TutorialDemoAircraft[] | null` — consumed by `RadarCanvas` (Task 4).

- [ ] **Step 1: Replace the full file contents**

```tsx
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
```

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: errors in `src/App.tsx` (it still renders `<TutorialOverlay />` with no props, and the old `toggle-tutorial` behavior) — this is expected at this point in the plan; Task 5 fixes `App.tsx`. Confirm the *only* errors are in `App.tsx` referencing `TutorialOverlay`'s props, not inside `TutorialOverlay.tsx` itself.

- [ ] **Step 3: Commit**

```bash
git add src/components/TutorialOverlay.tsx
git commit -m "refactor: make TutorialOverlay topic-driven instead of a hardcoded single walkthrough"
```

(Committing here even though `App.tsx` doesn't compile yet is fine — the next two tasks fix it, and each task is its own commit. If your workflow prefers a fully-green tree at every commit, do Task 3 and Task 4 together before committing either.)

---

### Task 4: `RadarCanvas` — shared drawing helper + demo-aircraft rendering

**Files:**
- Modify: `src/components/RadarCanvas.tsx`

**Interfaces:**
- Consumes: `TutorialDemoAircraft` type from `src/data/tutorialContent.ts` (Task 1).
- Consumes: `tutorial-demo-aircraft` `CustomEvent` (dispatched by `TutorialOverlay`, Task 3).

This task extracts the per-aircraft drawing logic currently inline in `redrawDynamic()` into a standalone function usable for both real `Aircraft` and `TutorialDemoAircraft`, and adds a second sprite pool + event listener so demo aircraft render through the exact same code path.

- [ ] **Step 1: Add the import and a shared `DrawableAircraft` shape + `drawAircraftBody` function**

In `src/components/RadarCanvas.tsx`, add to the imports at the top:

```ts
import type { TutorialDemoAircraft } from '../data/tutorialContent'
```

Then, **outside** the `RadarCanvas` component function (add it after the `RANGE_LABEL_BEARING_DEG` constant, before `export default function RadarCanvas()`), add:

```ts
/** Minimal shape both real Aircraft and TutorialDemoAircraft satisfy — the
 *  only fields drawAircraftBody actually needs. Real Aircraft objects match
 *  this structurally with no changes. */
interface DrawableAircraft {
  readonly id: string
  readonly callsign: string
  readonly x: number
  readonly y: number
  readonly altitude: number
  readonly speed: number
  readonly heading: number
  readonly isGround: boolean
  readonly isSelected?: boolean
  readonly inViolation?: boolean
  readonly urgent?: boolean
  readonly clearedAltitude?: number | null
  readonly clearedSpeed?: number | null
  readonly trail?: ReadonlyArray<{ x: number; y: number }>
}

/** Draws one aircraft's blip, trail, hover ring, violation pulse, vector,
 *  and leader-line datablock into the given sprite. Used for both real
 *  traffic and staged tutorial demo aircraft so a demo violation looks
 *  pixel-identical to a real one. */
function drawAircraftBody(
  g: PIXI.Graphics,
  text: PIXI.Text,
  data: DrawableAircraft,
  mapX: (x: number) => number,
  mapY: (y: number) => number,
  zoom: number,
  hoveredId: string | null,
): void {
  const x = mapX(data.x)
  const y = mapY(data.y)
  const isGround = data.isGround

  let color = 0x38bdf8 // cyan
  if (data.isSelected) color = 0xffffff
  if (data.urgent) color = 0xeab308
  if (data.inViolation) color = 0xef4444
  if (isGround) color = 0x10b981

  g.clear()
  g.hitArea = new PIXI.Circle(x, y, 9)

  // Trail
  if (data.trail && data.trail.length > 1) {
    g.setStrokeStyle({ width: 1, color, alpha: 0.4 })
    g.moveTo(mapX(data.trail[0].x), mapY(data.trail[0].y))
    for (let i = 1; i < data.trail.length; i++) {
      g.lineTo(mapX(data.trail[i].x), mapY(data.trail[i].y))
    }
    g.stroke()
  }

  // Hover ring
  if (hoveredId === data.id && !data.isSelected) {
    g.setStrokeStyle({ width: 1, color: 0xe2e8f0, alpha: 0.6 })
    g.circle(x, y, 7)
    g.stroke()
  }

  // Violation pulse halo
  if (data.inViolation) {
    const phase = (Date.now() % 1200) / 1200
    g.setStrokeStyle({ width: 2, color: 0xef4444, alpha: 0.6 * (1 - phase) })
    g.circle(x, y, 6 + phase * 8)
    g.stroke()
  }

  // Blip
  if (isGround) {
    g.rect(x - 2, y - 2, 4, 4)
  } else {
    g.circle(x, y, 3)
  }
  g.fill(color)

  // Vector
  if (!isGround) {
    const rad = data.heading * (Math.PI / 180)
    const dist1MinNM = (data.speed / 60)
    const lx = x + Math.sin(rad) * dist1MinNM * zoom
    const ly = y - Math.cos(rad) * dist1MinNM * zoom
    g.setStrokeStyle({ width: 1, color })
    g.moveTo(x, y)
    g.lineTo(lx, ly)
    g.stroke()
  }

  // Leader-line datablock
  if (!isGround || data.isSelected) {
    text.visible = true
    const anchorX = x + 14
    const anchorY = y - 14
    g.setStrokeStyle({ width: 1, color, alpha: 0.5 })
    g.moveTo(x + 4, y - 4)
    g.lineTo(anchorX - 2, anchorY + 2)
    g.stroke()

    text.position.set(anchorX + 2, anchorY - 6)
    text.style.fill = color

    const altStr = data.altitude < 100 ? 'GND' : Math.round(data.altitude / 100).toString().padStart(3, '0')
    const spdStr = Math.round(data.speed / 10).toString().padStart(2, '0')
    const cAltStr = data.clearedAltitude ? Math.round(data.clearedAltitude / 100).toString().padStart(3, '0') : ''
    const cSpdStr = data.clearedSpeed ? Math.round(data.clearedSpeed / 10).toString().padStart(2, '0') : ''

    let label = `${data.callsign}\n${altStr} ${spdStr}`
    if (cAltStr || cSpdStr) {
      label += `\nC:${cAltStr} ${cSpdStr}`
    }
    text.text = label
  } else {
    text.visible = false
  }
}
```

- [ ] **Step 2: Add a demo-aircraft ref, a demo sprite pool, and the event listener**

Inside the `RadarCanvas` component, right after the existing `aircraftSpritesRef` declaration:

```ts
  const aircraftSpritesRef = useRef<Map<string, { g: PIXI.Graphics, text: PIXI.Text }>>(new Map())
  const demoSpritesRef = useRef<Map<string, { g: PIXI.Graphics, text: PIXI.Text }>>(new Map())
  const tutorialDemoRef = useRef<readonly TutorialDemoAircraft[] | null>(null)
```

Then, in the "Keyboard-driven view controls" `useEffect` (the one with `radar-center`/`radar-zoom-in`/etc.), add the new listener alongside the existing ones. Change:

```ts
    window.addEventListener('radar-center', onCenter)
    window.addEventListener('radar-reset-view', onResetView)
    window.addEventListener('radar-zoom-in', onZoomIn)
    window.addEventListener('radar-zoom-out', onZoomOut)
    window.addEventListener('radar-toggle-ruler', onToggleRuler)
    return () => {
      window.removeEventListener('radar-center', onCenter)
      window.removeEventListener('radar-reset-view', onResetView)
      window.removeEventListener('radar-zoom-in', onZoomIn)
      window.removeEventListener('radar-zoom-out', onZoomOut)
      window.removeEventListener('radar-toggle-ruler', onToggleRuler)
    }
  }, [])
```

to:

```ts
    const onDemoUpdate = (e: Event) => {
      const detail = (e as CustomEvent<readonly TutorialDemoAircraft[] | null>).detail
      tutorialDemoRef.current = detail ?? null
    }

    window.addEventListener('radar-center', onCenter)
    window.addEventListener('radar-reset-view', onResetView)
    window.addEventListener('radar-zoom-in', onZoomIn)
    window.addEventListener('radar-zoom-out', onZoomOut)
    window.addEventListener('radar-toggle-ruler', onToggleRuler)
    window.addEventListener('tutorial-demo-aircraft', onDemoUpdate)
    return () => {
      window.removeEventListener('radar-center', onCenter)
      window.removeEventListener('radar-reset-view', onResetView)
      window.removeEventListener('radar-zoom-in', onZoomIn)
      window.removeEventListener('radar-zoom-out', onZoomOut)
      window.removeEventListener('radar-toggle-ruler', onToggleRuler)
      window.removeEventListener('tutorial-demo-aircraft', onDemoUpdate)
    }
  }, [])
```

- [ ] **Step 3: Rewrite `redrawDynamic()` to use the shared helper and branch on demo state**

Replace the full body of `redrawDynamic()` (from `function redrawDynamic() {` through its closing `}`) with:

```ts
  function redrawDynamic() {
    const app = appRef.current
    const container = dynamicLayerRef.current
    if (!app || !container) return

    const zoom = zoomRef.current
    const ox = offsetXRef.current
    const oy = offsetYRef.current
    const cx = app.screen.width / 2
    const cy = app.screen.height / 2
    const mapX = (x: number) => cx + x * zoom + ox
    const mapY = (y: number) => cy - y * zoom + oy

    const sprites = aircraftSpritesRef.current
    const demoSprites = demoSpritesRef.current
    const demo = tutorialDemoRef.current

    if (demo) {
      // A tutorial demo is active: hide real traffic (without touching
      // gameState — it's still there, just not drawn this frame) and draw
      // only the staged mock aircraft.
      for (const sprite of sprites.values()) {
        sprite.g.visible = false
        sprite.text.visible = false
      }

      const currentDemoIds = new Set(demo.map(d => d.id))
      for (const [id, sprite] of demoSprites.entries()) {
        if (!currentDemoIds.has(id)) {
          sprite.g.destroy()
          sprite.text.destroy()
          demoSprites.delete(id)
        }
      }

      for (const d of demo) {
        let sprite = demoSprites.get(d.id)
        if (!sprite) {
          const g = new PIXI.Graphics()
          const text = new PIXI.Text({ text: '', style: { fontFamily: 'SF Mono', fontSize: 10, fill: 0xffffff, align: 'left' } })
          container.addChild(g)
          container.addChild(text)
          sprite = { g, text }
          demoSprites.set(d.id, sprite)
        }
        sprite.g.visible = true
        sprite.text.visible = true
        drawAircraftBody(sprite.g, sprite.text, d, mapX, mapY, zoom, null)
      }
      return
    }

    // No demo active: hide any leftover demo sprites and draw real traffic.
    for (const sprite of demoSprites.values()) {
      sprite.g.visible = false
      sprite.text.visible = false
    }

    const currentIds = new Set(state.aircraft.keys())
    for (const [id, sprite] of sprites.entries()) {
      if (!currentIds.has(id)) {
        sprite.g.destroy()
        sprite.text.destroy()
        sprites.delete(id)
      }
    }

    for (const ac of state.aircraft.values()) {
      let sprite = sprites.get(ac.id)
      if (!sprite) {
        const g = new PIXI.Graphics()
        const text = new PIXI.Text({ text: '', style: { fontFamily: 'SF Mono', fontSize: 10, fill: 0xffffff, align: 'left' } })

        // Make both the blip and its text clickable (bigger effective hit
        // target than the label alone). These handlers only ever call
        // selectAircraft(ac.id) — safe to attach once even though the
        // closure goes stale, since selectAircraft mutates the singleton
        // gameState directly and ac.id never changes for this sprite.
        g.eventMode = 'static'
        g.cursor = 'pointer'
        g.on('pointerdown', () => selectAircraft(ac.id))
        text.eventMode = 'static'
        text.cursor = 'pointer'
        text.on('pointerdown', () => selectAircraft(ac.id))

        container.addChild(g)
        container.addChild(text)
        sprite = { g, text }
        sprites.set(ac.id, sprite)
      }
      sprite.g.visible = true
      sprite.text.visible = true
      drawAircraftBody(sprite.g, sprite.text, ac, mapX, mapY, zoom, hoveredIdRef.current)
    }
  }
```

- [ ] **Step 4: Typecheck**

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 5: Manual verification**

Run `npm run dev`, click START. Confirm normal radar rendering is unchanged (aircraft blips, trails, hover, click-to-select all still work — this proves the extraction didn't change real-traffic behavior). Then, from the DevTools console, simulate a demo activation directly:

```js
window.dispatchEvent(new CustomEvent('tutorial-demo-aircraft', { detail: [
  { id: 'test-1', callsign: 'TEST01', x: 0, y: 0, altitude: 5000, speed: 200, heading: 90, isGround: false, inViolation: true }
] }))
```

Confirm a single pulsing-red demo aircraft appears at the center and all real traffic disappears (still selectable in flight strips if you check — proving it's hidden, not deleted). Then clear it:

```js
window.dispatchEvent(new CustomEvent('tutorial-demo-aircraft', { detail: null }))
```

Confirm real traffic reappears.

- [ ] **Step 6: Commit**

```bash
git add src/components/RadarCanvas.tsx
git commit -m "feat: extract shared aircraft-drawing helper and support staged tutorial demo aircraft"
```

---

### Task 5: Wire it all together in `App.tsx`, add the BriefingScreen entry point

**Files:**
- Modify: `src/App.tsx`
- Modify: `src/components/BriefingScreen.tsx`

**Interfaces:**
- Consumes: `<TutorialMenu open onSelect onClose />` (Task 2), `<TutorialOverlay topicId onBack />` (Task 3).
- Consumes: `togglePause`, `state.sessionStarted`, `state.paused` from `useGame()` (already exist).

- [ ] **Step 1: Add tutorial-menu state and auto-pause to `App.tsx`**

Add `useEffect`, `useRef`, `useState` to the React import at the top of `src/App.tsx` (if the Pause Menu plan already added some of these for its own purposes, merge rather than duplicate):

```ts
import { useEffect, useRef, useState } from 'react'
```

Add the import for the new menu component next to the existing `TutorialOverlay` import:

```ts
import TutorialMenu from './components/TutorialMenu'
```

Inside `GameUI`, after the existing `const { state, muted, toggleMute } = useGame()` line (from the Pause Menu plan) — if that line isn't present yet because Pause Menu hasn't landed, use `const { state, togglePause } = useGame()` instead and adjust — add:

```ts
  const { togglePause } = useGame()  // omit this line if togglePause is already destructured above

  const [tutorialMenuOpen, setTutorialMenuOpen] = useState(false)
  const [activeTutorialTopicId, setActiveTutorialTopicId] = useState<string | null>(null)
  const weTutorialPausedRef = useRef(false)

  // T key: fully close whatever tutorial UI is open, or open the menu if
  // nothing is. (Esc while inside a topic steps back to the menu instead —
  // handled by TutorialOverlay itself via onBack.)
  useEffect(() => {
    const onToggle = () => {
      if (activeTutorialTopicId !== null || tutorialMenuOpen) {
        setActiveTutorialTopicId(null)
        setTutorialMenuOpen(false)
      } else {
        setTutorialMenuOpen(true)
      }
    }
    window.addEventListener('toggle-tutorial', onToggle)
    return () => window.removeEventListener('toggle-tutorial', onToggle)
  }, [activeTutorialTopicId, tutorialMenuOpen])

  // Auto-pause a running session for as long as any tutorial UI is open;
  // only resume it on close if this effect was the one that paused it, so a
  // player who paused manually first doesn't get surprise-resumed.
  useEffect(() => {
    const tutorialOpen = tutorialMenuOpen || activeTutorialTopicId !== null
    if (tutorialOpen) {
      if (state.sessionStarted && !state.paused) {
        togglePause()
        weTutorialPausedRef.current = true
      }
    } else if (weTutorialPausedRef.current) {
      togglePause()
      weTutorialPausedRef.current = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tutorialMenuOpen, activeTutorialTopicId])
```

(The dependency array intentionally omits `state`/`togglePause` — this effect should only re-run when the tutorial's own open/closed state changes, not on every snapshot tick, or it would immediately re-pause every frame while a tutorial is open.)

- [ ] **Step 2: Replace the `<TutorialOverlay />` mount**

Find:

```tsx
        <EndScreen />
        <TutorialOverlay />
```

(or, if the Pause Menu plan already landed, it may read `<EndScreen /> <TutorialOverlay /> <PauseMenu />` — only change the `TutorialOverlay` line, leave `EndScreen`/`PauseMenu` as they are)

and change the `TutorialOverlay` line to:

```tsx
        <EndScreen />
        <TutorialMenu
          open={tutorialMenuOpen}
          onSelect={(topicId) => { setActiveTutorialTopicId(topicId); setTutorialMenuOpen(false) }}
          onClose={() => setTutorialMenuOpen(false)}
        />
        <TutorialOverlay
          topicId={activeTutorialTopicId}
          onBack={() => { setActiveTutorialTopicId(null); setTutorialMenuOpen(true) }}
        />
```

- [ ] **Step 3: Add a TUTORIALS button to `BriefingScreen`**

In `src/components/BriefingScreen.tsx`, the `handleStart`/START button block currently ends with:

```tsx
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
```

Change it to add a second button in the same row:

```tsx
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
            style={{
              padding: '10px 16px',
              background: '#1D2430',
              color: '#E2E8F0',
              border: '1px solid #334155',
              borderRadius: 4,
              cursor: 'pointer',
              fontWeight: 700,
              fontSize: 14,
              fontFamily: 'inherit',
            }}
          >
            TUTORIALS
          </button>
        </div>
```

This reuses the exact same `toggle-tutorial` event the `T` key dispatches — no prop drilling needed between `BriefingScreen` and the tutorial-menu state in `App.tsx`.

- [ ] **Step 4: Typecheck**

Run: `npm run typecheck`
Expected: no errors. This confirms Task 3's `TutorialOverlay` prop contract and Task 2's `TutorialMenu` prop contract both match how `App.tsx` calls them.

- [ ] **Step 5: Manual verification**

Run `npm run dev`.

1. **Pre-game:** on the briefing screen, click TUTORIALS. Confirm the topic menu opens (over the briefing screen, not behind it). Click "UI Basics" and confirm the original 8-step walkthrough plays exactly as before. Click "Back to menu" partway through — confirm it returns to the topic list, not fully closed. Press Esc while only the menu is showing — confirm it closes fully, back to the plain briefing screen.
2. **Mid-session, no incident staged:** click START, let a session run, press `T`. Confirm the sim visibly pauses (traffic stops moving) and the topic menu appears. Open "ATC Fundamentals" and step through all 5 steps — no demo aircraft should appear (real traffic, frozen from the pause, stays visible underneath the spotlight backdrop). Press `T` again — confirm everything closes AND the sim resumes (traffic starts moving again).
3. **Staged demo:** with a session running, press `T`, open "Handling Incidents", advance to "SEPARATION VIOLATION". Confirm real traffic disappears and exactly two pulsing-red demo aircraft appear, roughly 2 NM apart. Advance to the next step — confirm the previous demo aircraft are gone and the new step's single demo aircraft (amber, urgent) appears instead. Close the tutorial entirely (`T`) — confirm real traffic reappears and the sim resumes.
4. **Manual-pause interaction:** pause the sim yourself (Space) *before* opening a tutorial. Open and close a tutorial. Confirm the sim is **still paused** afterward (it should not auto-resume, since you paused it manually, not the tutorial system).

- [ ] **Step 6: Commit**

```bash
git add src/App.tsx src/components/BriefingScreen.tsx
git commit -m "feat: wire tutorial menu into App with auto-pause, add TUTORIALS entry to briefing screen"
```

---

## Self-Review Notes

- **Spec coverage:** all six topics (Task 1), the menu (Task 2), topic-driven overlay with back-to-menu navigation (Task 3), staged render-only demo aircraft with real-traffic hiding (Task 4), auto-pause with "don't surprise-resume a manual pause" (Task 5), and both access points — `T` key and a `BriefingScreen` button (Task 5) — are each covered by a task.
- **Placeholder scan:** none found — every tutorial step has real body text, not a TODO.
- **Type consistency:** `TutorialTopic`/`TutorialStep`/`TutorialDemoAircraft` (Task 1) are used identically in `TutorialMenu` (Task 2, via `TutorialGroup`), `TutorialOverlay` (Task 3), and `RadarCanvas`'s `DrawableAircraft`/`drawAircraftBody` (Task 4). `TutorialOverlay`'s prop names (`topicId`, `onBack`) match exactly how `App.tsx` (Task 5) invokes it. `TutorialMenu`'s prop names (`open`, `onSelect`, `onClose`) match exactly how `App.tsx` (Task 5) invokes it.
- **Note on a discovered edge case:** the original `TutorialOverlay` used `zIndex: 200`. Since this plan makes the tutorial launchable from the briefing screen (`zIndex: 1000`), both `TutorialMenu` and the refactored `TutorialOverlay` use `zIndex: 1500` instead, so they always render on top regardless of whether a session has started. This is called out explicitly in Task 2 and reflected in Task 3's code — not an inconsistency, a deliberate fix needed by this plan's new pre-game access point.
