# Controller-Position Selection + AI-Controlled Stations Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let the player pick, at the briefing screen, which of Ground/Tower/Approach they personally control; unselected stations are driven by a new deterministic `ai-controller` engine module that issues commands through the same pipeline the player uses, and score/aircraft-handled counts reflect only the player's own stations.

**Architecture:** One new engine module (`src/engine/ai-controller.ts`) wired into the existing 1 Hz tick loop, one new `GameState` field (`playerStations`) threaded through the snapshot/context layers exactly like `difficulty` already is, one guard clause in the existing centralized scoring funnel, and three small UI changes (briefing screen picker, command-panel tab filtering, status-bar readout).

**Tech Stack:** TypeScript engine code (Vitest, `environment: 'node'`), React 19 for the UI pieces.

## Global Constraints

- **Depends on the Pause Menu and TTS Quality plans having landed first**, since this plan's `StatusBar.tsx` edit (Task 8) is anchored against the file's state *after* those two plans' changes (a `ttsAvailable` prop and a `TTS: CAPTIONS ONLY` conditional span). If those plans have not landed, adapt Task 8's insertion point to whatever the current file looks like — the new station-readout `<div>` just needs to go in the same right-hand button group, before the `PAUSE`/`RESUME` button.
- The AI is a reliable autopilot, not a second player — it never makes a mistake, never does conflict-aware sequencing beyond "don't clear a landing into an active violation" (see Task 2's `nextExpectedCommand`). Do not add randomness, delays-with-jitter beyond the existing readback delay, or personality.
- The AI must issue commands through `processCommand()` (the real validation + phraseology + readback-delay pipeline) — never call `executeCommand()` directly from the AI module. This is what makes AI-run stations sound and behave identically to a human one.
- No new `source`/`origin` field on the `Command` type or anywhere in `src/engine/commands/`. Attribution for scoring is derived entirely from `aircraft.controller` membership in `gameState.playerStations` at the moment each event fires — this was the key simplification found during design, and re-introducing a source tag would contradict it.
- This is the only one of the four plans in this batch that touches `src/engine/` — it gets real Vitest coverage, following the exact fixture style already used in `src/engine/__tests__/command-executor.test.ts` and `src/engine/__tests__/arrival-lifecycle.test.ts` (a local `makeAircraft(overrides)` helper building a complete, valid `Aircraft` object).
- After every task that touches `src/engine/`, run the full suite (`npm test`) — not just the new test file — to catch any regression in the existing 156 tests.

---

### Task 1: `playerStations` on `GameState` and `GameStateSnapshot`

**Files:**
- Modify: `src/engine/types.ts`
- Modify: `src/engine/game-state.ts`
- Modify (if needed): `src/engine/__tests__/game-state.test.ts`

**Interfaces:**
- Produces: `GameState.playerStations: ControllerStation[]` (default: all three), `GameStateSnapshot.playerStations: ReadonlyArray<ControllerStation>` — consumed by `ai-controller.ts` (Task 2), `scoring.ts` (Task 4), `GameContext.tsx` (Task 5), `CommandPanel.tsx` (Task 7), `StatusBar.tsx` (Task 8).

- [ ] **Step 1: Add the field to `GameStateSnapshot`**

In `src/engine/types.ts`, find:

```ts
export interface GameStateSnapshot {
  readonly aircraft: ReadonlyMap<string, Readonly<Aircraft>>
  readonly score: number
  readonly scoreDimensions: Readonly<ScoreDimensions>
  readonly elapsedMs: number
  readonly aircraftHandled: number
  readonly paused: boolean
  readonly difficulty: DifficultyLevel
  readonly grade: Grade
  readonly sessionStarted: boolean
  readonly sessionEnded: boolean
  readonly airport: Readonly<Airport> | null
  readonly radioMessages: ReadonlyArray<RadioMessage>
  readonly wind: Readonly<Wind>
}
```

and add one field:

```ts
export interface GameStateSnapshot {
  readonly aircraft: ReadonlyMap<string, Readonly<Aircraft>>
  readonly score: number
  readonly scoreDimensions: Readonly<ScoreDimensions>
  readonly elapsedMs: number
  readonly aircraftHandled: number
  readonly paused: boolean
  readonly difficulty: DifficultyLevel
  readonly grade: Grade
  readonly sessionStarted: boolean
  readonly sessionEnded: boolean
  readonly airport: Readonly<Airport> | null
  readonly radioMessages: ReadonlyArray<RadioMessage>
  readonly wind: Readonly<Wind>
  readonly playerStations: ReadonlyArray<ControllerStation>
}
```

- [ ] **Step 2: Add the field to `GameState`, its `reset()`, and its `snapshot()`**

In `src/engine/game-state.ts`, change the type-only import at the top from:

```ts
import type {
  Aircraft,
  Airport,
  DifficultyPreset,
  DifficultyLevel,
  ScoreEvent,
  ScoreDimensions,
  Grade,
  Wind,
  RadioMessage,
  GameStateSnapshot,
  TaxiwayGraph,
} from './types'
```

to add a second, value (non-type-only) import for the `ControllerStation` enum right after it:

```ts
import type {
  Aircraft,
  Airport,
  DifficultyPreset,
  DifficultyLevel,
  ScoreEvent,
  ScoreDimensions,
  Grade,
  Wind,
  RadioMessage,
  GameStateSnapshot,
  TaxiwayGraph,
} from './types'
import { ControllerStation } from './types'
```

Then, in the `// ── Session ──` block, add the new field right after `sessionEnded`:

```ts
  // ── Session ──
  paused: boolean = false
  elapsedMs: number = 0
  difficulty: DifficultyPreset = DIFFICULTY_PRESETS.easy
  wind: Wind = { direction: 340, speed: 4 }
  sessionStartTime: number = 0
  sessionStarted: boolean = false
  sessionEnded: boolean = false
  /** Which stations the player personally controls this session; any station
   *  not in this list is driven by ai-controller.ts. Defaults to all three
   *  (today's behavior) unless narrowed at the briefing screen. */
  playerStations: ControllerStation[] = [ControllerStation.GROUND, ControllerStation.TOWER, ControllerStation.APPROACH]
```

In `reset()`, add one line (right after `this.sessionEnded = false`):

```ts
  reset(): void {
    this.aircraft.clear()
    this.selectedAircraftId = null
    this.score = INITIAL_SCORE
    this.scoreDimensions = { safety: 0, efficiency: 0, communication: 0, procedure: 0, awareness: 0 }
    this.scoreEvents = []
    this.aircraftHandled = 0
    this.paused = false
    this.elapsedMs = 0
    this.sessionStartTime = Date.now()
    this.sessionStarted = false
    this.sessionEnded = false
    this.playerStations = [ControllerStation.GROUND, ControllerStation.TOWER, ControllerStation.APPROACH]
    this.lastSpawnTime = 0
    this.occupiedGateIds.clear()
    this.separationCooldowns.clear()
    this.radioLog = []
  }
```

In `snapshot()`, add one field (right after `wind`):

```ts
  snapshot(): GameStateSnapshot {
    return {
      aircraft: new Map(this.aircraft),
      score: this.score,
      scoreDimensions: { ...this.scoreDimensions },
      elapsedMs: this.elapsedMs,
      aircraftHandled: this.aircraftHandled,
      paused: this.paused,
      difficulty: this.difficulty.level,
      grade: this.getGrade(),
      sessionStarted: this.sessionStarted,
      sessionEnded: this.sessionEnded,
      airport: this.airport,
      radioMessages: [...this.radioLog],
      wind: { ...this.wind },
      playerStations: [...this.playerStations],
    }
  }
```

- [ ] **Step 3: Run the full test suite and fix any snapshot-shape assertion**

Run: `npm test`
Expected: 156/156 still passing. If `src/engine/__tests__/game-state.test.ts` has a test that asserts deep-equality on the *entire* snapshot object (rather than checking specific fields), it will now fail because the actual snapshot has one more field than the expected literal in the test. If that happens, open `game-state.test.ts`, find the failing assertion, and add `playerStations: [ControllerStation.GROUND, ControllerStation.TOWER, ControllerStation.APPROACH]` (importing `ControllerStation` from `'../types'` in that test file if not already imported) to the expected object literal so it matches the new shape. Do not weaken the assertion (e.g. switching to a partial match) just to make it pass — match the real shape.

- [ ] **Step 4: Typecheck**

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add src/engine/types.ts src/engine/game-state.ts
git commit -m "feat: add playerStations to GameState/GameStateSnapshot, defaulting to all three stations"
```

---

### Task 2: `ai-controller.ts` — the decision table + AI tick function, with tests

**Files:**
- Create: `src/engine/ai-controller.ts`
- Create: `src/engine/__tests__/ai-controller.test.ts`
- Modify: `src/engine/constants.ts`

**Interfaces:**
- Consumes: `Aircraft`, `AircraftPhase`, `CommandType` from `./types`; `GameState` from `./game-state`; `processCommand` from `./commands/command-registry`.
- Produces: `nextExpectedCommand(aircraft: Aircraft): CommandType | null`, `runAiControllers(state: GameState, nowMs: number): void` — `runAiControllers` is consumed by `simulation-tick.ts` (Task 3).

- [ ] **Step 1: Add the pacing constant**

In `src/engine/constants.ts`, find the `// ─── Readback Delay ───` section:

```ts
// ─── Readback Delay ───────────────────────────────────────────────────────────

/** Min pilot readback delay in ms */
export const READBACK_DELAY_MIN_MS = 1500
/** Max pilot readback delay in ms */
export const READBACK_DELAY_MAX_MS = 2500
```

and add a new section right after it:

```ts
// ─── AI Controller Pacing ─────────────────────────────────────────────────────

/** Minimum real time between two AI-issued commands for the same aircraft —
 *  keeps the AI from machine-gunning a command the instant a phase changes,
 *  matching a human-like decision cadence. */
export const AI_MIN_DECISION_INTERVAL_MS = 4000
```

- [ ] **Step 2: Write `ai-controller.ts`**

```ts
import type { Aircraft } from './types'
import { AircraftPhase, CommandType } from './types'
import type { GameState } from './game-state'
import { processCommand } from './commands/command-registry'
import { AI_MIN_DECISION_INTERVAL_MS } from './constants'

/**
 * The single, deterministic next command a reliable autopilot controller
 * would issue for this aircraft's current phase — the "textbook" action.
 * Returns null when there is nothing to do this tick: either the phase is
 * mid-transition and movement/phase-transitions will advance it on their
 * own (TAXI_OUT, TAKEOFF_ROLL, LANDING, ROLLOUT), or it's a terminal phase
 * (DEPARTED, ARRIVED, MISSED).
 *
 * Every command returned here is already legal for the phase per
 * PHASE_COMMANDS/CONTROLLER_COMMANDS in constants.ts, so it can never be
 * rejected by validateCommand.
 */
export function nextExpectedCommand(aircraft: Aircraft): CommandType | null {
  switch (aircraft.phase) {
    case AircraftPhase.PARKED:
      return CommandType.TAXI
    case AircraftPhase.HOLD_SHORT:
      return CommandType.LINE_UP_WAIT
    case AircraftPhase.LINE_UP:
      return CommandType.CLEARED_TAKEOFF
    case AircraftPhase.CLIMBING:
      return CommandType.CONTACT_DEPARTURE
    case AircraftPhase.APPROACH:
      return aircraft.clearedForApproach ? CommandType.CONTACT_TOWER : CommandType.CLEARED_APPROACH
    case AircraftPhase.FINAL:
      // The one safety-aware branch: never clear a landing into an active
      // conflict. Retried on a later tick once the violation clears.
      return aircraft.inViolation ? null : CommandType.CLEARED_LAND
    case AircraftPhase.TAXI_IN:
      return CommandType.CONTACT_GROUND
    default:
      return null
  }
}

/**
 * Runs one AI decision pass over every aircraft not on a player-controlled
 * station. Issues at most one command per aircraft per call, through the
 * same processCommand() pipeline the player uses, so AI actions get the
 * same readback delay, phraseology, and radio log entries a human-issued
 * command would.
 */
export function runAiControllers(state: GameState, nowMs: number): void {
  if (!state.airport) return

  for (const aircraft of state.allAircraft()) {
    if (state.playerStations.includes(aircraft.controller)) continue
    if (aircraft.readbackTimer !== null) continue
    if (nowMs - aircraft.lastCommandTime < AI_MIN_DECISION_INTERVAL_MS) continue

    const commandType = nextExpectedCommand(aircraft)
    if (commandType === null) continue

    processCommand({ type: commandType, targetCallsign: aircraft.callsign, params: {} }, state.airport)
  }
}
```

- [ ] **Step 3: Write the failing tests**

```ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { GameState } from '../game-state'
import { moveAircraft, headingToRadians } from '../movement'
import { findRunwayById, loadAirport } from '../airport-loader'
import { processPhaseTransitions } from '../phase-transitions'
import { nextExpectedCommand, runAiControllers } from '../ai-controller'
import { AircraftPhase, CommandType, ControllerStation } from '../types'
import type { Aircraft } from '../types'
import hhasData from '../../data/airports/hhas.airport.json'

function makeAircraft(overrides: Partial<Aircraft> = {}): Aircraft {
  return {
    id: 'ai-1',
    callsign: 'AIT001',
    type: {
      icao: 'B738',
      name: 'Boeing 737-800',
      category: 'M',
      approachCategory: 'C',
      cruiseSpeed: 460,
      approachSpeed: 137,
      rotationSpeed: 145,
      taxiSpeed: 20,
      climbRate: 2500,
      descentRate: 1800,
      serviceCeiling: 41000,
    },
    flightType: 'arrival',
    squawk: '4521',
    x: 0,
    y: 0,
    altitude: 0,
    heading: 0,
    speed: 180,
    phase: AircraftPhase.APPROACH,
    controller: ControllerStation.APPROACH,
    clearedHeading: null,
    clearedAltitude: null,
    clearedSpeed: null,
    clearedToLand: false,
    clearedForApproach: false,
    assignedRunway: null,
    assignedTaxiway: null,
    assignedGate: null,
    taxiTarget: null,
    taxiRoute: null,
    taxiRouteIndex: 0,
    spawnTime: 0,
    lastCommandTime: 0,
    readbackTimer: null,
    urgent: false,
    inViolation: false,
    isSelected: false,
    handedOff: false,
    missedHeading: null,
    missedAltitude: null,
    trail: [],
    ...overrides,
  }
}

describe('nextExpectedCommand', () => {
  it('returns TAXI for PARKED', () => {
    expect(nextExpectedCommand(makeAircraft({ phase: AircraftPhase.PARKED }))).toBe(CommandType.TAXI)
  })

  it('returns LINE_UP_WAIT for HOLD_SHORT', () => {
    expect(nextExpectedCommand(makeAircraft({ phase: AircraftPhase.HOLD_SHORT }))).toBe(CommandType.LINE_UP_WAIT)
  })

  it('returns CLEARED_TAKEOFF for LINE_UP', () => {
    expect(nextExpectedCommand(makeAircraft({ phase: AircraftPhase.LINE_UP }))).toBe(CommandType.CLEARED_TAKEOFF)
  })

  it('returns CONTACT_DEPARTURE for CLIMBING', () => {
    expect(nextExpectedCommand(makeAircraft({ phase: AircraftPhase.CLIMBING }))).toBe(CommandType.CONTACT_DEPARTURE)
  })

  it('returns CLEARED_APPROACH for APPROACH when not yet cleared', () => {
    expect(nextExpectedCommand(makeAircraft({ phase: AircraftPhase.APPROACH, clearedForApproach: false }))).toBe(CommandType.CLEARED_APPROACH)
  })

  it('returns CONTACT_TOWER for APPROACH once cleared', () => {
    expect(nextExpectedCommand(makeAircraft({ phase: AircraftPhase.APPROACH, clearedForApproach: true }))).toBe(CommandType.CONTACT_TOWER)
  })

  it('returns CLEARED_LAND for FINAL when not in violation', () => {
    expect(nextExpectedCommand(makeAircraft({ phase: AircraftPhase.FINAL, inViolation: false }))).toBe(CommandType.CLEARED_LAND)
  })

  it('returns null for FINAL when in an active violation (safety branch)', () => {
    expect(nextExpectedCommand(makeAircraft({ phase: AircraftPhase.FINAL, inViolation: true }))).toBeNull()
  })

  it('returns CONTACT_GROUND for TAXI_IN', () => {
    expect(nextExpectedCommand(makeAircraft({ phase: AircraftPhase.TAXI_IN }))).toBe(CommandType.CONTACT_GROUND)
  })

  it('returns null for phases with nothing left to command', () => {
    expect(nextExpectedCommand(makeAircraft({ phase: AircraftPhase.TAXI_OUT }))).toBeNull()
    expect(nextExpectedCommand(makeAircraft({ phase: AircraftPhase.TAKEOFF_ROLL }))).toBeNull()
    expect(nextExpectedCommand(makeAircraft({ phase: AircraftPhase.LANDING }))).toBeNull()
    expect(nextExpectedCommand(makeAircraft({ phase: AircraftPhase.ROLLOUT }))).toBeNull()
    expect(nextExpectedCommand(makeAircraft({ phase: AircraftPhase.ARRIVED }))).toBeNull()
    expect(nextExpectedCommand(makeAircraft({ phase: AircraftPhase.DEPARTED }))).toBeNull()
    expect(nextExpectedCommand(makeAircraft({ phase: AircraftPhase.MISSED }))).toBeNull()
  })
})

describe('runAiControllers — integration, real HHAS data + real command pipeline', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('carries an arrival from APPROACH to ARRIVED with zero player-issued commands', () => {
    const state = new GameState()
    state.airport = loadAirport(hhasData)
    state.playerStations = [] // nothing is player-controlled — the AI must do everything

    const rwy = state.airport.runways[0]
    const rad = headingToRadians(rwy.trueHeading)
    const aircraft = makeAircraft({
      x: rwy.thresholdX - Math.cos(rad) * 8,
      y: rwy.thresholdY - Math.sin(rad) * 8,
      heading: rwy.trueHeading,
      altitude: rwy.elevationFt + 8 * 318 + 200,
      lastCommandTime: Date.now(),
    })
    state.addAircraft(aircraft)

    // 30 simulated minutes at 1 Hz, same bound as the existing arrival-lifecycle
    // test — plenty for 8 NM + rollout + taxi. Each iteration also advances the
    // fake clock by more than the readback delay (max 2500ms) and the AI's own
    // pacing interval (4000ms), so a pending command actually executes and the
    // AI is free to issue its next one before the next simulated second ticks.
    for (let t = 0; t < 1800 && aircraft.phase !== AircraftPhase.ARRIVED; t++) {
      const runway = aircraft.assignedRunway ? findRunwayById(state.airport, aircraft.assignedRunway) : null
      moveAircraft(aircraft, 1, runway)
      processPhaseTransitions(aircraft, runway, state.airport)
      runAiControllers(state, Date.now())
      vi.advanceTimersByTime(4100)
    }

    expect(aircraft.phase).toBe(AircraftPhase.ARRIVED)
  })
})
```

- [ ] **Step 4: Run the new tests and verify they pass**

Run: `npx vitest run src/engine/__tests__/ai-controller.test.ts`
Expected: all tests pass (11 `nextExpectedCommand` cases + 1 integration test = 12 tests). If the integration test times out or the aircraft never reaches `ARRIVED`, check: (a) `vi.useFakeTimers()` is active (the `beforeEach` above), (b) the fake-timer advance (`4100`) is happening *after* `runAiControllers` each loop iteration, not before.

- [ ] **Step 5: Run the full suite**

Run: `npm test`
Expected: 156 + 12 = 168 tests passing, 8 test files.

- [ ] **Step 6: Typecheck**

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add src/engine/ai-controller.ts src/engine/__tests__/ai-controller.test.ts src/engine/constants.ts
git commit -m "feat: add ai-controller module — deterministic autopilot for non-player-controlled stations"
```

---

### Task 3: Wire `runAiControllers` into the simulation tick

**Files:**
- Modify: `src/engine/simulation-tick.ts`

**Interfaces:**
- Consumes: `runAiControllers` from `./ai-controller` (Task 2).

`aircraft.inViolation` (checked by `nextExpectedCommand`'s `FINAL` branch) is only accurate for the *current* tick after separation checking has run — so this step must be placed after separation checking, not before.

- [ ] **Step 1: Add the import and the new step**

In `src/engine/simulation-tick.ts`, add the import:

```ts
import { runAiControllers } from './ai-controller'
```

Then find:

```ts
  // 6. Separation Checking
  separationChecker.checkSeparation(state.allAircraft(), nowMs)

  // 7. Session Expiry Check
  if (state.isSessionExpired() && !state.sessionEnded) {
```

and insert the new step between them, renumbering the two comments that follow:

```ts
  // 6. Separation Checking
  separationChecker.checkSeparation(state.allAircraft(), nowMs)

  // 7. AI Controller Decisions — after separation checking so inViolation
  // flags are current for this tick (nextExpectedCommand's FINAL branch
  // checks it).
  runAiControllers(state, nowMs)

  // 8. Session Expiry Check
  if (state.isSessionExpired() && !state.sessionEnded) {
```

and change the final comment from `// 8. Flush queued events` to `// 9. Flush queued events` (purely cosmetic renumbering — no behavior change):

```ts
  // 9. Flush queued events
  eventBus.flush()
```

- [ ] **Step 2: Run the full suite**

Run: `npm test`
Expected: 168/168 still passing (this step only adds a new call inside `tick()`; no existing test calls `tick()` in a way that would newly interact with AI logic, since `state.playerStations` defaults to all three stations for any `GameState` constructed without explicitly narrowing it, which is what every existing test does).

- [ ] **Step 3: Typecheck**

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 4: Manual verification**

Run `npm run dev`, click START (default: all three stations are yours, so no AI activity is expected yet — this just confirms nothing broke). Confirm the game plays exactly as before. (AI-driven behavior becomes observable once Task 6 lets you actually narrow your stations — verify AI behavior there instead of here.)

- [ ] **Step 5: Commit**

```bash
git add src/engine/simulation-tick.ts
git commit -m "feat: wire AI controller decisions into the simulation tick, after separation checking"
```

---

### Task 4: Scoring attribution guard

**Files:**
- Modify: `src/engine/scoring.ts`
- Create: `src/engine/__tests__/scoring.test.ts`

**Interfaces:**
- Consumes: `gameState.playerStations`, `gameState.getAircraftByCallsign` (both already exist).

- [ ] **Step 1: Add the guard to `handleScoreEvent`**

In `src/engine/scoring.ts`, change:

```ts
function handleScoreEvent(reason: ScoreReason, e: GameEvent): void {
  const callsign = (e.payload.callsign as string) || 'UNKNOWN'
  const delta = SCORE_DELTAS[reason]
```

to:

```ts
function handleScoreEvent(reason: ScoreReason, e: GameEvent): void {
  const callsign = (e.payload.callsign as string) || 'UNKNOWN'

  // AI-controlled outcome — not the player's to be scored on. aircraft.controller
  // at the moment any score-relevant event fires already reflects whoever is
  // currently responsible, whether the triggering command came from the
  // player or from ai-controller.ts.
  const aircraft = gameState.getAircraftByCallsign(callsign)
  if (aircraft && !gameState.playerStations.includes(aircraft.controller)) return

  const delta = SCORE_DELTAS[reason]
```

- [ ] **Step 2: Write the failing tests**

```ts
import { describe, it, expect, beforeEach } from 'vitest'
import { gameState } from '../game-state'
import { initializeScoringSystem } from '../scoring'
import { eventBus } from '../event-bus'
import { GameEventType, ControllerStation, AircraftPhase } from '../types'
import type { Aircraft } from '../types'

// Called once for this test file's lifetime, matching how GameContext.tsx
// calls it once for the whole app — calling it again per-test would
// double-subscribe the event bus and double-count every score change.
initializeScoringSystem()

function makeAircraft(overrides: Partial<Aircraft> = {}): Aircraft {
  return {
    id: 'sc-1',
    callsign: 'SCR001',
    type: {
      icao: 'B738',
      name: 'Boeing 737-800',
      category: 'M',
      approachCategory: 'C',
      cruiseSpeed: 460,
      approachSpeed: 137,
      rotationSpeed: 145,
      taxiSpeed: 20,
      climbRate: 2500,
      descentRate: 1800,
      serviceCeiling: 41000,
    },
    flightType: 'departure',
    squawk: '1200',
    x: 0,
    y: 0,
    altitude: 0,
    heading: 0,
    speed: 0,
    phase: AircraftPhase.CLIMBING,
    controller: ControllerStation.TOWER,
    clearedHeading: null,
    clearedAltitude: null,
    clearedSpeed: null,
    clearedToLand: false,
    clearedForApproach: false,
    assignedRunway: null,
    assignedTaxiway: null,
    assignedGate: null,
    taxiTarget: null,
    taxiRoute: null,
    taxiRouteIndex: 0,
    spawnTime: 0,
    lastCommandTime: 0,
    readbackTimer: null,
    urgent: false,
    inViolation: false,
    isSelected: false,
    handedOff: false,
    missedHeading: null,
    missedAltitude: null,
    trail: [],
    ...overrides,
  }
}

describe('scoring — player-station attribution', () => {
  beforeEach(() => {
    gameState.reset()
  })

  it('scores a takeoff event when the aircraft is on a player-controlled station', () => {
    gameState.playerStations = [ControllerStation.GROUND, ControllerStation.TOWER, ControllerStation.APPROACH]
    const aircraft = makeAircraft({ controller: ControllerStation.TOWER })
    gameState.addAircraft(aircraft)
    const scoreBefore = gameState.score

    eventBus.emit(GameEventType.TAKEOFF, { callsign: aircraft.callsign })

    expect(gameState.score).toBe(scoreBefore + 20) // SCORE_DELTAS.takeoff
  })

  it('does not score a takeoff event when the aircraft is on an AI-controlled station', () => {
    gameState.playerStations = [ControllerStation.GROUND] // TOWER is AI-controlled
    const aircraft = makeAircraft({ controller: ControllerStation.TOWER })
    gameState.addAircraft(aircraft)
    const scoreBefore = gameState.score

    eventBus.emit(GameEventType.TAKEOFF, { callsign: aircraft.callsign })

    expect(gameState.score).toBe(scoreBefore)
  })
})
```

- [ ] **Step 3: Run the new tests**

Run: `npx vitest run src/engine/__tests__/scoring.test.ts`
Expected: both tests pass.

- [ ] **Step 4: Run the full suite**

Run: `npm test`
Expected: 168 + 2 = 170 tests passing, 9 test files.

- [ ] **Step 5: Typecheck**

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add src/engine/scoring.ts src/engine/__tests__/scoring.test.ts
git commit -m "feat: exclude AI-controlled aircraft outcomes from scoring"
```

---

### Task 5: `setPlayerStations` on `GameContext`

**Files:**
- Modify: `src/state/GameContext.tsx`

**Interfaces:**
- Produces: `GameContextType.setPlayerStations: (stations: ControllerStation[]) => void` — consumed by `BriefingScreen.tsx` (Task 6).

- [ ] **Step 1: Add the import and the method**

In `src/state/GameContext.tsx`, change:

```ts
import type { GameStateSnapshot, DifficultyLevel, Airport, Command } from '../engine/types'
```

to:

```ts
import type { GameStateSnapshot, DifficultyLevel, Airport, Command } from '../engine/types'
import type { ControllerStation } from '../engine/types'
```

Add to `GameContextType`:

```ts
export interface GameContextType {
  state: GameStateSnapshot
  selectAircraft: (id: string | null) => void
  issueCommand: (command: Command) => void
  togglePause: () => void
  resetGame: () => void
  setDifficulty: (level: DifficultyLevel) => void
  startSession: () => void
  setPlayerStations: (stations: ControllerStation[]) => void
}
```

(If the Pause Menu plan has already landed, this interface will also have `muted`/`toggleMute` — add `setPlayerStations` alongside those, the ordering doesn't matter.)

Add the method inside `GameProvider`, next to `setDifficulty`:

```ts
  const setPlayerStations = (stations: ControllerStation[]) => {
    gameState.playerStations = stations
    setSnapshot(gameState.snapshot())
  }
```

Add it to the `value` object:

```ts
  const value: GameContextType = {
    state: snapshot,
    selectAircraft,
    issueCommand,
    togglePause,
    resetGame,
    setDifficulty,
    startSession,
    setPlayerStations
  }
```

(Again, merge with `muted`/`toggleMute` if the Pause Menu plan already added those.)

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/state/GameContext.tsx
git commit -m "feat: add setPlayerStations to GameContext"
```

---

### Task 6: Station-selection UI on `BriefingScreen`

**Files:**
- Modify: `src/components/BriefingScreen.tsx`

**Interfaces:**
- Consumes: `setPlayerStations` from `useGame()` (Task 5).

- [ ] **Step 1: Add the station picker**

In `src/components/BriefingScreen.tsx`, change the imports from:

```ts
import { useState } from 'react'
import { useGame } from '../state/GameContext'
import type { DifficultyLevel } from '../engine/types'
import { DIFFICULTY_PRESETS, CSS_COLORS } from '../engine/constants'
```

to:

```ts
import { useState } from 'react'
import { useGame } from '../state/GameContext'
import type { DifficultyLevel } from '../engine/types'
import { ControllerStation } from '../engine/types'
import { DIFFICULTY_PRESETS, CSS_COLORS } from '../engine/constants'
```

Add these constants right after `DIFF_LABELS`:

```ts
const STATION_ORDER: ControllerStation[] = [ControllerStation.GROUND, ControllerStation.TOWER, ControllerStation.APPROACH]

const STATION_LABELS: Record<ControllerStation, string> = {
  [ControllerStation.GROUND]: 'GROUND',
  [ControllerStation.TOWER]: 'TOWER',
  [ControllerStation.APPROACH]: 'APPROACH',
  [ControllerStation.AREA]: 'AREA', // never shown — not a player-selectable station
}
```

Change the component from:

```tsx
export default function BriefingScreen() {
  const { setDifficulty, startSession } = useGame()
  const [selected, setSelected] = useState<DifficultyLevel>('medium')

  const preset = DIFFICULTY_PRESETS[selected]

  const handleStart = () => {
    setDifficulty(selected)
    startSession()
  }
```

to:

```tsx
export default function BriefingScreen() {
  const { setDifficulty, setPlayerStations, startSession } = useGame()
  const [selected, setSelected] = useState<DifficultyLevel>('medium')
  const [stations, setStations] = useState<ControllerStation[]>(STATION_ORDER)

  const preset = DIFFICULTY_PRESETS[selected]

  const toggleStation = (station: ControllerStation) => {
    setStations(prev => {
      if (prev.includes(station)) {
        if (prev.length === 1) return prev // at least one must stay selected
        return prev.filter(s => s !== station)
      }
      return [...prev, station]
    })
  }

  const handleStart = () => {
    setDifficulty(selected)
    setPlayerStations(stations)
    startSession()
  }
```

Then, in the returned JSX, insert a new section between the existing "Difficulty" block and the `{preset && (...)}` stats block. Find:

```tsx
        <div style={{ marginBottom: 20 }}>
          <div style={{ color: CSS_COLORS.text.secondary, fontSize: 10, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 }}>
            Difficulty
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            {DIFF_ORDER.map((d) => (
              <button
                key={d}
                onClick={() => setSelected(d)}
                style={{
                  flex: 1,
                  padding: '8px 0',
                  background: selected === d ? '#0EA5E9' : '#1D2430',
                  color: selected === d ? '#FFF' : CSS_COLORS.text.secondary,
                  border: selected === d ? '1px solid #0EA5E9' : '1px solid #1E293B',
                  borderRadius: 4,
                  cursor: 'pointer',
                  fontWeight: selected === d ? 700 : 400,
                  fontSize: 12,
                  fontFamily: 'inherit',
                  transition: 'all 0.1s',
                }}
              >
                {DIFF_LABELS[d]}
              </button>
            ))}
          </div>
        </div>

        {preset && (
```

and insert the new block right before `{preset && (`:

```tsx
        <div style={{ marginBottom: 20 }}>
          <div style={{ color: CSS_COLORS.text.secondary, fontSize: 10, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 }}>
            Your Stations
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            {STATION_ORDER.map((s) => {
              const active = stations.includes(s)
              return (
                <button
                  key={s}
                  onClick={() => toggleStation(s)}
                  style={{
                    flex: 1,
                    padding: '8px 0',
                    background: active ? '#0EA5E9' : '#1D2430',
                    color: active ? '#FFF' : CSS_COLORS.text.secondary,
                    border: active ? '1px solid #0EA5E9' : '1px solid #1E293B',
                    borderRadius: 4,
                    cursor: 'pointer',
                    fontWeight: active ? 700 : 400,
                    fontSize: 12,
                    fontFamily: 'inherit',
                    transition: 'all 0.1s',
                  }}
                >
                  {STATION_LABELS[s]}
                </button>
              )
            })}
          </div>
          <div style={{ marginTop: 6, fontSize: 10, color: CSS_COLORS.text.muted }}>
            Unselected stations are handled automatically.
          </div>
        </div>

        {preset && (
```

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 3: Manual verification**

Run `npm run dev`. On the briefing screen, confirm three new GROUND/TOWER/APPROACH toggle buttons appear, all active by default. Click one off — confirm it deactivates. Click the last remaining active one — confirm it does *not* deactivate (at least one must stay on). Click START with only GROUND selected, then let traffic build up: confirm Tower and Approach commands now happen on their own (you'll see phraseology appear in the radio log for TOWER/APPROACH-station aircraft without you touching the command panel) — this is Task 7 (tab filtering) and Task 8 (readout) that make this fully visible; for now just confirm the sim doesn't stall waiting on stations you didn't pick.

- [ ] **Step 4: Commit**

```bash
git add src/components/BriefingScreen.tsx
git commit -m "feat: add controller-station selection to the briefing screen"
```

---

### Task 7: `CommandPanel` — only show tabs for the player's own stations

**Files:**
- Modify: `src/components/CommandPanel.tsx`

**Interfaces:**
- Consumes: `state.playerStations` (Task 1).

- [ ] **Step 1: Filter the tab bar**

In `src/components/CommandPanel.tsx`, change:

```tsx
export default function CommandPanel() {
  const { state, issueCommand } = useGame()
  const [activeStation, setActiveStation] = useState<ControllerStation>(ControllerStation.TOWER)
  const [pendingCmd, setPendingCmd] = useState<CommandType | null>(null)
  const [paramValue, setParamValue] = useState('')
  const paramInputRef = useRef<HTMLInputElement>(null)

  const selectedAircraft = Array.from(state.aircraft.values()).find((ac) => ac.isSelected) ?? null

  const availableCommands = CONTROLLER_COMMANDS[activeStation]
```

to:

```tsx
export default function CommandPanel() {
  const { state, issueCommand } = useGame()
  const [activeStation, setActiveStation] = useState<ControllerStation>(ControllerStation.TOWER)
  const [pendingCmd, setPendingCmd] = useState<CommandType | null>(null)
  const [paramValue, setParamValue] = useState('')
  const paramInputRef = useRef<HTMLInputElement>(null)

  const visibleTabs = STATION_TABS.filter((tab) => state.playerStations.includes(tab.station))

  // If the player narrows their stations while a now-hidden tab is active
  // (or on first mount, since the default activeStation is TOWER regardless
  // of what was actually selected), snap to the first station still visible.
  useEffect(() => {
    if (!state.playerStations.includes(activeStation) && visibleTabs.length > 0) {
      setActiveStation(visibleTabs[0].station)
    }
  }, [state.playerStations, activeStation, visibleTabs])

  const selectedAircraft = Array.from(state.aircraft.values()).find((ac) => ac.isSelected) ?? null

  const availableCommands = CONTROLLER_COMMANDS[activeStation]
```

Then, in the returned JSX, change:

```tsx
      {/* Tab bar */}
      <div style={S.tabBar}>
        {STATION_TABS.map((tab) => {
          const active = activeStation === tab.station
          return (
            <button
              key={tab.station}
              className={active ? 'cp-tab-btn-active' : 'cp-tab-btn'}
              style={S.tabBtn(active)}
              onClick={() => {
                setActiveStation(tab.station)
                setPendingCmd(null)
              }}
            >
              {tab.label} {tab.frequency.toFixed(1)}
            </button>
          )
        })}
      </div>
```

to:

```tsx
      {/* Tab bar — only shown when there is more than one station to switch between */}
      {visibleTabs.length > 1 && (
        <div style={S.tabBar}>
          {visibleTabs.map((tab) => {
            const active = activeStation === tab.station
            return (
              <button
                key={tab.station}
                className={active ? 'cp-tab-btn-active' : 'cp-tab-btn'}
                style={S.tabBtn(active)}
                onClick={() => {
                  setActiveStation(tab.station)
                  setPendingCmd(null)
                }}
              >
                {tab.label} {tab.frequency.toFixed(1)}
              </button>
            )
          })}
        </div>
      )}
```

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: no errors (`useEffect` is already imported in this file — no import changes needed).

- [ ] **Step 3: Manual verification**

Run `npm run dev`, start a session with only GROUND selected. Confirm the tab bar is gone entirely (nothing to switch to) and the command buttons shown are Ground's. Restart with GROUND + TOWER selected — confirm exactly two tabs appear (no APPROACH tab), and clicking between them works. Restart with all three (default) — confirm all three tabs appear exactly as before this change.

- [ ] **Step 4: Commit**

```bash
git add src/components/CommandPanel.tsx
git commit -m "feat: only show CommandPanel tabs for the player's own stations"
```

---

### Task 8: `StatusBar` — GND/TWR/APP split readout

**Files:**
- Modify: `src/components/StatusBar.tsx`

**Interfaces:**
- Consumes: `state.playerStations` (Task 1).

- [ ] **Step 1: Add the readout**

In `src/components/StatusBar.tsx`, change the import from:

```tsx
import React from 'react'
import { useGame } from '../state/GameContext'
import { AircraftPhase } from '../engine/types'
```

to:

```tsx
import React from 'react'
import { useGame } from '../state/GameContext'
import { AircraftPhase, ControllerStation } from '../engine/types'

const STATION_ORDER: ControllerStation[] = [ControllerStation.GROUND, ControllerStation.TOWER, ControllerStation.APPROACH]
const STATION_SHORT_LABELS: Record<ControllerStation, string> = {
  [ControllerStation.GROUND]: 'GND',
  [ControllerStation.TOWER]: 'TWR',
  [ControllerStation.APPROACH]: 'APP',
  [ControllerStation.AREA]: 'AREA',
}
```

Then, in the returned JSX, find the right-hand group (this is written against the file's state *after* the TTS Quality plan has landed — if it hasn't, there will be no `{!ttsAvailable && (...)}` block, so just insert the new block right before the `PAUSE`/`RESUME` `<button>` instead):

```tsx
      <div style={{ display: 'flex', gap: 12, fontSize: 11, alignItems: 'center' }}>
        <div style={{ display: 'flex', gap: 4 }}>
          <span style={{ color: '#22c55e' }}>AIR: {airborneCount}</span>
          <span style={{ color: '#64748B' }}>|</span>
          <span style={{ color: '#eab308' }}>GND: {groundCount}</span>
        </div>

        {!ttsAvailable && (
          <span style={{ color: '#94A3B8' }}>TTS: CAPTIONS ONLY</span>
        )}

        <button 
```

and insert the station-split readout between the TTS indicator and the button:

```tsx
      <div style={{ display: 'flex', gap: 12, fontSize: 11, alignItems: 'center' }}>
        <div style={{ display: 'flex', gap: 4 }}>
          <span style={{ color: '#22c55e' }}>AIR: {airborneCount}</span>
          <span style={{ color: '#64748B' }}>|</span>
          <span style={{ color: '#eab308' }}>GND: {groundCount}</span>
        </div>

        {!ttsAvailable && (
          <span style={{ color: '#94A3B8' }}>TTS: CAPTIONS ONLY</span>
        )}

        <div style={{ display: 'flex', gap: 6, color: '#64748B' }}>
          {STATION_ORDER.map((s) => (
            <span key={s}>
              {STATION_SHORT_LABELS[s]}:{' '}
              <span style={{ color: state.playerStations.includes(s) ? '#22c55e' : '#eab308' }}>
                {state.playerStations.includes(s) ? 'YOU' : 'AI'}
              </span>
            </span>
          ))}
        </div>

        <button 
```

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 3: Manual verification**

Run `npm run dev`, start a session with only GROUND selected. Confirm the status bar shows `GND: YOU`, `TWR: AI`, `APP: AI` (YOU in green, AI in amber). Restart with all three selected (default) — confirm all three show `YOU`.

- [ ] **Step 4: Commit**

```bash
git add src/components/StatusBar.tsx
git commit -m "feat: show which stations are player- vs AI-controlled in the status bar"
```

---

## Self-Review Notes

- **Spec coverage:** station selection with a non-empty-subset constraint (Task 6), the AI decision table covering every phase row from the spec (Task 2), the safety-aware FINAL branch (Task 2), scoring/mission attribution via the `aircraft.controller` membership check with no new `Command` field (Task 4), tab-bar visibility (Task 7), and the status-bar split readout (Task 8) are each covered.
- **Placeholder scan:** none found.
- **Type consistency:** `nextExpectedCommand(aircraft: Aircraft): CommandType | null` (Task 2) is called identically in its own tests and via `runAiControllers` in the same file. `GameState.playerStations: ControllerStation[]` (Task 1) matches the type used in `setPlayerStations(stations: ControllerStation[])` (Task 5), `BriefingScreen`'s `stations` state (Task 6), and every `state.playerStations.includes(...)` call site (Tasks 2, 4, 7, 8).
- **Ordering dependency called out explicitly:** Task 3's placement of `runAiControllers` *after* separation checking (not before) is called out both in the Global Constraints and in Task 3's own code comment, since it is easy to misplace and would silently make the FINAL/inViolation safety branch always see stale data from the *previous* tick.
