# ATC Aman — Systematic Codebase Exploration

**Generated:** 2026-07-11  
**Total source files:** 56 (38 `.ts`, 16 `.tsx`, 2 `electron/*.ts`)  
**Test files:** 10 (colocated in `src/engine/__tests__/`, node environment, no DOM)

---

## Section A: Per-File Entries

### Config & Build

#### `package.json`
- **Responsibility:** Project manifest — defines scripts, dependencies, electron-builder config.
- **Key exports:** Scripts: `dev` (Vite HMR + Electron concurrently), `build`, `test`, `lint`, `typecheck`, `package`.
- **Dependencies:** pixi.js ^8.6.6, react ^19.1.0, react-dom ^19.1.0.
- **DevDependencies:** vite ^6.3.2, vitest ^4.1.9, electron ^35.7.5, typescript ^5.8.3, electron-builder ^26.0.12.

#### `tsconfig.json`
- **Responsibility:** Renderer TS config — target ES2022, `react-jsx`, `@/` alias → `src/`.
- **Key exports:** `compilerOptions.noEmit: true` (Vite handles output).

#### `tsconfig.main.json`
- **Responsibility:** Electron main process TS config — CommonJS output to `dist-electron/`.
- **Key exports:** `rootDir: "electron"`, `outDir: "dist-electron"`.

#### `vite.config.ts`
- **Responsibility:** Vite build config with React plugin, `@/` alias, port 5173.
- **Feeds into:** Vite build; also used by vitest via vitest.config.ts `resolve.alias`.

#### `vitest.config.ts`
- **Responsibility:** Vitest config — `environment: 'node'`, `@/` alias.
- **Depends on:** `vite.config.ts` (resolve alias pattern copied).

#### `index.html`
- **Responsibility:** HTML shell with CSP (`default-src 'self'`, script/style restricted) plus `pixi.js/unsafe-eval` import.

---

### Electron Main Process

#### `electron/main.ts`
- **Responsibility:** Creates BrowserWindow (1280x720, non-resizable, kiosk-style), loads Vite dev URL or dist/index.html.
- **Key exports:** `createWindow()`, `app.commandLine.appendSwitch('enable-speech-dispatcher')` (Linux TTS workaround).
- **Depends on:** `electron` (app, BrowserWindow, Menu, ipcMain).
- **Ponytail:** Hardcoded dev/prod switch.

#### `electron/preload.ts`
- **Responsibility:** contextBridge — exposes `electronAPI.platform`, `onMenuAction`, `send`.
- **Key exports:** `window.electronAPI` (typed in `src/types/electron.d.ts`).
- **Ponytail:** Two IPC channels — expand for game-state sync / file dialogs.

---

### Renderer Entry Points

#### `src/main.tsx`
- **Responsibility:** React DOM entry — `StrictMode` wrapping `<App />`, mounts on `#root`.
- **Depends on:** `App`, `index.css`.

#### `src/App.tsx`
- **Responsibility:** Top-level layout — 5-container shell + overlay wiring.
- **Key exports:** `App` (default), `GameUI` inner component.
- **Key sections:**
  - 5 layout containers: `#status-bar-container` → `#flight-strips-container` | `#radar-container` | `#commands-container` → `#command-input-container` → `#radio-log-container`
  - Overlay management: `EndScreen` suppressed during tutorial; `PauseMenu` suppressed during tutorial; tutorial auto-pause via `weTutorialPausedRef`
- **Depends on:** 13 component imports, `GameProvider`, `useGameLoop`, `useAudio`, `useKeyboardShortcuts`, `CSS_COLORS`.

#### `src/types/electron.d.ts`
- **Responsibility:** Type declarations for `window.electronAPI`.

---

### Core Engine — Types & Constants

#### `src/engine/types.ts`
- **Responsibility:** All domain type definitions — enums, interfaces, type aliases for the entire simulation.
- **Key exports:**
  - Enums: `AircraftPhase` (15 values, departure/arrival/missed flow), `ControllerStation` (GND/TWR/APP/AREA), `CommandType` (16 values), `GameEventType` (16 values), `FlightType`, `DifficultyLevel`, `Grade`, `ScoreReason`, `RadioSpeaker`
  - Interfaces: `Aircraft` (24 fields), `RunwayData`, `TaxiwayNode/Edge/Data`, `GateData`, `Command`, `CommandParams`, `CommandResult`, `ScoreEvent`, `ScoreDimensions`, `DifficultyPreset`, `GameEvent`, `RadioMessage`, `Mission`, `CareerState`, `GameStateSnapshot`, `Airport`, `TaxiwayGraph`, `Wind`, plus diagram types
