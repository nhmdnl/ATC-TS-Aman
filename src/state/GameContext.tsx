import React, { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react'
import type { GameStateSnapshot, DifficultyLevel, Airport, Command } from '../engine/types'
import { gameState } from '../engine/game-state'
import { processCommand } from '../engine/commands/command-registry'
import { loadAirport, buildTaxiwayGraph } from '../engine/airport-loader'
import { initializeScoringSystem } from '../engine/scoring'
import hhasData from '../data/airports/hhas.airport.json'

// Initialize singletons
initializeScoringSystem()

export interface GameContextType {
  state: GameStateSnapshot
  selectAircraft: (id: string | null) => void
  issueCommand: (command: Command) => void
  togglePause: () => void
  resetGame: () => void
  setDifficulty: (level: DifficultyLevel) => void
  startSession: () => void
  muted: boolean
  toggleMute: () => void
}

const GameContext = createContext<GameContextType | null>(null)

export function GameProvider({ children }: { children: ReactNode }) {
  const [snapshot, setSnapshot] = useState<GameStateSnapshot>(gameState.snapshot())
  const [muted, setMuted] = useState(false)
  const toggleMute = useCallback(() => setMuted(m => !m), [])

  // Initial load
  useEffect(() => {
    if (!gameState.airport) {
      try {
        const airport = loadAirport(hhasData)
        gameState.airport = airport
        gameState.taxiwayGraph = buildTaxiwayGraph(airport)
        // Ensure state is properly initialized
        gameState.reset()
        setSnapshot(gameState.snapshot())
      } catch (err) {
        console.error('Failed to load airport:', err)
      }
    }
  }, [])

  // Expose a way to force a re-render from the game loop
  useEffect(() => {
    // In useGameLoop hook, we will update this snapshot at 60 FPS
    // For now, we attach it to window so useGameLoop can call it easily without context circular dependency
    ;(window as any)._updateGameSnapshot = () => {
      setSnapshot(gameState.snapshot())
    }
    return () => {
      delete (window as any)._updateGameSnapshot
    }
  }, [])

  const selectAircraft = (id: string | null) => {
    gameState.selectAircraft(id)
    setSnapshot(gameState.snapshot())
  }

  const issueCommand = (command: Command) => {
    if (gameState.airport) {
      processCommand(command, gameState.airport)
      setSnapshot(gameState.snapshot())
    }
  }

  const togglePause = () => {
    gameState.paused = !gameState.paused
    setSnapshot(gameState.snapshot())
  }

  const resetGame = () => {
    gameState.reset()
    setSnapshot(gameState.snapshot())
  }

  const setDifficulty = (level: DifficultyLevel) => {
    gameState.setDifficulty(level)
    setSnapshot(gameState.snapshot())
  }

  const startSession = () => {
    gameState.sessionStarted = true
    setSnapshot(gameState.snapshot())
  }

  const value: GameContextType = {
    state: snapshot,
    selectAircraft,
    issueCommand,
    togglePause,
    resetGame,
    setDifficulty,
    startSession,
    muted,
    toggleMute
  }

  return <GameContext.Provider value={value}>{children}</GameContext.Provider>
}

export function useGame() {
  const context = useContext(GameContext)
  if (!context) {
    throw new Error('useGame must be used within a GameProvider')
  }
  return context
}
