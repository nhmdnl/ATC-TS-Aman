import React, { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react'
import type { GameStateSnapshot, DifficultyLevel, Airport, Command, ControllerStation } from '../engine/types'
import { gameState } from '../engine/game-state'
import { processCommand } from '../engine/commands/command-registry'
import { buildTaxiwayGraph } from '../engine/airport-loader'
import { trafficScheduler } from '../engine/traffic-scheduler'
import { initializeScoringSystem } from '../engine/scoring'
import { AIRPORTS, getAirportEntry, type AirportEntry } from './airport-registry'

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
  setPlayerStations: (stations: ControllerStation[]) => void
  muted: boolean
  toggleMute: () => void
  airports: ReadonlyArray<AirportEntry>
  selectedAirportId: string
  setAirport: (id: string) => void
}

const GameContext = createContext<GameContextType | null>(null)

export function GameProvider({ children }: { children: ReactNode }) {
  const [snapshot, setSnapshot] = useState<GameStateSnapshot>(gameState.snapshot())
  const [muted, setMuted] = useState(false)
  const [selectedAirportId, setSelectedAirportId] = useState<string>(AIRPORTS[0]?.id ?? '')
  const toggleMute = useCallback(() => setMuted(m => !m), [])

  // 'M' keyboard shortcut dispatches this window event (see useKeyboardShortcuts)
  useEffect(() => {
    const onToggleMute = () => toggleMute()
    window.addEventListener('toggle-mute', onToggleMute)
    return () => window.removeEventListener('toggle-mute', onToggleMute)
  }, [toggleMute])

  const applyAirport = useCallback((entry: AirportEntry) => {
    gameState.airport = entry.airport
    gameState.taxiwayGraph = buildTaxiwayGraph(entry.airport)
    gameState.reset()
    trafficScheduler.reset()
    setSelectedAirportId(entry.id)
    setSnapshot(gameState.snapshot())
  }, [])

  // Initial load — first registry entry (HHAS sorts first)
  useEffect(() => {
    if (!gameState.airport && AIRPORTS.length > 0) {
      applyAirport(AIRPORTS[0])
    }
  }, [applyAirport])

  const setAirport = useCallback((id: string) => {
    const entry = getAirportEntry(id)
    if (entry && !gameState.sessionStarted) {
      applyAirport(entry)
    }
  }, [applyAirport])

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
    trafficScheduler.reset()
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

  const setPlayerStations = (stations: ControllerStation[]) => {
    gameState.playerStations = stations
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
    setPlayerStations,
    muted,
    toggleMute,
    airports: AIRPORTS,
    selectedAirportId,
    setAirport
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