- **Feeds into:** Every engine file, most React files, tests.

#### `src/engine/constants.ts`
- **Responsibility:** Game constants — math, scoring tables, difficulty presets, phase/controller/command mappings, aircraft type catalog, colors.
- **Key exports:**
  - Constants: `PX_PER_NM`, `SEPARATION_NM` (3), `SEPARATION_FT` (1000), `MVA_FT` (8800), `READBACK_DELAY_MIN_MS` (1500), `SIM_TICK_INTERVAL_MS` (1000)
  - Tables: `SCORE_DELTAS`, `DIMENSION_DELTAS`, `GRADE_THRESHOLDS`, `DIFFICULTY_PRESETS`, `AIRCRAFT_TYPES` (9 types), `AIRLINE_PREFIXES` (12)
  - Phase/Controller/Command mappings: `PHASE_CONTROLLER`, `CONTROLLER_COMMANDS`, `PHASE_COMMANDS`, `AIRBORNE_PHASES`
  - Colors: `COLORS` (hex numbers for PixiJS), `CSS_COLORS` (hex strings for React)
- **Feeds into:** All engine files, `GameContext`, radar, UI components.
- **Depends on:** `types.ts`.

---

### Core Engine — State & Events

#### `src/engine/event-bus.ts`
- **Responsibility:** Typed pub/sub — immediate `emit()` or queued `queueEvent()` with `flush()`.
- **Key exports:** `EventBus` class, singleton `eventBus`.
- **Feeds into:** `scoring.ts`, `mission-system.ts`, `career-system.ts`, `useAudio.ts`, `simulation-tick.ts`, `command-registry.ts`, `command-executor.ts`, `phase-transitions.ts`.
- **Depends on:** `types.ts`.

#### `src/engine/game-state.ts`
- **Responsibility:** Central mutable singleton — owns all aircraft, scoring, session, airport, separation, and radio log data.
- **Key exports:** `GameState` class, singleton `gameState`.
- **Key methods:** `addAircraft`, `removeAircraft`, `getAircraftByCallsign`, `selectAircraft`, `addScoreEvent`, `addRadioMessage`, `getGrade()`, `isSessionExpired()`, `setDifficulty()`, `reset()` (bumps `sessionGeneration`), `snapshot()` (shallow per-aircraft).
- **Feeds into:** All engine files via `gameState` singleton; `GameContext.tsx` via `snapshot()`.
- **Depends on:** `types.ts`, `constants.ts`.
- **Critical note:** `snapshot()` shares `Aircraft` object references — components can observe mid-tick mutations.

---

### Core Engine — Simulation Logic

#### `src/engine/movement.ts`
- **Responsibility:** Per-phase aircraft movement physics — taxi, line-up, takeoff roll, climb, approach (with glideslope tracking), final, landing, rollout, missed.
- **Key exports:** `moveAircraft()`, `normalizeHeading()`, `headingToRadians()`, `distanceNM()`, `bearingBetween()`, `turnToward()`.
- **Feeds into:** `simulation-tick.ts` (per-aircraft per-tick).
- **Depends on:** `types.ts`, `constants.ts`.
- **Ponytail:** Instant heading snap on taxiways → pathfinding (now partially addressed by v1.1 taxi graph!).

#### `src/engine/phase-transitions.ts`
- **Responsibility:** Automatic phase transitions based on distance, altitude, speed — also handles missed approach trigger, gate assignment on ROLLOUT→TAXI_IN.
- **Key exports:** `processPhaseTransitions()`, `checkAircraftRemoval()`.
- **Feeds into:** `simulation-tick.ts`.
- **Depends on:** `types.ts`, `constants.ts`, `movement.ts`, `event-bus.ts`, `game-state.ts`, `airport-loader.ts`, `taxi-routing.ts`.
- **Ponytail:** All gates occupied → double-park at gate 1.

