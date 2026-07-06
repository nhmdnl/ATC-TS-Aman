---
name: atc-aman-container-ui
description: Container-based UI layout for Electron + React + PixiJS ATC sim games with command buttons as primary interaction, command tabs, flight strips, radar zoom/pan, keyboard shortcuts, briefing screen, and 144 Vitest engine tests
source: auto-skill
extracted_at: '2026-07-04T11:41:02.496Z'
---

# ATC Aman Container UI — Build Procedure

Use this when building the interaction layer for a real-time ATC simulation game (or similar command-and-control UI) on Electron + React + PixiJS. The pattern: **click entity on radar → click command button** as primary interaction, text input secondary.

## Architecture

### Container Layout (5 containers)

```
┌──────────────────────────────────────────────────────────────┐
│                      STATUS BAR                              │
├────────┬────────────────────────────┬────────────────────────┤
│ AIR-   │                            │ COMMANDS (tabs:        │
│ STRIPS │       RADAR                │ GND|TWR|APP)          │
│ (left  │       (PixiJS)             │ command buttons       │
│ panel) │                            │ + inline params       │
│ 220px  │                            │ 280px                 │
├────────┴────────────────────────────┴────────────────────────┤
│              COMMAND INPUT (secondary, 28px)                 │
├──────────────────────────────────────────────────────────────┤
│                 RADIO LOG (communication, 140px)             │
└──────────────────────────────────────────────────────────────┘
```

### Component Responsibilities

| Component | File | Role |
|-----------|------|------|
| `App.tsx` | `src/App.tsx` | Container layout, screen router (briefing → game → results) |
| `StatusBar` | `src/components/StatusBar.tsx` | Score, time, air/ground counts, pause button |
| `FlightStrips` | `src/components/FlightStrips.tsx` | DEP/ARR aircraft list, click-to-select |
| `RadarCanvas` | `src/components/RadarCanvas.tsx` | PixiJS canvas: runways, range rings, aircraft blips, data blocks, trails, vectors |
| `CommandPanel` | `src/components/CommandPanel.tsx` | Tab bar (GND/TWR/APP), 16 command buttons, inline param input |
| `CommandInput` | `src/components/CommandInput.tsx` | Text input with command parser (secondary) |
| `RadioLog` | `src/components/RadioLog.tsx` | Scrollable ATC/pilot/system message log |
| `EndScreen` | `src/components/EndScreen.tsx` | Session results overlay |
| `BriefingScreen` | `src/components/BriefingScreen.tsx` | Difficulty selection at startup |
| `AircraftList` | `src/components/AircraftList.tsx` | (optional) overlay list if FlightStrips not used |

### State Management

```
React Context (GameContext.tsx)
  └─ state: GameStateSnapshot (read-only per-frame snapshot)
  └─ actions: selectAircraft, issueCommand, togglePause, resetGame, setDifficulty

useGameLoop.ts — requestAnimationFrame loop, 1 Hz sim tick
useAudio.ts — Web Audio beeps + SpeechSynthesis TTS
useKeyboardShortcuts.ts — global keydown handler
```

## Key Design Decisions

### Command Buttons as Primary Interaction

```tsx
// Flow: select aircraft → click tab → click button → command with readback
// CommandPanel.tsx structure:
// 1. Tab bar: GROUND (121.9) | TOWER (118.1) | APPROACH (120.7)
// 2. CONTROLLER_COMMANDS[station] determines which buttons are shown
// 3. PHASE_COMMANDS[aircraft.phase] filters enabled/disabled
// 4. Commands needing params (VECTOR, ALTITUDE, SPEED, SQUAWK) show inline input row
```

### Command Tab Configuration

```tsx
const STATION_TABS = [
  { station: ControllerStation.GROUND, frequency: 121.9, label: 'GND' },
  { station: ControllerStation.TOWER, frequency: 118.1, label: 'TWR' },
  { station: ControllerStation.APPROACH, frequency: 120.7, label: 'APP' },
]
```

### Command Labels (ICAO shorthand)

```tsx
const COMMAND_LABELS: Record<CommandType, string> = {
  TAXI: 'TAXI', HOLD_SHORT: 'HOLD SHORT', LINE_UP_WAIT: 'LINE UP',
  CLEARED_TAKEOFF: 'CLR T/OFF', CLEARED_LAND: 'CLR LAND',
  CLEARED_APPROACH: 'CLR APPR', VECTOR: 'VECTOR', ALTITUDE: 'ALTITUDE',
  SPEED: 'SPEED', SQUAWK: 'SQUAWK', CONTACT_DEPARTURE: 'DEPARTURE',
  CONTACT_TOWER: 'CONTACT TWR', CONTACT_GROUND: 'CONTACT GND',
  GO_AROUND: 'GO AROUND', EXIT_RUNWAY: 'EXIT RWY', CANCEL_TAXI: 'CNCL TAXI',
}
```

### Flight Strips Pattern

