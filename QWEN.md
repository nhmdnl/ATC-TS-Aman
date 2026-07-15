# ATC-TS-Aman — QWEN.md

## ⚡ NORTH STAR (read this every session)

**Build a complete, playable ATC simulation:** ATC Aman — single-player real-time air traffic control at Asmara International Airport (HHAS, Eritrea). The player sits as tower controller managing arriving and departing aircraft through radar interaction, command buttons, and radio communication.

**Tech stack:** Electron 35 + TypeScript + React 19 + PixiJS 8 + Vite 6

**Primary interaction flow:** Click aircraft on radar → click command buttons (GND/TWR/APP tabs). Text input is secondary.

**Everything else is a side-task.** If I'm asked to do unrelated work, I must:
1. Do the side-task if quick (< 5 min)
2. Save progress on the main task
3. Return to ATC Aman afterwards
4. Never let side-tasks accumulate without re-prioritizing with the user

**HHAS is the only airport.** All simulation parameters (runways, navaids, frequencies, missed procedures, MVA, step-downs) come from Navigraph approach plates (`docs/HHAS.pdf`). Never use generic values when chart data exists.

---

## 🎯 TASK PROTOCOL — `TASKS.md` is my work queue (mandatory)

**Planning for this project is owned by Claude (Claude Code), the planning lead.**
All feature and fix work I (Qwen) do comes from **`TASKS.md`** in this repo root.

- I have **explicit permission to implement any `TODO` task in `TASKS.md`,
  following its Steps to the letter** — including editing code in this repo AND
  in the editor repo (`/home/devnhm/Projects/spstudio/airport-studio-application`)
  when the task names it, running tests, and committing (never pushing).
- I do **not** have permission to: invent tasks, change task specs, reorder
  priorities, exceed a task's "Out of scope" line, or refactor opportunistically.
  If I notice something broken that no task covers, I write it in `TASKS.md` →
  Questions / Escalations and keep going.
- Every session: read `TASKS.md` first, follow its **Protocol** section exactly
  (status transitions, one task at a time, verification gates, Worklog entries).
