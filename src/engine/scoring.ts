import { GameEventType, ScoreReason } from './types'
import type { GameEvent } from './types'
import { eventBus } from './event-bus'
import { gameState } from './game-state'
import { SCORE_DELTAS, DIMENSION_DELTAS } from './constants'

export function initializeScoringSystem(): void {
  // Listen to events and map to score deltas
  eventBus.on(GameEventType.COMMAND_ISSUED, (e: GameEvent) => handleScoreEvent('command_issued', e))
  eventBus.on(GameEventType.TAKEOFF, (e: GameEvent) => handleScoreEvent('takeoff', e))
  eventBus.on(GameEventType.LANDING, (e: GameEvent) => handleScoreEvent('landing', e))
  eventBus.on(GameEventType.ARRIVED_GATE, (e: GameEvent) => handleScoreEvent('arrived_gate', e))
  eventBus.on(GameEventType.MISSED_APPROACH, (e: GameEvent) => handleScoreEvent('missed_approach', e))
  eventBus.on(GameEventType.SEPARATION_VIOLATION, (e: GameEvent) => handleScoreEvent('separation_violation', e))
  
  // Handoffs currently mapped from COMMAND_ISSUED (CONTACT_* commands) but we could listen to a dedicated event
  eventBus.on(GameEventType.COMMAND_ISSUED, (e: GameEvent) => {
    const type = e.payload.commandType as string
    if (['CONTACT_DEPARTURE', 'CONTACT_TOWER', 'CONTACT_GROUND'].includes(type)) {
      handleScoreEvent('departure_handoff', e)
    }
  })
}

function handleScoreEvent(reason: ScoreReason, e: GameEvent): void {
  const callsign = (e.payload.callsign as string) || 'UNKNOWN'
  const delta = SCORE_DELTAS[reason]
  
  // Apply raw score
  gameState.addScoreEvent({
    timestamp: e.timestamp,
    delta,
    reason,
    callsign
  })

  // Apply dimension deltas
  const dims = DIMENSION_DELTAS[reason]
  gameState.scoreDimensions.safety = Math.max(0, gameState.scoreDimensions.safety + dims.safety)
  gameState.scoreDimensions.efficiency = Math.max(0, gameState.scoreDimensions.efficiency + dims.efficiency)
  gameState.scoreDimensions.communication = Math.max(0, gameState.scoreDimensions.communication + dims.communication)
  gameState.scoreDimensions.procedure = Math.max(0, gameState.scoreDimensions.procedure + dims.procedure)
  gameState.scoreDimensions.awareness = Math.max(0, gameState.scoreDimensions.awareness + dims.awareness)

  // Track aircraft handled
  if (reason === 'takeoff' || reason === 'landing' || reason === 'departure_handoff') {
    gameState.aircraftHandled++
  }

  // Tell UI score changed
  eventBus.emit(GameEventType.SCORE_CHANGED, { score: gameState.score, delta, reason })
}