#### `src/engine/separation.ts`
- **Responsibility:** Lateral/vertical separation violation detection with cooldown.
- **Key exports:** `SeparationChecker` class, `separationChecker` singleton, `clearViolationFlags()`.
- **Feeds into:** `simulation-tick.ts`.
- **Depends on:** `types.ts`, `constants.ts`, `movement.ts`, `event-bus.ts`.

#### `src/engine/aircraft-factory.ts`
- **Responsibility:** Spawns departure (at gate) and arrival (at entry point) aircraft with random callsigns/types/squawks.
- **Key exports:** `spawnDeparture()`, `spawnArrival()`.
- **Feeds into:** `simulation-tick.ts`.
- **Depends on:** `types.ts`, `constants.ts`.
- **Ponytail:** Flat random callsigns → sequential/realistic when flight schedule system added.

#### `src/engine/simulation-tick.ts`
- **Responsibility:** The 1 Hz orchestrator — order matters: spawn → clear violation flags → per-aircraft (move, phase transition, MVA check, removal) → separation check → AI controllers → session expiry → flush events.
- **Key exports:** `tick()`.
- **Feeds into:** `useGameLoop.ts` (called from rAF loop at ~1 Hz).
- **Depends on:** All above engine modules + `ai-controller.ts`.
- **Critical invariant:** Order of operations within `tick()` is enforced by nothing but convention — new per-tick behavior must be inserted at the correct stage.

#### `src/engine/airport-loader.ts`
- **Responsibility:** Parses `.airport` JSON (supports v1 custom, v1.0 editor scale, v1.1 meter-true) into `Airport` struct; builds taxiway graph; active runway selection (wind-based).
- **Key exports:** `loadAirport()`, `buildTaxiwayGraph()`, `findRunwayById()`, `missedApproachParams()`, `findGateById()`, `getAvailableGates()`, `selectActiveRunway()` (wind-favored end of longest strip), `getArrivalSpawnPoints()`, `getReciprocalRunway()`.
- **Feeds into:** `GameContext.tsx` (initial load), `phase-transitions.ts`, `command-executor.ts`, `simulation-tick.ts`, `taxi-routing.ts`.
- **Depends on:** `types.ts`.
- **Ponytail:** HHAS traced under scale (`SCALE` fudge for v1.0); no ILS preference or crosswind limits.

#### `src/engine/taxi-routing.ts`
- **Responsibility:** Dijkstra pathfinding on taxiway graph nodes; finds nearest node, builds point route to hold-short/gate node.
- **Key exports:** `nearestNodeId()`, `findTaxiPath()`, `findNodeByRef()`, `buildTaxiRoute()`.
- **Feeds into:** `command-executor.ts` (TAXI command), `phase-transitions.ts` (ROLLOUT→TAXI_IN).
- **Depends on:** `types.ts`, `movement.ts`.
- **Ponytail:** Linear-scan frontier (airports have dozens of nodes, not thousands).

---

### Command System

#### `src/engine/commands/command-registry.ts`
- **Responsibility:** ProcessCommand pipeline — validate → generate phraseology → emit COMMAND_ISSUED → schedule delayed execution via setTimeout.
- **Key exports:** `processCommand()`.
- **Feeds into:** `GameContext.tsx` (UI), `ai-controller.ts`.
- **Depends on:** Command pipeline files, `event-bus.ts`, `game-state.ts`, `constants.ts`, `airport-loader.ts`.
- **Critical note:** Delayed execution re-fetches aircraft by callsign — must tolerate removed aircraft. `sessionGeneration` guard prevents stale timers from affecting reset sessions.

#### `src/engine/commands/command-parser.ts`
- **Responsibility:** Parses text input into `Command` object — supports full words and abbreviated aliases.
- **Key exports:** `parseCommand()`.
- **Feeds into:** `CommandInput.tsx`.

#### `src/engine/commands/command-validators.ts`
- **Responsibility:** Validates command against phase permissions and parameter ranges.
- **Key exports:** `validateCommand()`.
- **Feeds into:** `command-registry.ts` (called before execute).

#### `src/engine/commands/phraseology.ts`
- **Responsibility:** Generates ICAO-style ATC + pilot readback phraseology for all 16 commands.
- **Key exports:** `generatePhraseology()`.
- **Feeds into:** `command-registry.ts`.