- A task is only `DONE` when its Verification commands all pass. If I can't
  verify (e.g. GUI check I can't perform), I use `IN REVIEW`, never `DONE`.
- When `TASKS.md` has no eligible `TODO` task, I stop and report — I do not
  self-assign work.

This section overrides the older "side-task" guidance above: side work not in
`TASKS.md` is escalated, not done.

---

## Project Status (2026-07-07) — FEATURE-COMPLETE

The full loop is verified end-to-end in the running Electron app (via CDP automation):
briefing menu → START → gameplay (departure taxi/lineup/takeoff/handoff through the real
command pipeline, radio log filling with ATC + pilot readbacks) → session expiry →
EndScreen (grade, 5 dimensions, career stats) → PLAY AGAIN → briefing again.
Arrival lifecycle (APPROACH → FINAL → LANDING → ROLLOUT → TAXI_IN → ARRIVED, plus
go-around) is locked in by an integration test against real HHAS data.

2026-07-07: four UX additions landed on `feature/four-ux-additions` (18 plan tasks,
plans in `docs/superpowers/plans/2026-07-06-*.md`): pause menu, TTS quality,
tutorial expansion, and controller-position selection with AI-run stations.
AI-station behavior verified live via CDP (GROUND-only session: AI issued
CLEARED_APPROACH + CONTACT_TOWER unaided; AI outcomes excluded from scoring).

### ✅ Shipped (fully implemented)

| Area | Status | Details |
|------|--------|---------|
| **Simulation engine** | ✅ | Full tick loop (1 Hz): spawning, movement physics per phase, phase transitions, separation checking, MVA, DME profile |
| **Command system** | ✅ | 16 command types, text parser with abbreviations, validation pipeline (controller/phase/params), delayed execution with readback timer; commands drive phase changes (TAXI→TAXI_OUT, LINEUP→LINE_UP, TAKEOFF→TAKEOFF_ROLL, CONTACT DEP→DEPARTED, GO_AROUND→MISSED) |
| **Phraseology** | ✅ | ICAO ATC + pilot readback for all 16 commands, airport-aware frequencies |
| **Airport loader** | ✅ | Supports v1 `.airport` + spstudio editor v1.0 formats; parses full diagram (taxiways/aprons/buildings/gates/labels) for rendering |
| **Event bus** | ✅ | Typed, immediate + queued dispatch, 15 event types |
| **Scoring** | ✅ | 5 dimensions (Safety/Efficiency/Communication/Procedure/Awareness), grade S/A/B/C/D, event-driven |
| **Mission system** | ✅ | Chained objectives, GameStateSnapshot checks |
| **Career system** | ✅ | XP, levels, localStorage persistence |
| **Radar (PixiJS)** | ✅ | Airport diagram (runways/taxiways/aprons/buildings/gates), range rings, rotating sweep, aircraft with data blocks/trails/vectors/selection; works under strict CSP via `pixi.js/unsafe-eval` |
| **Command buttons** | ✅ | GND/TWR/APP tab bar, 16 buttons, phase-based enable/disable, inline params |
| **Flight strips** | ✅ | Left panel, DEP/ARR sections, click-to-select, urgency/violation indicators |
| **Radar zoom/pan** | ✅ | Wheel + keyboard zoom (5–400 px/NM, multiplicative, cursor-centered), click-drag pan, ruler tool (R) for NM/bearing |
| **Briefing screen** | ✅ | Difficulty selection with stat previews; sim gated on `sessionStarted` |
| **Keyboard shortcuts** | ✅ | Tab/Space/Escape/C/R/T/O/G/+/-/M/0/ `/` focus — all wired and verified |
| **Audio** | ✅ | Web Audio beeps (roger/alert/success), best-effort TTS; radio log independent of TTS availability |
| **CommandInput auto-complete** | ✅ | Callsign (first token) + verb (second token) suggestions, ↑↓/Tab/Enter/Esc, inline invalid-command feedback |
| **Mission tracker (O)** | ✅ | Live score/grade/time/traffic, dimension bars, objectives, recent comms |
| **Guide panel (G)** | ✅ | Tabbed reference: commands, procedures, scoring, controls |
| **Tutorial (T)** | ✅ | 8-step spotlight walkthrough of all UI regions |
| **Tutorial menu** | ✅ | TUTORIALS on briefing screen + topic picker (`TutorialMenu.tsx`, content in `src/data/tutorialContent.ts`): UI Basics, ATC Fundamentals, Handling Incidents, Ground/Tower/Approach; auto-pauses sim, EndScreen suppressed during tutorial |
| **Pause menu** | ✅ | Resume/restart/mute/main-menu/quit-to-desktop (`PauseMenu.tsx`); mute lifted into GameContext; quit via IPC `app.quit()` |
| **TTS quality** | ✅ | Cached voice selection, speech backlog cap (reset on mute), `TTS: CAPTIONS ONLY` status-bar indicator when unavailable |
| **Controller stations / AI** | ✅ | Briefing-screen station picker (`playerStations`, ≥1 enforced); `ai-controller.ts` runs textbook commands for unselected GND/TWR/APP stations (after separation check, safety-aware CLEARED_LAND); AI outcomes excluded from scoring; CommandPanel tabs filtered to player stations; StatusBar YOU/AI readout |
| **EndScreen** | ✅ | Grade badge, all 5 dimension bars, duration, career stats, PLAY AGAIN |
| **State management** | ✅ | React context + rAF render loop |
| **Layout** | ✅ | 5-container: air-strip | radar | commands (with GND/TWR/APP tabs) | input | comms |
| **Tests** | ✅ | Vitest, 211 tests (14 files) incl. executor regression, arrival-lifecycle + AI-controller integration, v1.1 loader + taxi-routing, 2026-07-16 playtest regressions, all passing |

(2026-07-12) **v1.1 airport-format integration shipped on both sides** (sim commit
`60325f6`; editor has its own repo in `/home/devnhm/Projects/spstudio/airport-studio-application`).
Sim: version-dispatched loader ("1.1" = true meter scale 1/1852, "1.0" keeps the
0.001668 fudge), file-driven frequencies/spawns/per-runway ops (ILS, pattern,
missed heading/altitude with fallbacks), `taxi-routing.ts` (Dijkstra over the
file's `taxiGraph`) wired into TAXI, ROLLOUT→TAXI_IN and hold-short detection —
all fallback-guarded so "1.0" files still work. 196 tests green. Editor: shell
fully wired (was a mock prototype), spawn tool, ops/frequency UI, scale
calibration, and `lib/taxi-graph.ts` derives the routable graph on every save.

### 🚧 Remaining (tracked in TASKS.md — do not work from this table)

| Feature | Where | Notes |
|---------|-------|-------|
| **HHAS v1.1 data upgrade** | TASKS.md T-001 | Scripted scale/version/freqs/ops/spawns upgrade of `hhas.airport.json` |
| **Taxi-route radar rendering** | TASKS.md T-002 | Draw assigned `taxiRoute` for the selected aircraft |
| **Wind readout** | TASKS.md T-003 | StatusBar wind display |
| **Callsign fallback** | TASKS.md T-004 | De-hardcode "Asmara" in `getStationName` |
| **Editor graph overlay** | TASKS.md T-005 | Visualize derived taxi graph in spstudio viewport |
| **Headless Linux noise** | TASKS.md T-006 | Investigation/report only |
| **v1.1 E2E** | TASKS.md T-007 | Blocked on user drawing taxiways + saving in the editor |

(2026-07-11) **Wind-based runway selection shipped** — `selectActiveRunway` in
`airport-loader.ts` picks the into-wind end of the longest strip for arrivals,
departures, and CLEARED_APPROACH alike. Arrivals also now take the first *free*
gate (occupancy-tracked) instead of everyone taxiing to G1. Dead `AircraftList.tsx`
deleted.

### 🔥 Bugs found & fixed during overnight live playtest (2026-07-16)

Five fixes, one commit each, all with regression tests (211 tests green):

- `7dd12e0` — arrivals spawned on top of existing traffic → instant separation
  violation. Spawn points now filtered by `isSpawnPointClear` (2× lateral
  minima / standard vertical); cycle skipped if all entries blocked.
- `92cb405` — routed taxi-out held short 0.1 NM early mid-taxiway; transition
  now requires the route's *final* point reached (< 0.02 NM).
- `d3c692b` — DEPARTED had no movement case: aircraft froze mid-air forever.
  Now flies out via `moveClimb` until the 25 NM removal boundary.
- `31990ea` — uncleaned overflights flipped to FINAL by proximity alone, then
  flew away stuck. FINAL requires `clearedForApproach`; ENTERING/APPROACH
  arrivals past 25 NM are removed.
- `502873c` — false MVA alerts after landing / on go-around. MVA is a
  vectoring floor: check applies only to ENTERING/APPROACH.

Closed as not-bugs: score 0 (0-floor clamp under heavy penalties), SPEED
"no-op" (DOM-timing measurement artifact), strip-click deselect (toggle UX).
In-app verification of the fixed paths is delegated to the user (2026-07-16);
the lead does no further automated playtesting.

### 🔥 Bugs found & fixed during E2E verification (2026-07-05)

- `command-validators.ts` used CommonJS `require()` → threw in Vite/ESM, so **no command
  ever executed in the app** (buttons or text). Tests passed because Vitest shims require.
  Regression test added.
- Commands never changed aircraft phase → departures stuck PARKED forever, arrivals could
  never reach FINAL (CLEARED_APPROACH now assigns the runway).
- ROLLOUT→TAXI_IN never set `taxiTarget` → landed arrivals stalled on the runway.
- Radio log writes hung off SpeechSynthesis callbacks (0 voices on Linux) → empty comms
  panel; log now independent of TTS.
- MVA alert fired on every climb-out (CLIMBING now exempt like TAKEOFF_ROLL).
- PixiJS init silently failed under CSP; briefing raced the sim loop; `npm run dev`
  loaded stale `dist/` (missing `--dev`); canvas never resized; zoom clamp hid the
  airport diagram.
- (2026-07-11) Pending readback `setTimeout`s survived `gameState.reset()` — a reset
  mid-delay could execute a stale command on a new session's aircraft reusing the
  callsign. Fixed with a `sessionGeneration` counter guard; regression test in
  `command-registry.test.ts`.

---

## Project Structure

```
atc-aman/
├── package.json              # Electron + React + PixiJS + Vite + Vitest
├── tsconfig.json             # Renderer TS config (Vite)
├── tsconfig.main.json        # Electron main process TS config
├── vite.config.ts            # Vite config with React plugin + @/ alias
├── vitest.config.ts          # Test config
├── index.html                # HTML shell (CSP enabled)
├── .gitignore
├── PRD_GDD.md                # Full game design document (source of truth for mechanics)
├── QWEN.md                   # ← THIS FILE — project context and tracking
├── electron/
│   ├── main.ts               # BrowserWindow creation, dev/prod load
│   └── preload.ts            # contextBridge IPC
├── src/
│   ├── main.tsx              # React entry point
│   ├── App.tsx               # Layout: 5 containers
│   ├── types/
│   │   └── electron.d.ts     # Window.electronAPI type
│   ├── components/
│   │   ├── StatusBar.tsx     # Score, time, air/gnd count, pause/resume
│   │   ├── FlightStrips.tsx  # Left panel — DEP/ARR strip cards
│   │   ├── RadarCanvas.tsx   # Center — PixiJS with zoom/pan/aircraft
│   │   ├── CommandPanel.tsx  # Right — GND/TWR/APP tabs + command buttons
│   │   ├── CommandInput.tsx  # Below radar — text input (secondary)
│   │   ├── RadioLog.tsx      # Bottom — scrollable event log
│   │   ├── EndScreen.tsx     # Full-screen session results overlay
│   │   ├── BriefingScreen.tsx # Difficulty + station selection overlay
│   │   ├── PauseMenu.tsx     # Pause overlay: resume/restart/mute/menu/quit
│   │   ├── TutorialMenu.tsx  # Tutorial topic picker (from briefing screen)
│   │   ├── MissionTracker.tsx # O — live HUD overlay
│   │   ├── GuidePanel.tsx    # G — tabbed reference overlay
│   │   └── TutorialOverlay.tsx # T — spotlight walkthrough
│   ├── engine/
│   │   ├── types.ts          # All type definitions
│   │   ├── constants.ts      # All game constants
│   │   ├── game-state.ts     # GameState class + singleton
│   │   ├── event-bus.ts      # Typed event bus
│   │   ├── aircraft-factory.ts # Spawn logic
│   │   ├── movement.ts       # Movement physics per phase
│   │   ├── separation.ts     # Lateral/vertical separation checking
│   │   ├── phase-transitions.ts # Auto phase state machine
│   │   ├── simulation-tick.ts # 1 Hz tick orchestrator
│   │   ├── airport-loader.ts # .airport JSON parser
│   │   ├── ai-controller.ts  # Textbook autopilot for non-player stations
│   │   ├── scoring.ts        # Score event handler (player-station attribution)
│   │   ├── mission-system.ts # Tutorial chained missions
│   │   ├── career-system.ts  # XP/levels persistence
│   │   ├── commands/
│   │   │   ├── command-registry.ts
│   │   │   ├── command-parser.ts
│   │   │   ├── command-executor.ts
│   │   │   ├── command-validators.ts
│   │   │   └── phraseology.ts
│   │   └── __tests__/        # 170 tests (unit + lifecycle/AI integration)
│   ├── state/
│   │   ├── GameContext.tsx
│   │   ├── useGameLoop.ts
│   │   ├── useAudio.ts
│   │   ├── useKeyboardShortcuts.ts
│   │   └── useToggleEvent.ts   # CustomEvent-driven overlay visibility
│   ├── styles/
│   │   └── index.css
│   └── data/
│       ├── tutorialContent.ts     # Tutorial topic content (TutorialMenu)
│       └── airports/
│           └── hhas.airport.json  # HHAS in spstudio editor format
└── dist/                     # Vite build output (gitignored)
```

---

## Key Design Decisions

| Decision | Choice | Why |
|----------|--------|-----|
| Primary interaction | Click radar → command buttons | User explicitly chose cursor over text |
| Layout | 5 containers (not PRD §18 5-panel) | air-strip | radar | commands(GND/TWR/APP tabs) | input | comms |
| Airport format | spstudio editor v1.0 + v1.1 | v1.1 adds true meter scale, frequencies, spawns, runway ops, derived taxiGraph |
| HHAS data source | Navigraph approach plates | Chart-derived parameters, never generic |
| Missed procedures | File-driven per runway end (v1.1 `ops`), fallback rwy heading / elev+4000 | Replaced the old R170/11500 hardcode |
| Command execution | Delayed (1500-2500ms readback) | Simulates pilot reaction time |
| Audio | Web Speech API + Web Audio | Fully offline, no external deps |
| TTS | browser built-in voices | Replaces Python gTTS from old codebase |

---

## Build & Run

```bash
npm run dev           # Vite HMR + Electron
npm run build         # Production build
npm run lint          # TypeScript check (tsc --noEmit)
npm test              # Vitest (170 tests)
npm run package       # Electron builder distribution
```

---

## Conventions

- **Ponytail comments** (`ponytail:`) mark deliberate simplifications with ceiling + upgrade path
- Function components with explicit return types
- Layout constants as `const` frozen objects
- React best practices per Vercel guidelines
- Tests: Vitest, pure unit (no DOM), in `__tests__/` per module
- Mutable simulation state in `GameState` singleton; React reads snapshots
