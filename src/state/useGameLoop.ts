import { useEffect, useRef } from 'react'
import { gameState } from '../engine/game-state'
import { tick } from '../engine/simulation-tick'
import { SIM_TICK_INTERVAL_MS } from '../engine/constants'
import { missionSystem } from '../engine/mission-system'

export function useGameLoop() {
  const requestRef = useRef<number>(0)
  const lastTickRef = useRef<number>(Date.now())

  useEffect(() => {
    const loop = () => {
      const now = Date.now()

      // Fixed timestep logic for simulation tick (~1 Hz). At higher sim
      // rates the same fixed tick runs N times per gate — sim time simply
      // advances N seconds per gate while physics/phase logic stays fixed-step.
      if (now - lastTickRef.current >= SIM_TICK_INTERVAL_MS) {
        const rate = Math.max(1, Math.min(4, gameState.simRate))
        for (let i = 0; i < rate; i++) {
          tick(gameState, 1.0)
        }

        // Update mission system
        missionSystem.update(gameState.snapshot())

        lastTickRef.current = now
      }

      // Update React state at 60 FPS for smooth UI interpolation
      if ((window as any)._updateGameSnapshot) {
        ;(window as any)._updateGameSnapshot()
      }

      requestRef.current = requestAnimationFrame(loop)
    }

    requestRef.current = requestAnimationFrame(loop)

    return () => cancelAnimationFrame(requestRef.current)
  }, [])
}