#### `src/engine/commands/command-executor.ts`
- **Responsibility:** Applies command effects to aircraft — phase changes, clearance setting, routing, handoff.
- **Key exports:** `executeCommand()`.
- **Feeds into:** `command-registry.ts` (called after readback delay).
- **Depends on:** `types.ts`, `constants.ts`, `movement.ts`, `airport-loader.ts`, `taxi-routing.ts`, `event-bus.ts`, `game-state.ts`.

---

### Event Handlers & Support Systems

#### `src/engine/scoring.ts`
- **Responsibility:** Listens to game events, applies score/dimension deltas, tracks aircraft handled, emits SCORE_CHANGED.
- **Key exports:** `initializeScoringSystem()` (module-level, called from `GameContext.tsx`).
- **Key feature:** AI-controlled outcomes excluded via `playerStations.includes(aircraft.controller)` check.
- **Depends on:** `types.ts`, `event-bus.ts`, `game-state.ts`, `constants.ts`.
- **Gotcha:** Module-level listener wiring — Vite HMR re-registers listeners, doubling scores in dev.

#### `src/engine/mission-system.ts`
- **Responsibility:** Chainable tutorial missions with objective checks against `GameStateSnapshot`.
- **Key exports:** `MissionSystem` class, `missionSystem` singleton.
- **Feeds into:** `useGameLoop.ts` (updated each tick), `MissionTracker.tsx`.
- **Depends on:** `types.ts`.

#### `src/engine/career-system.ts`
- **Responsibility:** XP/levels/sessions best-grade persistence via localStorage.
- **Key exports:** `CareerSystem` class, `careerSystem` singleton.
- **Class-constructor side effect:** Registers event bus listeners for SCORE_CHANGED and SESSION_ENDED at import time.
- **Depends on:** `types.ts`, `constants.ts`, `event-bus.ts`.

#### `src/engine/ai-controller.ts`
- **Responsibility:** Textbook autopilot for non-player stations — issues one command per aircraft per tick via the same `processCommand()` pipeline.
- **Key exports:** `nextExpectedCommand()` (deterministic command per phase), `runAiControllers()`.
- **Safety branch:** In FINAL phase, checks `aircraft.inViolation` before issuing CLEARED_LAND.
- **Depends on:** `types.ts`, `game-state.ts`, `command-registry.ts`, `constants.ts`.

---

### React State Management

#### `src/state/GameContext.tsx`
- **Responsibility:** React context bridging gameState singleton to React re-renders via snapshots.
- **Key exports:** `GameProvider`, `useGame()` hook.
- **Key methods:** `selectAircraft`, `issueCommand`, `togglePause`, `resetGame`, `setDifficulty`, `startSession`, `setPlayerStations`.
- **Key pattern:** `_updateGameSnapshot` attached to `window` — called from `useGameLoop` to force React re-render without circular import.
- **Init-time side effect:** Calls `initializeScoringSystem()` at module top level.
- **Depends on:** `game-state.ts`, `command-registry.ts`, `airport-loader.ts`, `scoring.ts`, `hhas.airport.json`.

#### `src/state/useGameLoop.ts`
- **Responsibility:** rAF loop — ticks simulation at ~1 Hz, updates React snapshot at 60 FPS.
- **Key exports:** `useGameLoop()`.
- **Depends on:** `game-state.ts`, `simulation-tick.ts`, `constants.ts`, `mission-system.ts`.

#### `src/state/useAudio.ts`
- **Responsibility:** Web Audio beeps (roger/alert/success), TTS via SpeechSynthesis, radio log writes.
- **Key exports:** `useAudio()`, `AudioEngine` class.
- **Key features:**
  - Distinct per-station ATC voice, deterministic per-callsign pilot voice
  - Backlog cap (3 pairs), mute resets pending speech
  - Radio log writes independently of TTS
  - M key + `toggle-mute` CustomEvent — single source of truth
- **Depends on:** `event-bus.ts`, `types.ts`, `game-state.ts`.

#### `src/state/useKeyboardShortcuts.ts`
- **Responsibility:** Global keyboard shortcuts — Space/Escape/Tab/C/R/T/O/G/+/-/0/M//.
- **Pattern:** Direct `gameState` mutation (paused, selectAircraft) + `CustomEvent` dispatch (radar-*, toggle-*).
- **Depends on:** `game-state.ts`.

