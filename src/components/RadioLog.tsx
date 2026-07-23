import React, { useEffect, useRef } from 'react'
import { useGame } from '../state/GameContext'

interface RadioLogProps {
  expanded: boolean
  onToggleExpand: () => void
}

export default function RadioLog({ expanded, onToggleExpand }: RadioLogProps) {
  const { state, selectAircraft } = useGame()
  const messagesEndRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [state.radioMessages])

  // callsign → aircraft id, so a click on a speaker tag selects that aircraft
  const idByCallsign = new Map<string, string>()
  for (const ac of state.aircraft.values()) idByCallsign.set(ac.callsign, ac.id)

  return (
    <div className="panel-bg" style={{ height: '100%', padding: 4, display: 'flex', flexDirection: 'column' }}>
      <div style={{ padding: '4px 8px', fontSize: 10, fontWeight: 600, color: '#64748B', borderBottom: '1px solid #1E293B', flexShrink: 0, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span>RADIO COMMS</span>
        <button
          onClick={onToggleExpand}
          title={expanded ? 'Collapse the radio log' : 'Expand the radio log'}
          style={{
            background: 'none', border: '1px solid #1E293B', borderRadius: 3,
            color: '#64748B', fontSize: 9, fontFamily: 'inherit', cursor: 'pointer',
            padding: '1px 6px', lineHeight: 1.4,
          }}
        >
          {expanded ? '▼ COLLAPSE' : '▲ EXPAND'}
        </button>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '4px 8px', display: 'flex', flexDirection: 'column', gap: 4 }}>
        {state.radioMessages.length === 0 && (
          <div style={{ color: '#475569', fontSize: 10, textAlign: 'center', padding: '16px 0' }}>
            No transmissions yet
          </div>
        )}
        {state.radioMessages.map((msg, i) => {
          const aircraftId = idByCallsign.get(msg.callsign ?? msg.station ?? '')
          return (
            <div key={i} style={{
              display: 'flex', gap: 8, fontSize: 11, fontFamily: 'SF Mono, Consolas, monospace',
              borderLeft: msg.speaker === 'INBOUND' ? '2px solid #f59e0b' : '2px solid transparent',
              paddingLeft: msg.speaker === 'INBOUND' ? 4 : 0,
              background: msg.speaker === 'INBOUND' ? 'rgba(245,158,11,0.05)' : undefined,
            }}>
              <span style={{ color: '#475569', minWidth: 40 }}>
                {new Date(msg.timestamp).toISOString().substring(11, 19)}
              </span>
              <span
                onClick={aircraftId ? () => selectAircraft(aircraftId) : undefined}
                title={aircraftId ? 'Select this aircraft' : undefined}
                style={{
                  color: msg.speaker === 'ATC' ? '#0ea5e9'
                    : msg.speaker === 'CRITICAL' ? '#ef4444'
                    : msg.speaker === 'INBOUND' ? '#f59e0b'
                    : '#22c55e',
                  minWidth: 45,
                  cursor: aircraftId ? 'pointer' : undefined,
                  textDecoration: aircraftId ? 'underline dotted' : undefined,
                }}
              >
                {msg.speaker === 'INBOUND' ? (msg.callsign ?? 'PILOT') : (msg.station || msg.speaker)}
              </span>
              <span style={{ color: '#E2E8F0', wordBreak: 'break-word' }}>
                {msg.message}
              </span>
            </div>
          )
        })}
        <div ref={messagesEndRef} />
      </div>
    </div>
  )
}
