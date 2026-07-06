import React, { useEffect, useRef } from 'react'
import { useGame } from '../state/GameContext'

export default function RadioLog() {
  const { state } = useGame()
  const messagesEndRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [state.radioMessages])

  return (
    <div className="panel-bg" style={{ height: '100%', padding: 4, display: 'flex', flexDirection: 'column' }}>
      <div style={{ padding: '4px 8px', fontSize: 10, fontWeight: 600, color: '#64748B', borderBottom: '1px solid #1E293B', flexShrink: 0 }}>
        RADIO COMMS
      </div>
      
      <div style={{ flex: 1, overflowY: 'auto', padding: '4px 8px', display: 'flex', flexDirection: 'column', gap: 4 }}>
        {state.radioMessages.map((msg, i) => (
          <div key={i} style={{ display: 'flex', gap: 8, fontSize: 11, fontFamily: 'SF Mono, Consolas, monospace' }}>
            <span style={{ color: '#475569', minWidth: 40 }}>
              {new Date(msg.timestamp).toISOString().substring(11, 19)}
            </span>
            <span style={{ color: msg.speaker === 'ATC' ? '#0ea5e9' : msg.speaker === 'CRITICAL' ? '#ef4444' : '#22c55e', minWidth: 45 }}>
              {msg.station || msg.speaker}
            </span>
            <span style={{ color: '#E2E8F0', wordBreak: 'break-word' }}>
              {msg.message}
            </span>
          </div>
        ))}
        <div ref={messagesEndRef} />
      </div>
    </div>
  )
}