#### `src/state/useToggleEvent.ts`
- **Responsibility:** Generic overlay toggle hook driven by window CustomEvents.
- **Key exports:** `useToggleEvent()`.

---

### UI Components

#### `src/components/StatusBar.tsx`
- **Responsibility:** Top bar — station callsign, time, score, traffic count (AIR/GND), TTS indicator, station role (YOU/AI), pause button.
- **Depends on:** `useGame()`, `constants.ts` types.

#### `src/components/FlightStrips.tsx`
- **Responsibility:** Left panel strip cards — scrollable DEP/ARR sections with callsign, type, phase, altitude, speed, urgency/violation indicators. Click selects.
- **Depends on:** `useGame()`, `types.ts`.

#### `src/components/RadarCanvas.tsx`
- **Responsibility:** PixiJS 8 radar canvas — airport diagram, runways, range rings, compass rose, aircraft sprites/datablocks/trails/vectors, sweep line, ruler tool, wind indicator, zoom/pan/drag/hover.
- **~1026 lines** — the largest file in the codebase.
- **Key patterns:**
  - StrictMode double-init guard (`cancelled` flag)
  - `handleWheelRef` pattern for non-passive wheel listener
  - Tutorial demo aircraft via `tutorial-demo-aircraft` CustomEvent
  - `drawAircraftBody()` shared between real and demo aircraft
  - `redrawStatic()`, `redrawDynamic()`, `redrawSweep()`, `redrawRuler()`, `redrawCompass()`, `updateHud()` per-frame
- **PIXI layering:** glassBg → staticG → rangeLabelContainer → sweepG → dynamicCont → rulerG → bezelLayer → hudLayer
- **Depends on:** `useGame()`, `pixi.js/unsafe-eval`, `tutorialContent.ts` types.

#### `src/components/CommandPanel.tsx`
- **Responsibility:** Right panel — GND/TWR/APP tab bar (filtered to player stations), command buttons (phase-gated), inline param input for VECTOR/ALTITUDE/SPEED/SQUAWK.
- **Depends on:** `useGame()`, `types.ts`, `constants.ts`.

#### `src/components/CommandInput.tsx`
- **Responsibility:** Text input bar with auto-complete (callsign + verb suggestions), ↑↓/Tab/Enter/Esc navigation, inline error display.
- **Depends on:** `useGame()`, `command-parser.ts`.

#### `src/components/RadioLog.tsx`
- **Responsibility:** Scrollable radio communications display — auto-scrolls to newest entry.
- **Depends on:** `useGame()`.

#### `src/components/BriefingScreen.tsx`
- **Responsibility:** Session start overlay — difficulty selector (easy/medium/hard) with stat preview, station picker (GND/TWR/APP, ≥1 enforced), TUTORIALS button, START button.
- **Depends on:** `useGame()`, `types.ts`, `constants.ts`.

#### `src/components/EndScreen.tsx`
- **Responsibility:** Session results overlay — grade badge (S/A/B/C/D color-coded), score, 5 dimension bars, career stats, PLAY AGAIN button.
- **Depends on:** `useGame()`, `career-system.ts`, `types.ts`.

#### `src/components/PauseMenu.tsx`
- **Responsibility:** Pause overlay — Resume, Restart Session, Mute, Main Menu, Quit to Desktop (via IPC).
- **Depends on:** `useGame()`, `types.ts`.

#### `src/components/TutorialMenu.tsx`
- **Responsibility:** Tutorial topic picker overlay — grouped (Getting Started / ATC Knowledge / Role Tutorials) from `TUTORIAL_TOPICS` data.
- **Depends on:** `tutorialContent.ts`.

#### `src/components/TutorialOverlay.tsx`
- **Responsibility:** Spotlight walkthrough — tracks element via selector, draws spotlight border, stages demo aircraft via CustomEvent, step navigation.
- **Depends on:** `tutorialContent.ts`.

#### `src/components/MissionTracker.tsx`
- **Responsibility:** "O" overlay — live score/grade/time/traffic, 5 dimension bars, mission objectives, recent comms.
- **Depends on:** `useGame()`, `useToggleEvent()`, `mission-system.ts`, `types.ts`.

