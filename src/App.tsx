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
  useAudio()
  useKeyboardShortcuts()
  const { state } = useGame()

  const mainH = `calc(100vh - ${LAYOUT.STATUS_BAR_H}px - ${LAYOUT.COMMAND_INPUT_H}px - ${LAYOUT.RADIO_LOG_H}px)`

  return (
    <>
      {!state.sessionStarted && <BriefingScreen />}

      <div style={{ width: '100vw', height: '100vh', display: 'flex', flexDirection: 'column', background: CSS_COLORS.bg.primary, color: CSS_COLORS.text.primary }}>
        {/* Status Bar */}
        <div id="status-bar-container" style={{ height: LAYOUT.STATUS_BAR_H, flexShrink: 0, zIndex: 10 }}>
          <StatusBar />
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

        <EndScreen />
        <TutorialOverlay />
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