```tsx
// Each strip card: colored left border (green=dep, blue=arr)
// Show: callsign (bold), type (icao), phase (abbrev), altitude (GND or hundreds), speed
// Click to select (background #1E3A5F), click again to deselect
// Urgent aircraft: amber dot; inViolation: red dot
// PHASE_ABBREV map: PARKED→PARK, TAXI_OUT→TAXI, HOLD_SHORT→HOLD, etc.
```

### Radar Zoom/Pan (PixiJS 8)

```tsx
// Zoom state stored in refs (zoomRef, offsetXRef, offsetYRef) — no re-renders
// Wheel event: zoom +/- 1 per notch, clamped [5, 60]
//   compute world coords under cursor before zoom
//   derive new offset to keep cursor point fixed
// Click-drag: pointer capture with 3px dead-zone
//   setPointerCapture, pointermove→update offset, pointerup→release
// Cursor: crosshair default, grabbing while dragging
// Combined coordinate mapping:
//   mapX(x) = cx + (x * zoom) + offsetX
//   mapY(y) = cy - (y * zoom) + offsetY
```

### Keyboard Shortcuts

| Key | Action |
|-----|--------|
| `/` | Focus command input |
| `Space` | Pause/resume |
| `Escape` | Deselect aircraft |
| `Tab` | Cycle selected aircraft |
| `C` | Center radar viewport |
| `R` | Toggle ruler |
| `T` | Toggle tutorial |
| `O` | Toggle mission tracker |
| `G` | Toggle guide panel |
| `+`/`-` | Zoom in/out |
| `0` | Reset radar viewport |
| `M` | Toggle TTS mute |

Use `CustomEvent` dispatch for radar commands so RadarCanvas listens without tight coupling. Track `isInputFocused` ref to prevent firing shortcuts during text entry.

### Briefing Screen

Difficulty selection at startup with stat previews:
- Spawn interval, max traffic, wind, session duration
- Presets: Easy (45s/5/340°4kt/15min), Medium (25s/8/70°8kt/15min), Hard (12s/12/90°15kt/30min)

## Testing

### Vitest Setup

```bash
npm install -D vitest
```

`vitest.config.ts` — reference `vite.config.ts` for resolve aliases, enable globals.

### Test Structure (5 files, 144 tests)

| File | Tests | What |
|------|-------|------|
| `movement.test.ts` | 25 | `normalizeHeading`, `distanceNM`, `headingToRadians`, `turnToward` |
| `separation.test.ts` | 14 | `SeparationChecker` pairs, airborne filtering, cooldowns |
| `game-state.test.ts` | 43 | `GameState` singleton: CRUD, scoring, grades, snapshot |
| `constants.test.ts` | 30 | Score deltas, grade thresholds, difficulty presets, phase maps |
| `aircraft-factory.test.ts` | 32 | `spawnDeparture`, `spawnArrival` contracts |

All pure TS — no DOM, no Electron, no PixiJS needed.

## Build Verification

```bash
# TypeScript — 0 errors
npx tsc --noEmit

# Vite build — passes
npx vite build

# Tests — all pass
npx vitest run
```

## File Organization

```
src/
├── components/
│   ├── StatusBar.tsx
│   ├── FlightStrips.tsx
│   ├── AircraftList.tsx       (optional overlay alternative)
│   ├── RadarCanvas.tsx
│   ├── CommandPanel.tsx
│   ├── CommandInput.tsx
│   ├── RadioLog.tsx
│   ├── EndScreen.tsx
│   └── BriefingScreen.tsx
├── state/
│   ├── GameContext.tsx
│   ├── useGameLoop.ts
│   ├── useAudio.ts
│   └── useKeyboardShortcuts.ts
├── engine/                    (game logic, pure TS)
│   ├── types.ts
│   ├── constants.ts
│   ├── game-state.ts
│   ├── event-bus.ts
│   ├── aircraft-factory.ts
│   ├── movement.ts
│   ├── separation.ts
│   ├── phase-transitions.ts
│   ├── simulation-tick.ts
│   ├── airport-loader.ts
│   ├── scoring.ts
│   ├── mission-system.ts
│   ├── career-system.ts
│   ├── commands/
│   │   ├── command-registry.ts
│   │   ├── command-parser.ts
│   │   ├── command-executor.ts
│   │   ├── command-validators.ts
│   │   └── phraseology.ts
│   └── __tests__/
│       ├── movement.test.ts
│       ├── separation.test.ts
│       ├── game-state.test.ts
│       ├── constants.test.ts
│       └── aircraft-factory.test.ts
└── App.tsx
```

## Ponytail Conventions (mark deliberate simplifications)

Leave `ponytail:` comments in code when:
- Flat random callsign → sequential when flight schedule added
- Lazy `require()` to break circular dep → extract shared lookup when more validators
- Instant taxi heading snap → pathfinding when taxiway graph connected
- Hardcoded HHAS missed approach → load from airport data for multi-airport
- Hardcoded MVA floor → per-quadrant from airport data
- Always picks first runway → wind-based runway selection
- Hardcoded zoom 15 → dynamic zoom when scroll-to-zoom implemented