#### `src/components/GuidePanel.tsx`
- **Responsibility:** "G" overlay — 4-tabbed reference: Commands (per-station), Procedures (departure/arrival/separations/go-arounds), Scoring (deltas/grades/dimensions), Controls (keyboard shortcuts).
- **Depends on:** `useToggleEvent()`.

---

### Data Files

#### `src/data/tutorialContent.ts`
- **Responsibility:** Pure data — 6 tutorial topics across 3 groups, each with multiple `TutorialStep` objects.
- **Key exports:** `TutorialDemoAircraft` interface, `TUTORIAL_TOPICS` array.
- **Contains:** `UI_BASICS_STEPS` (8), `ATC_FUNDAMENTALS_STEPS` (5), `HANDLING_INCIDENTS_STEPS` (5 with demo coords), `GROUND_STEPS` (3), `TOWER_STEPS` (3), `APPROACH_STEPS` (3).

#### `src/data/airports/hhas.airport.json`
- **Responsibility:** HHAS airport data in spstudio editor v1.0 format (~435 lines). Contains runways, taxiways, aprons, gates, buildings, labels as spstudio objects.
- **Key content:** Version "1.0" (scale fudge 0.001668), elevation 7661 ft, no taxiGraph section (render-only polylines).

---

### Test Files (10 files)

| File | Tests | Coverage |
|------|-------|----------|
| `game-state.test.ts` | 43 | GameState API, snapshot, reset |
| `aircraft-factory.test.ts` | 32 | Spawn defaults, phases, flight types |
| `constants.test.ts` | 28 | All constant table invariants |
| `movement.test.ts` | 25 | Heading/bearing/distance, per-phase movement |
| `separation.test.ts` | 14 | Violation detection, cooldown, ground exclusions |
| `ai-controller.test.ts` | 12 | AI decision table (integration, real HHAS) |
| `command-executor.test.ts` | 10 | Executor phase wiring + ESM regression |
| `arrival-lifecycle.test.ts` | 2 | Full arrival flow + go-around end-to-end |
| `scoring.test.ts` | 2 | Player-station score attribution |
| `taxi-routing.test.ts` | (v1.1, new) | Dijkstra pathfinding on taxi graph |

---

## Section B: Architecture Diagram

