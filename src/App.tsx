import { useCallback, useEffect, useRef, useState } from 'react'
import StatusBar from './components/StatusBar'
import FlightStrips from './components/FlightStrips'
import CommandPanel from './components/CommandPanel'
import CommandInput from './components/CommandInput'
import RadioLog from './components/RadioLog'
import RadarCanvas from './components/RadarCanvas'
import EndScreen from './components/EndScreen'
import BriefingScreen from './components/BriefingScreen'
import MissionTracker from './components/MissionTracker'
import GuidePanel from './components/GuidePanel'
import TutorialOverlay from './components/TutorialOverlay'
import TutorialMenu from './components/TutorialMenu'
import PauseMenu from './components/PauseMenu'
import { GameProvider, useGame } from './state/GameContext'
import { useGameLoop } from './state/useGameLoop'
import { useAudio } from './state/useAudio'
import { useKeyboardShortcuts } from './state/useKeyboardShortcuts'
import { CSS_COLORS } from './engine/constants'

const LAYOUT = {
  STATUS_BAR_H: 36,
  FLIGHT_STRIPS_W: 220,
  COMMANDS_W: 280,
  COMMAND_INPUT_H: 28,
  RADIO_LOG_H: 140,
} as const

function GameUI() {
  useGameLoop()
  const { state, muted, toggleMute, togglePause } = useGame()
  const { ttsAvailable } = useAudio(muted, toggleMute)
  useKeyboardShortcuts()

  const [tutorialMenuOpen, setTutorialMenuOpen] = useState(false)
  const [activeTutorialTopicId, setActiveTutorialTopicId] = useState<string | null>(null)
  const weTutorialPausedRef = useRef(false)

  // T key: fully close whatever tutorial UI is open, or open the menu if
  // nothing is. (Esc while inside a topic steps back to the menu instead —
  // handled by TutorialOverlay itself via onBack.)
  useEffect(() => {
    const onToggle = () => {
      if (activeTutorialTopicId !== null || tutorialMenuOpen) {
        setActiveTutorialTopicId(null)
        setTutorialMenuOpen(false)
      } else {
        setTutorialMenuOpen(true)
      }
    }
    window.addEventListener('toggle-tutorial', onToggle)
    return () => window.removeEventListener('toggle-tutorial', onToggle)
  }, [activeTutorialTopicId, tutorialMenuOpen])

  const tutorialUIOpen = tutorialMenuOpen || activeTutorialTopicId !== null

  const handleTutorialSelect = useCallback((topicId: string) => {
    setActiveTutorialTopicId(topicId)
    setTutorialMenuOpen(false)
  }, [])
  const handleTutorialMenuClose = useCallback(() => {
    setTutorialMenuOpen(false)
  }, [])
  const handleTutorialBack = useCallback(() => {
    setActiveTutorialTopicId(null)
    setTutorialMenuOpen(true)
  }, [])

  // Auto-pause a running session for as long as any tutorial UI is open;
  // only resume it on close if this effect was the one that paused it, so a
  // player who paused manually first doesn't get surprise-resumed.
  useEffect(() => {
    if (tutorialUIOpen) {
      if (state.sessionStarted && !state.paused) {
        togglePause()
        weTutorialPausedRef.current = true
      }
    } else if (weTutorialPausedRef.current) {
      togglePause()
      weTutorialPausedRef.current = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tutorialMenuOpen, activeTutorialTopicId])

  const mainH = `calc(100vh - ${LAYOUT.STATUS_BAR_H}px - ${LAYOUT.COMMAND_INPUT_H}px - ${LAYOUT.RADIO_LOG_H}px)`

  return (
    <>
      {!state.sessionStarted && <BriefingScreen />}

      <div style={{ width: '100vw', height: '100vh', display: 'flex', flexDirection: 'column', background: CSS_COLORS.bg.primary, color: CSS_COLORS.text.primary }}>
        {/* Status Bar */}
        <div id="status-bar-container" style={{ height: LAYOUT.STATUS_BAR_H, flexShrink: 0, zIndex: 10 }}>
          <StatusBar ttsAvailable={ttsAvailable} />
        </div>

        {/* Main: air-strip | radar | commands */}
        <div style={{ height: mainH, display: 'flex', overflow: 'hidden' }}>
          <div id="flight-strips-container" style={{ width: LAYOUT.FLIGHT_STRIPS_W, flexShrink: 0, borderRight: '1px solid #1D2430', display: 'flex', flexDirection: 'column' }}>
            <div style={{ fontSize: 9, textTransform: 'uppercase', letterSpacing: 1, color: CSS_COLORS.text.muted, padding: '4px 8px', background: CSS_COLORS.bg.surface, borderBottom: '1px solid #1D2430', flexShrink: 0 }}>
              Air-strip Container
            </div>
            <div style={{ flex: 1, overflow: 'hidden' }}>
              <FlightStrips />
            </div>
          </div>

          <div id="radar-container" style={{ flex: 1, minWidth: 0, position: 'relative', background: CSS_COLORS.bg.primary }}>
            <RadarCanvas />
            <MissionTracker />
            <GuidePanel />
          </div>

          <div id="commands-container" style={{ width: LAYOUT.COMMANDS_W, flexShrink: 0, borderLeft: '1px solid #1D2430', display: 'flex', flexDirection: 'column' }}>
            <div style={{ fontSize: 9, textTransform: 'uppercase', letterSpacing: 1, color: CSS_COLORS.text.muted, padding: '4px 8px', background: CSS_COLORS.bg.surface, borderBottom: '1px solid #1D2430', flexShrink: 0 }}>
              Commands Container
            </div>
            <div style={{ flex: 1, overflow: 'hidden' }}>
              <CommandPanel />
            </div>
          </div>
        </div>

        {/* Command Input (secondary) */}
        <div id="command-input-container" style={{ height: LAYOUT.COMMAND_INPUT_H, flexShrink: 0, borderTop: '1px solid #1D2430', zIndex: 10 }}>
          <CommandInput />
        </div>

        {/* Radio Log (communication container) */}
        <div id="radio-log-container" style={{ height: LAYOUT.RADIO_LOG_H, flexShrink: 0, borderTop: '1px solid #1D2430', zIndex: 10 }}>
          <div style={{ fontSize: 9, textTransform: 'uppercase', letterSpacing: 1, color: CSS_COLORS.text.muted, padding: '2px 8px', background: CSS_COLORS.bg.surface, borderBottom: '1px solid #1D2430' }}>
            Communication Container
          </div>
          <div style={{ height: 'calc(100% - 22px)' }}>
            <RadioLog />
          </div>
        </div>

        {/* Suppressed while tutorial UI is open: same bleed-through issue as
            PauseMenu below — EndScreen is a full-screen overlay at zIndex
            1000 mounted whenever a session has ended, and the T shortcut is
            not gated on session-end state, so it would otherwise render
            underneath the tutorial overlay simultaneously. */}
        {!tutorialUIOpen && <EndScreen />}
        <TutorialMenu
          open={tutorialMenuOpen}
          onSelect={handleTutorialSelect}
          onClose={handleTutorialMenuClose}
        />
        <TutorialOverlay
          topicId={activeTutorialTopicId}
          onBack={handleTutorialBack}
        />
        {/* Suppressed while tutorial UI is open: the tutorial system pauses
            the session itself, and PauseMenu's own "state.paused" check would
            otherwise mount it underneath the tutorial overlay simultaneously
            (visually bleeding through smaller, centered tutorial cards). */}
        {!tutorialUIOpen && <PauseMenu />}
      </div>
    </>
  )
}

export default function App() {
  return (
    <GameProvider>
      <GameUI />
    </GameProvider>
  )
}
