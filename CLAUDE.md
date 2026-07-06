# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

ATC Aman — a single-player, real-time air traffic control simulation for Asmara International Airport (ICAO: HHAS, Eritrea). The player is the tower controller, managing arrivals/departures by clicking aircraft on a radar then clicking command buttons (GND/TWR/APP tabs); text input is a secondary interaction path. Stack: Electron 35 + TypeScript + React 19 + PixiJS 8 + Vite 6, Vitest for tests.

HHAS is the only supported airport. All simulation parameters (runways, navaids, frequencies, missed approach procedures, MVA, step-downs) are meant to come from Navigraph approach plates, not generic/invented values.

A detailed, actively-maintained project status doc lives in `QWEN.md` (shipped features, remaining work, key design decisions) — read it for current state before starting non-trivial work. `PRD_GDD.md` is the design/requirements source of truth for game mechanics (commands, scoring dimensions, separation minima, difficulty presets, phraseology).

## Commands

```bash
npm run dev         # Vite dev server + Electron shell (HMR)
npm run build        # vite build (renderer) + tsc -p tsconfig.main.json (electron main)
npm run package      # build + electron-builder (produces release/ distributable)
npm test             # vitest run (all tests, once)
npm run test:watch   # vitest (watch mode)
npm run lint          # tsc --noEmit (renderer only)
npm run typecheck     # tsc --noEmit + tsc -p tsconfig.main.json --noEmit (renderer + main)
```

Run a single test file: `npx vitest run src/engine/__tests__/movement.test.ts`
Run tests matching a name: `npx vitest run -t "separation"`

Tests are pure unit tests (Vitest, `environment: 'node'`, no DOM), colocated in `src/engine/__tests__/`. There is no test setup for React components currently — all tests target the `engine/` layer.

The `@/` path alias resolves to `src/` in both Vite and Vitest configs.

## Architecture

The codebase splits into a framework-agnostic **simulation engine** (`src/engine/`) and a **React rendering layer** (`src/components/`, `src/state/`) that reads from it. The engine has no React dependency; React is a passive viewer plus dispatcher of player intents.

### State model: singleton + snapshots

`gameState` (`src/engine/game-state.ts`) is a single mutable `GameState` instance holding all aircraft, score, session, and airport data. It is *not* stored in React state. `GameProvider` (`src/state/GameContext.tsx`) holds a `GameStateSnapshot` (a deep-ish copy via `gameState.snapshot()`) in `useState`, and `useGameLoop` (`src/state/useGameLoop.ts`) drives a `requestAnimationFrame` loop that calls `window._updateGameSnapshot()` every frame to force a re-render from the latest mutable state. This is a deliberate escape hatch (the loop calls the snapshot updater via `window` to avoid a circular import between the hook and the context) — don't "fix" it into a normal prop/context call without checking both files.

Simulation physics only advances on a fixed ~1 Hz cadence inside that same rAF loop (`SIM_TICK_INTERVAL_MS` gate in `useGameLoop`), while the snapshot/React re-render happens every frame for smooth UI. When changing simulation rate or interpolation, both loops live in `useGameLoop.ts`.

### Simulation tick (`src/engine/simulation-tick.ts`)

`tick(state, dtSeconds)` is the per-second orchestrator, run in a fixed order: spawn aircraft → clear violation flags → for each aircraft: move (`movement.ts`) → phase transitions (`phase-transitions.ts`) → MVA violation check → removal check → separation check across all aircraft (`separation.ts`) → session-expiry check → flush queued events. Order matters (e.g. violation flags must be cleared before the per-aircraft loop re-evaluates them). New per-tick behavior should be inserted into this function at the appropriate stage rather than bolted on elsewhere.

### Command pipeline

Player-issued commands flow: `command-registry.ts` (`processCommand`) → validate (`command-validators.ts`, checks controller privilege/phase/params against the aircraft and airport) → generate ATC phraseology (`phraseology.ts`) → emit `COMMAND_ISSUED` immediately → schedule real execution via `setTimeout` after a random `READBACK_DELAY_MIN_MS`–`READBACK_DELAY_MAX_MS` delay (simulates pilot readback/reaction time) → `command-executor.ts` mutates the aircraft when the delay fires. Because execution is deferred and re-fetches the aircraft by callsign after the timeout, aircraft can be removed mid-delay — executor code must tolerate a missing aircraft. Command types are declared in `command-registry.ts`'s registry.

### Event bus (`src/engine/event-bus.ts`)

Typed pub/sub (`GameEventType` enum) with two dispatch modes: `emit()` fires synchronously to listeners immediately; `queueEvent()` buffers until `flush()` is called (done once per tick, at the end of `simulation-tick.ts`). Use immediate `emit` for things that must be reflected before the tick continues (e.g. command issuance); use the queue for events that should be batched to end-of-tick. Scoring (`scoring.ts`), mission system (`mission-system.ts`), and radio log all subscribe to this bus rather than being called directly.

### Airport data

`airport-loader.ts` parses `.airport` JSON in the "spstudio editor v1.0" format (see `src/data/airports/hhas.airport.json`) into runway/taxiway/gate/frequency lookups and builds the taxiway graph. HHAS-specific values (missed approach heading/altitude, MVA floor) are currently hardcoded per PRD data rather than airport-file-driven — see `ponytail:` comments below.

### `ponytail:` comments

Comments prefixed `ponytail:` mark a known, deliberate simplification with an explicit upgrade path (e.g. "always picks first runway — active runway logic when wind-based runway selection is needed"). Treat these as documented tech debt, not bugs — don't silently "fix" them into a more general solution unless the task calls for it, since the simplification was a scoped choice.

### Electron shell

`electron/main.ts` creates the `BrowserWindow` and switches between loading the Vite dev server (`NODE_ENV=development` or `--dev` flag) and the built `dist/index.html`. `electron/preload.ts` is the context-isolated IPC bridge (`window.electronAPI`, typed in `src/types/electron.d.ts`). The renderer (`src/`) has no direct Node/Electron access outside what's exposed there.

## Conventions

- Function components with explicit return types; layout constants as frozen (`const`) objects.
- Mutable simulation state lives only in the `GameState` singleton; React components never mutate it directly — they call context methods (`issueCommand`, `selectAircraft`, etc. in `GameContext.tsx`) which mutate `gameState` then push a new snapshot.