```
┌─────────────────────────────────────────────────────────────┐
│                     Electron Shell                           │
│  electron/main.ts = BrowserWindow + preload + IPC            │
│  electron/preload.ts = contextBridge → window.electronAPI    │
└──────────────────────┬──────────────────────────────────────┘
                       │ loads via Vite (dev) or dist/ (prod)
                       ▼
┌─────────────────────────────────────────────────────────────┐
│                   React Renderer (src/)                      │
│                                                             │
│  main.tsx → App.tsx (5-container layout + overlays)         │
│       └── GameProvider (GameContext.tsx)                    │
│              │ stores GameStateSnapshot in useState          │
│              │ holds gameState singleton reference           │
│              │ exposes: selectAircraft, issueCommand, etc.   │
│              └── GameUI (inner component)                   │
│                    ├── useGameLoop() ←── rAF loop            │
│                    │    ├── tick(gameState, 1.0)  ← 1 Hz    │
│                    │    └── window._updateGameSnapshot() 60Hz│
│                    ├── useAudio() → event bus listeners      │
│                    ├── useKeyboardShortcuts()                │
│                    │                                        │
│                    ├── StatusBar                             │
│                    ├── FlightStrips                          │
│                    ├── RadarCanvas (PixiJS)                  │
│                    ├── CommandPanel                          │
│                    ├── CommandInput                          │
│                    ├── RadioLog                              │
│                    ├── EndScreen / PauseMenu                 │
│                    ├── BriefingScreen / TutorialMenu         │
│                    ├── TutorialOverlay                       │
│                    ├── MissionTracker / GuidePanel           │
│                    └── PauseMenu                             │
│                                                             │
│   ┌──── State hooks ────────────────────────────┐           │
│   │  GameContext.tsx (snapshot bridge)           │           │
│   │  useGameLoop.ts (rAF + tick)                │           │
│   │  useAudio.ts (TTS + beeps + radio log)      │           │
│   │  useKeyboardShortcuts.ts (global hotkeys)   │           │
│   │  useToggleEvent.ts (overlay visibility)     │           │
│   └─────────────────────────────────────────────┘           │
└──────────────────────────┬──────────────────────────────────┘
                           │ reads snapshots / dispatches commands
                           ▼
┌─────────────────────────────────────────────────────────────┐
│              Simulation Engine (src/engine/)                 │
│  (framework-agnostic, no React dependency)                   │
│                                                             │
│  game-state.ts ◄── singleton GameState (mutable)            │
│       │                                                     │
│       ├── event-bus.ts ◄── singleton EventBus               │
│       │       ├── scoring.ts (score/dimension deltas)       │
│       │       ├── mission-system.ts (tutorial objectives)   │
│       │       ├── career-system.ts (XP/levels/persistence)  │
│       │       └── useAudio.ts (TTS triggers)                │
│       │                                                     │
│       └── simulation-tick.ts ◄── tick() orchestrator (1Hz) │
│               ├── aircraft-factory.ts (spawning)            │
│               ├── movement.ts (per-phase physics)           │
│               ├── phase-transitions.ts (auto phase changes) │
│               ├── separation.ts (lateral/vertical)          │
│               ├── ai-controller.ts (autopilot)              │
│               ├── MVA check (inlined in tick)               │
│               └── session expiry check                      │
│                                                             │
│   ┌─ Command Pipeline ──────────────────────────┐           │
│   │  command-registry.ts → validator →          │           │
│   │  phraseology → emit + setTimeout → executor │           │
│   │  command-parser.ts (text→Command, separate) │           │
│   └─────────────────────────────────────────────┘           │
│                                                             │
│   ┌─ Airport & Geometry ────────────────────────┐           │
│   │  airport-loader.ts (parse/query/runway sel) │           │
│   │  taxi-routing.ts (Dijkstra on graph)        │           │
│   └─────────────────────────────────────────────┘           │
│                                                             │
│   ┌─ Data ──────────────────────────────────────┐           │
│   │  types.ts (all domain types)                │           │
│   │  constants.ts (numbers, tables, colors)     │           │
│   │  airports/hhas.airport.json (HHAS data)     │           │
│   └─────────────────────────────────────────────┘           │
└─────────────────────────────────────────────────────────────┘
```

---

## Section C: Gotchas

### 1. Shallow Per-Aircraft Snapshots
**File:** `src/engine/game-state.ts:193` (`snapshot()`)
The `snapshot()` method copies the `Map` but shares `Aircraft` object references. React components can observe mid-tick field mutations. The protection is against add/remove only. If an engine bug mutates an aircraft twice in one tick, the UI might show an inconsistent intermediate state.

### 2. Delayed Readback & Stale Timer Guard
**File:** `src/engine/commands/command-registry.ts` (line ~75)
Commands use `setTimeout` with a 1500–2500ms delay to simulate pilot reaction. The `sessionGeneration` counter (bumped in `gameState.reset()`) guards against stale timers firing on a new session's aircraft that happens to reuse a callsign. **New deferred code must also use this guard.** Regression test in `command-registry.test.ts`.

### 3. Module-Level Listener Registration → HMR Score Doubling
**Files:** `src/state/GameContext.tsx:10`, `src/engine/scoring.ts:15`, `src/engine/career-system.ts:9`
`initializeScoringSystem()` is called at the top level of `GameContext.tsx` — once per module load. In Vite HMR, a hot reload re-executes the module, re-registering event bus listeners without cleaning up the old ones. In dev, scores change twice per event. **Restart the dev server, don't just hot-reload.**

Similarly, `careerSystem` is a singleton whose constructor registers event listeners — this is fine for production, but its listeners survive HMR too.

### 4. Two Pause Paths
**Files:** `src/state/useKeyboardShortcuts.ts:40`, `src/state/GameContext.tsx:72`
Spacebar mutates `gameState.paused` directly (no snapshot push until the next rAF loop). `GameContext.togglePause()` also pushes a snapshot. Neither emits `SIM_PAUSED`/`SIM_RESUMED` — those enum values are currently decorative. Use `togglePause` in new code; avoid direct mutation.

### 5. React StrictMode & PixiJS Async Init
**File:** `src/components/RadarCanvas.tsx` (line ~651)
StrictMode mounts/unmounts/remounts effects in dev. PixiJS `app.init()` is async — the first run's cleanup fires before init resolves, but the orphaned `Application` still finishes and appends a canvas. A `cancelled` boolean guard prevents the old instance from overwriting refs. Without it, a visible-but-frozen canvas appears while the real canvas writes to an orphaned off-screen surface.

