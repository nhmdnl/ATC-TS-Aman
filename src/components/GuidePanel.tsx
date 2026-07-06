import React, { useState } from 'react'
import { useToggleEvent } from '../state/useToggleEvent'

type GuideTab = 'COMMANDS' | 'PROCEDURES' | 'SCORING' | 'CONTROLS'

const TABS: GuideTab[] = ['COMMANDS', 'PROCEDURES', 'SCORING', 'CONTROLS']

const CELL: React.CSSProperties = { padding: '3px 8px', borderBottom: '1px solid #1e293b' }
const KEY_STYLE: React.CSSProperties = {
  display: 'inline-block',
  minWidth: 16,
  padding: '1px 5px',
  background: '#1e293b',
  border: '1px solid #334155',
  borderRadius: 3,
  textAlign: 'center',
  color: '#e2e8f0',
  fontFamily: 'SF Mono, Consolas, monospace',
}

function Row({ left, right }: { left: React.ReactNode; right: React.ReactNode }) {
  return (
    <tr>
      <td style={{ ...CELL, color: '#5CBFFF', whiteSpace: 'nowrap', fontFamily: 'SF Mono, Consolas, monospace' }}>{left}</td>
      <td style={{ ...CELL, color: '#94a3b8' }}>{right}</td>
    </tr>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{ color: '#fbbf24', fontSize: 10, letterSpacing: 1, marginBottom: 4, fontWeight: 700 }}>{title}</div>
      {children}
    </div>
  )
}

function GuideTable({ children }: { children: React.ReactNode }) {
  return (
    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 10 }}>
      <tbody>{children}</tbody>
    </table>
  )
}

