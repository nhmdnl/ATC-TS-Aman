import { useEffect, useRef } from 'react'
import { gameState } from '../engine/game-state'

/**
 * Global keyboard shortcuts for the game.
 * Most commands emit actions by mutating gameState directly + triggering React updates
 * via the attached _updateGameSnapshot callback.
 */
export function useKeyboardShortcuts() {
  // Track whether input is focused (don't fire shortcuts during text entry)
  const isInputFocused = useRef(false)

  useEffect(() => {
    // Listen for focus events on the command input
    const detectFocus = (e: FocusEvent) => {
      const el = e.target as HTMLElement
      isInputFocused.current = el.tagName === 'INPUT' || el.tagName === 'TEXTAREA'
    }
    document.addEventListener('focusin', detectFocus)
    document.addEventListener('focusout', () => { isInputFocused.current = false })

    const handleKeyDown = (e: KeyboardEvent) => {
      const key = e.key.toLowerCase()

      // '/' — toggle command input focus
      if (key === '/' && !isInputFocused.current) {
        e.preventDefault()
        const input = document.querySelector<HTMLInputElement>('#command-input-field')
        input?.focus()
        return
      }

      // If user is typing in an input, don't fire game shortcuts
      if (isInputFocused.current) return

      switch (key) {
        case ' ': {
          // Space — pause/resume
          e.preventDefault()
          gameState.paused = !gameState.paused
          break
        }
        case 'escape': {
          // Escape — deselect aircraft
          gameState.selectAircraft(null)
          break
        }
        case 'tab': {
          // Tab — cycle selected aircraft
          e.preventDefault()
          const aircraft = Array.from(gameState.aircraft.values())
          if (aircraft.length === 0) break
          const currentIdx = gameState.selectedAircraftId
            ? aircraft.findIndex((a) => a.id === gameState.selectedAircraftId)
            : -1
          const nextIdx = (currentIdx + 1) % aircraft.length
          gameState.selectAircraft(aircraft[nextIdx].id)
          break
        }
        case 'c': {
          // C — center viewport (dispatch custom event for RadarCanvas)
          window.dispatchEvent(new CustomEvent('radar-center'))
          break
        }
        case 'r': {
          // R — toggle ruler (dispatch custom event)
          window.dispatchEvent(new CustomEvent('radar-toggle-ruler'))
          break
        }
        case 't': {
          // T — toggle tutorial
          window.dispatchEvent(new CustomEvent('toggle-tutorial'))
          break
        }
        case 'o': {
          // O — toggle mission tracker
          window.dispatchEvent(new CustomEvent('toggle-mission-tracker'))
          break
        }
        case 'g': {
          // G — toggle guide panel
          window.dispatchEvent(new CustomEvent('toggle-guide-panel'))
          break
        }
        case '+':
        case '=': {
          // + — zoom in
          window.dispatchEvent(new CustomEvent('radar-zoom-in'))
          break
        }
        case '-': {
          // - — zoom out
          window.dispatchEvent(new CustomEvent('radar-zoom-out'))
          break
        }
        case '0': {
          // 0 — reset viewport
          window.dispatchEvent(new CustomEvent('radar-reset-view'))
          break
        }
      }

      // Trigger React update
      ;(window as any)._updateGameSnapshot?.()
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => {
      window.removeEventListener('keydown', handleKeyDown)
      document.removeEventListener('focusin', detectFocus)
      document.removeEventListener('focusout', () => {})
    }
  }, [])
}