### 6. Stale First-Render Closure in Radar Listeners
**File:** `src/components/RadarCanvas.tsx` (line ~850)
Viewport actions (zoom/center/reset) dispatched by `useKeyboardShortcuts` via `CustomEvent` are handled by `useEffect` with `[]` deps. These handlers mutate only refs (`zoomRef.current`, `offsetXRef.current`) — the per-frame render effect repaints. But if a handler directly called `redrawStatic()`/`redrawDynamic()` here, those would be the first-render closures and would read stale `state`. This is why all direct redraws go through refs or the per-frame effect.

### 7. `handleWheelRef` Pattern for Passive Wheel Events
**File:** `src/components/RadarCanvas.tsx` (line ~975)
React's `onWheel` is passive by default — `e.preventDefault()` silently fails. A native, non-passive `wheel` listener is attached directly. But that listener captures the handler at bind time (stale closure). Solution: `handleWheelRef.current = handleWheel` in a separate `useEffect`, and the native listener calls `handleWheelRef.current(e)`. This ref pattern is required for any stale-closure-sensitive native listener in RadarCanvas.

### 8. Engine/UI Sync Tables Are Manual
**Files:** `types.ts`, `constants.ts`, `command-validators.ts`, `ai-controller.ts`
The mappings "which command/phase/controller goes together" are spread across four files with no type-level enforcement. `constants.test.ts` is the only guard. Adding a new command or phase requires touching all of them — forgetting one produces silent runtime bugs.

### 9. AI Needs Taxi Route for Departure Taxi
**File:** `src/engine/ai-controller.ts`
The AI issues `TAXI` for PARKED aircraft, but the TAXI command handler in `command-executor.ts` relies on the taxi graph for routing. Pre-v1.1 (or v1.0 airport files without a `taxiGraph` section), the AI's TAXI command falls back to straight-line taxi. This is fine behaviorally but may produce visually odd paths on complex airports.

### 10. CareerSystem Constructor Has Side Effects at Import Time
**File:** `src/engine/career-system.ts`
The singleton `careerSystem` is created at module level, and its constructor registers event bus listeners (`SCORE_CHANGED`, `SESSION_ENDED`) and calls `localStorage.getItem()`. Importing this file anywhere triggers persistence reads and event subscriptions — even if career features aren't active.

### 11. Static vs Dynamic Radar Layers Both Redrawn Every Frame
**File:** `src/components/RadarCanvas.tsx` (redrawStatic + redrawDynamic)
The static layer (airport diagram, runways, range rings, compass) is redrawn every frame alongside the dynamic layer because PixiJS init async means the first draw can race the init — so both run unconditionally on every `state` change. The authors consider this "negligible overhead" (~1026 lines of redraw logic).

### 12. Scoring is Attributed by Controller at Event-Fire Time, Not Command-Issue Time
**File:** `src/engine/scoring.ts:28` (documented in PLAYBOOK.md)
The scoring system attributes events to the aircraft's controller *at the moment the event fires*, not when the command was issued. If an aircraft changes controller between command-issue and event-fire (e.g., auto-transition), the score goes to the new controller. This is deliberate but surprising.

### 13. The Two Handoff Paths — COMMAND vs Phase-Transition
**Files:** `command-executor.ts` (CONTACT_DEPARTURE → `changePhase(aircraft, DEPARTED)`), `phase-transitions.ts` (auto transitions)
Departures can be handed off via CONTACT_DEPARTURE command (sets phase to DEPARTED directly) or can reach DEPARTED via flight progress. Arrivals hand off via CONTACT_TOWER (just changes controller, not phase) before hitting FINAL. The two paths have different semantics: one is a phase change, the other is a controller change.

### 14. No Tests for React Components
All 170+ tests target only the engine layer (node environment). There are zero React component tests. Any UI change must be manually verified in `npm run dev`. An engine change that passes all tests can still break the UI if it changes snapshot shape.

### 15. Dead Code Removed — `AircraftList.tsx`
**File:** Deleted 2026-07-11. Confirmed removed. No other dead components detected.