export default function GuidePanel() {
  const [open, setOpen] = useToggleEvent('toggle-guide-panel')
  const [tab, setTab] = useState<GuideTab>('COMMANDS')

  if (!open) return null

  return (
    <div style={{
      position: 'absolute',
      top: 8,
      left: 8,
      bottom: 8,
      width: 340,
      display: 'flex',
      flexDirection: 'column',
      background: 'rgba(22, 27, 34, 0.97)',
      border: '1px solid #334155',
      borderRadius: 6,
      zIndex: 60,
      color: '#94a3b8',
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 10px', borderBottom: '1px solid #1e293b' }}>
        <span style={{ fontSize: 10, letterSpacing: 1, color: '#0ea5e9', fontWeight: 700 }}>CONTROLLER GUIDE</span>
        <button
          onClick={() => setOpen(false)}
          style={{ background: 'none', border: 'none', color: '#64748b', cursor: 'pointer', fontSize: 12, padding: 0, lineHeight: 1 }}
          aria-label="Close guide panel"
        >
          ✕
        </button>
      </div>

      <div style={{ display: 'flex', borderBottom: '1px solid #1e293b' }}>
        {TABS.map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            style={{
              flex: 1,
              background: tab === t ? '#1e293b' : 'transparent',
              border: 'none',
              borderBottom: tab === t ? '2px solid #0ea5e9' : '2px solid transparent',
              color: tab === t ? '#e2e8f0' : '#64748b',
              fontSize: 9,
              letterSpacing: 0.5,
              padding: '6px 0',
              cursor: 'pointer',
            }}
          >
            {t}
          </button>
        ))}
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: 10, fontSize: 10 }}>
        {tab === 'COMMANDS' && (
          <>
            <Section title="GROUND (GND 121.9)">
              <GuideTable>
                <Row left="TAXI RWY 07" right="Taxi to and hold short of runway" />
                <Row left="HOLD" right="Hold short of runway" />
                <Row left="CONTACT TWR" right="Hand off to tower" />
              </GuideTable>
            </Section>
            <Section title="TOWER (TWR 118.1)">
              <GuideTable>
                <Row left="LINEUP" right="Line up and wait on the runway" />
                <Row left="TAKEOFF" right="Cleared for takeoff" />
                <Row left="LAND" right="Cleared to land" />
                <Row left="GO_AROUND" right="Execute missed approach" />
                <Row left="CONTACT DEP / GND" right="Frequency handoff" />
              </GuideTable>
            </Section>
            <Section title="APPROACH (APP 120.7)">
              <GuideTable>
                <Row left="CLIMB 120" right="Climb and maintain (FL or feet)" />
                <Row left="DESCEND 90" right="Descend and maintain" />
                <Row left="HEADING 270" right="Fly heading (vectors)" />
                <Row left="SPEED 180" right="Assign airspeed in knots" />
                <Row left="APPROACH" right="Cleared for the approach" />
                <Row left="SQUAWK 4521" right="Assign transponder code" />
                <Row left="CONTACT TWR" right="Hand off to tower" />
              </GuideTable>
            </Section>
            <div style={{ color: '#64748b', fontSize: 9 }}>
              Text syntax: CALLSIGN VERB [ARGS] — e.g. <span style={{ color: '#5CBFFF' }}>DAL123 DESCEND 90</span>.
              Click an aircraft then use the command buttons for the same effect.
            </div>
          </>
        )}

        {tab === 'PROCEDURES' && (
          <>
            <Section title="DEPARTURES">
              <div style={{ lineHeight: 1.6 }}>
                1. Parked aircraft calls for taxi — issue <span style={{ color: '#5CBFFF' }}>TAXI RWY</span>.<br />
                2. At the hold-short point, hand off to tower (<span style={{ color: '#5CBFFF' }}>CONTACT TWR</span>).<br />
                3. Line up (<span style={{ color: '#5CBFFF' }}>LINEUP</span>) or clear for takeoff directly.<br />
                4. Airborne: hand off to departure (<span style={{ color: '#5CBFFF' }}>CONTACT DEP</span>) for +25 pts.
              </div>
            </Section>
            <Section title="ARRIVALS">
              <div style={{ lineHeight: 1.6 }}>
                1. Arrivals enter the sector at ~12,000 ft — vector them toward the field.<br />
                2. Descend in steps; keep them at or above the MVA floor (8,800 ft MSL) until established.<br />
                3. Clear for the approach, then hand off to tower.<br />
                4. Tower clears to land; after rollout, hand to ground and taxi to a gate.
              </div>
            </Section>
            <Section title="SEPARATION">
              <div style={{ lineHeight: 1.6 }}>
                Keep airborne aircraft <span style={{ color: '#e2e8f0' }}>3 NM</span> laterally or{' '}
                <span style={{ color: '#e2e8f0' }}>1,000 ft</span> vertically apart. Violations flash red
                on the radar and cost -150 points. Aircraft below the MVA are flagged{' '}
                <span style={{ color: '#F87171' }}>MVA!</span>
              </div>
            </Section>
            <Section title="GO-AROUNDS">
              <div style={{ lineHeight: 1.6 }}>
                An aircraft on FINAL that is not cleared to land turns urgent (amber). Clear it to land
                in time or send it around — a missed approach costs -100 points.
              </div>
            </Section>
          </>
        )}

        {tab === 'SCORING' && (
          <>
            <Section title="SCORE EVENTS">
              <GuideTable>
                <Row left="+5" right="Command issued" />
                <Row left="+20" right="Takeoff" />
                <Row left="+30" right="Landing" />
                <Row left="+25" right="Departure handoff" />
                <Row left="+20" right="Arrival reaches gate" />
                <Row left="-100" right="Missed approach" />
                <Row left="-150" right="Separation violation" />
              </GuideTable>
            </Section>
            <Section title="GRADES">
              <GuideTable>
                <Row left={<span style={{ color: '#f59e0b' }}>S</span>} right="Score ≥ 1500" />
                <Row left={<span style={{ color: '#22c55e' }}>A</span>} right="Score ≥ 1200" />
                <Row left={<span style={{ color: '#0ea5e9' }}>B</span>} right="Score ≥ 900" />
                <Row left={<span style={{ color: '#94a3b8' }}>C</span>} right="Score ≥ 600" />
                <Row left={<span style={{ color: '#ef4444' }}>D</span>} right="Score < 600" />
              </GuideTable>
            </Section>
            <Section title="DIMENSIONS">
              <div style={{ lineHeight: 1.6 }}>
                Safety, Efficiency, Communication, Procedure and Awareness are tracked separately —
                commands, handoffs and clean traffic flow raise them; violations and missed approaches
                hit Safety and Efficiency hardest. You start at 1000 points (max 2000).
              </div>
            </Section>
          </>
        )}

        {tab === 'CONTROLS' && (
          <>
            <Section title="RADAR">
              <GuideTable>
                <Row left={<span style={KEY_STYLE}>drag</span>} right="Pan the radar" />
                <Row left={<span style={KEY_STYLE}>wheel</span>} right="Zoom at cursor" />
                <Row left={<><span style={KEY_STYLE}>+</span> <span style={KEY_STYLE}>-</span></>} right="Zoom in / out" />
                <Row left={<span style={KEY_STYLE}>0</span>} right="Reset view" />
                <Row left={<span style={KEY_STYLE}>C</span>} right="Center on airport" />
                <Row left={<span style={KEY_STYLE}>R</span>} right="Ruler — drag to measure NM / bearing" />
              </GuideTable>
            </Section>
            <Section title="GAME">
              <GuideTable>
                <Row left={<span style={KEY_STYLE}>Tab</span>} right="Cycle through aircraft" />
                <Row left={<span style={KEY_STYLE}>Esc</span>} right="Deselect aircraft" />
                <Row left={<span style={KEY_STYLE}>Space</span>} right="Pause / resume" />
                <Row left={<span style={KEY_STYLE}>/</span>} right="Focus the command input" />
                <Row left={<span style={KEY_STYLE}>M</span>} right="Mute audio" />
              </GuideTable>
            </Section>
            <Section title="PANELS">
              <GuideTable>
                <Row left={<span style={KEY_STYLE}>G</span>} right="This guide" />
                <Row left={<span style={KEY_STYLE}>O</span>} right="Mission tracker" />
                <Row left={<span style={KEY_STYLE}>T</span>} right="Tutorial walkthrough" />
              </GuideTable>
            </Section>
          </>
        )}
      </div>
    </div>
  )
}
