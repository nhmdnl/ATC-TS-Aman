import React, { useState, useRef, useEffect, useMemo } from 'react'
import { useGame } from '../state/GameContext'
import { parseCommand } from '../engine/commands/command-parser'

interface Suggestion {
  readonly text: string
  readonly hint: string
}

// Verbs understood by command-parser.ts (canonical long forms; short aliases
// like C/H/S still parse but aren't suggested to keep the list readable).
const VERB_SUGGESTIONS: ReadonlyArray<Suggestion> = [
  { text: 'CLIMB', hint: 'CLIMB <alt> — climb and maintain (e.g. 120 = FL120)' },
  { text: 'DESCEND', hint: 'DESCEND <alt> — descend and maintain' },
  { text: 'HEADING', hint: 'HEADING <deg> — fly heading' },
  { text: 'SPEED', hint: 'SPEED <kt> — assign airspeed' },
  { text: 'SQUAWK', hint: 'SQUAWK <code> — assign transponder code' },
  { text: 'TAXI', hint: 'TAXI RWY <id> — taxi to runway' },
  { text: 'LINEUP', hint: 'line up and wait' },
  { text: 'TAKEOFF', hint: 'cleared for takeoff' },
  { text: 'LAND', hint: 'cleared to land' },
  { text: 'APPROACH', hint: 'cleared approach' },
  { text: 'GO_AROUND', hint: 'execute missed approach' },
  { text: 'HOLD', hint: 'hold short of runway' },
  { text: 'CONTACT', hint: 'CONTACT GND | TWR | DEP — frequency handoff' },
]

export default function CommandInput() {
  const { state, issueCommand } = useGame()
  const [value, setValue] = useState('')
  const [selectedIdx, setSelectedIdx] = useState(0)
  const [dismissed, setDismissed] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const errorTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    inputRef.current?.focus()
    return () => {
      if (errorTimerRef.current) clearTimeout(errorTimerRef.current)
    }
  }, [])

  const suggestions = useMemo((): Suggestion[] => {
    if (dismissed) return []
    const upper = value.toUpperCase()
    const endsWithSpace = /\s$/.test(value)
    const parts = upper.trim() === '' ? [] : upper.trim().split(/\s+/)

    if (parts.length === 1 && !endsWithSpace) {
      // First token: complete against active callsigns
      return Array.from(state.aircraft.values())
        .filter(a => a.callsign.toUpperCase().startsWith(parts[0]) && a.callsign.toUpperCase() !== parts[0])
        .slice(0, 8)
        .map(a => ({ text: a.callsign.toUpperCase(), hint: `${a.type.icao} · ${a.phase}` }))
    }

    if ((parts.length === 1 && endsWithSpace) || (parts.length === 2 && !endsWithSpace)) {
      // Second token: complete against command verbs
      const prefix = parts.length === 2 ? parts[1] : ''
      return VERB_SUGGESTIONS.filter(v => v.text.startsWith(prefix) && v.text !== prefix)
    }

    return []
  }, [value, dismissed, state.aircraft])

  // Keep highlight in range as the list shrinks/grows
  useEffect(() => {
    setSelectedIdx(i => Math.min(i, Math.max(0, suggestions.length - 1)))
  }, [suggestions.length])

  const acceptSuggestion = (s: Suggestion) => {
    // Replace the partial token being typed (if any) with the suggestion
    const endsWithSpace = /\s$/.test(value)
    const base = endsWithSpace ? value : value.replace(/\S*$/, '')
    setValue(`${base}${s.text} `)
    setSelectedIdx(0)
    inputRef.current?.focus()
  }

  const showError = (msg: string) => {
    setError(msg)
    if (errorTimerRef.current) clearTimeout(errorTimerRef.current)
    errorTimerRef.current = setTimeout(() => setError(null), 2500)
  }

  const submit = () => {
    if (!value.trim()) return
    const aircraftList = Array.from(state.aircraft.values())
    const command = parseCommand(value, aircraftList)
    if (command) {
      issueCommand(command)
      setError(null)
    } else {
      showError(`Unrecognized: "${value.trim()}"`)
    }
    setValue('')
    setSelectedIdx(0)
    setDismissed(false)
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (suggestions.length > 0) {
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        setSelectedIdx(i => (i + 1) % suggestions.length)
        return
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault()
        setSelectedIdx(i => (i - 1 + suggestions.length) % suggestions.length)
        return
      }
      if (e.key === 'Tab' || e.key === 'Enter') {
        e.preventDefault()
        acceptSuggestion(suggestions[selectedIdx])
        return
      }
      if (e.key === 'Escape') {
        // Close the popup but keep the text; typing re-opens it
        e.preventDefault()
        setDismissed(true)
        return
      }
    }
    if (e.key === 'Enter') {
      e.preventDefault()
      submit()
    }
  }

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setValue(e.target.value)
    setDismissed(false)
  }

  return (
    <form
      className="panel-bg"
      style={{ height: '100%', display: 'flex', alignItems: 'center', padding: '0 8px', position: 'relative' }}
      onSubmit={(e) => { e.preventDefault(); submit() }}
    >
      {suggestions.length > 0 && (
        <div style={{
          position: 'absolute',
          bottom: '100%',
          left: 8,
          minWidth: 260,
          maxWidth: 420,
          background: '#1e293b',
          border: '1px solid #334155',
          borderRadius: 4,
          zIndex: 100,
          fontSize: 11,
          fontFamily: 'SF Mono, Consolas, monospace',
          overflow: 'hidden',
        }}>
          {suggestions.map((s, i) => (
            <div
              key={s.text}
              onMouseDown={(e) => { e.preventDefault(); acceptSuggestion(s) }}
              onMouseEnter={() => setSelectedIdx(i)}
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                gap: 12,
                padding: '4px 8px',
                cursor: 'pointer',
                background: i === selectedIdx ? '#0ea5e9' : 'transparent',
                color: i === selectedIdx ? '#0f172a' : '#e2e8f0',
              }}
            >
              <span style={{ fontWeight: 600 }}>{s.text}</span>
              <span style={{ color: i === selectedIdx ? '#1e293b' : '#64748b', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{s.hint}</span>
            </div>
          ))}
          <div style={{ padding: '3px 8px', fontSize: 9, color: '#475569', borderTop: '1px solid #334155' }}>
            ↑↓ select · Tab/Enter complete · Esc close
          </div>
        </div>
      )}
      <span style={{ color: '#64748B', fontSize: 11, marginRight: 4 }}>&gt;</span>
      <input
        ref={inputRef}
        id="command-input-field"
        type="text"
        value={value}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        placeholder="Type command..."
        autoComplete="off"
        spellCheck={false}
        style={{
          flex: 1,
          background: 'transparent',
          border: 'none',
          color: '#E2E8F0',
          fontSize: 11,
          fontFamily: 'SF Mono, Consolas, monospace',
          outline: 'none'
        }}
      />
      {error && (
        <span style={{ color: '#ef4444', fontSize: 10, marginLeft: 8, whiteSpace: 'nowrap' }}>{error}</span>
      )}
    </form>
  )
}
