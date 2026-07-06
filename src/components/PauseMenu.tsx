import React from 'react'
import { useGame } from '../state/GameContext'
import type { DifficultyLevel } from '../engine/types'

function buttonStyle(variant: 'primary' | 'default'): React.CSSProperties {
  return {
    padding: '10px 24px',
    background: variant === 'primary' ? '#22C55E' : '#1D2430',
    color: '#FFF',
    border: variant === 'primary' ? 'none' : '1px solid #334155',
    borderRadius: 4,
    cursor: 'pointer',
    fontWeight: 700,
    fontSize: 13,
    fontFamily: 'inherit',
  }
}

export default function PauseMenu() {
  const { state, togglePause, resetGame, setDifficulty, startSession, muted, toggleMute } = useGame()

  if (!(state.paused && state.sessionStarted && !state.sessionEnded)) return null

  const handleRestart = () => {
    const level = state.difficulty as DifficultyLevel
    resetGame()
    setDifficulty(level)
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
        background: '#161B22',
        border: '1px solid #1D2430',
        borderRadius: 8,
        padding: 32,
        minWidth: 260,
      }}>
        <h1 style={{ margin: '0 0 20px', color: '#0EA5E9', fontSize: 20, fontWeight: 700, textAlign: 'center' }}>
          PAUSED
        </h1>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <button style={buttonStyle('primary')} onClick={togglePause}>RESUME</button>
          <button style={buttonStyle('default')} onClick={handleRestart}>RESTART SESSION</button>
          <button style={buttonStyle('default')} onClick={toggleMute}>{muted ? 'UNMUTE' : 'MUTE'}</button>
          <button style={buttonStyle('default')} onClick={resetGame}>MAIN MENU</button>
          {window.electronAPI && (
            <button
              style={buttonStyle('default')}
              onClick={() => window.electronAPI.send('app-quit', null)}
            >
              QUIT TO DESKTOP
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
