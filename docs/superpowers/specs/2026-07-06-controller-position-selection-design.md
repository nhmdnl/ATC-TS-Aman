# Controller-Position Selection + AI-Controlled Stations — Design

## Context

The player currently controls all three stations (Ground/Tower/Approach)
for every aircraft, all the time. The request is to let the player pick, at
the briefing screen, which station(s) they personally control; whichever
stations they don't pick should be handled by simple, reliable game logic
so the session flow never breaks waiting for a station nobody is running.

This is the largest of the four features — it touches the briefing screen,
`CommandPanel`, the command pipeline's scoring attribution, and adds one new
engine module. Everything else in the sim (movement, phase transitions,
separation checking, phraseology, radio log) is reused unchanged.

## Goals

- At the briefing screen, the player picks any non-empty subset of
  {Ground, Tower, Approach}. Default: all three selected (today's behavior,
  unchanged unless the player opts to narrow it).
- Stations not selected are driven by a new `ai-controller` engine module
  that issues the same commands a competent human controller would, through
  the *same* command pipeline the player uses — so AI actions get the same
  readback delay, phraseology, and radio log entries. To the player, an
  AI-run station sounds and behaves like a real one, just not clickable.
- Score, mission objectives, and aircraft-handled counts reflect the
  player's stations only — the AI doesn't rack up points on the player's
  behalf, and doesn't get blamed for anything either (there's no
  penalty/scoring surface for it at all).
- The AI is simple and deterministic: it always takes the one obviously
  correct next action for a phase. It does not do conflict-aware sequencing
  or handle edge cases beyond "don't clear a landing into an active
  conflict." This matches the existing `ponytail:` simplifications already
  in the codebase (e.g. always active runway = first runway).

## Non-goals

- AI mistakes, personality, or variable competence — it's a reliable
  autopilot, not a second player to out-perform.
- AI voice/TTS distinct from the player's phraseology system — it uses the
  exact same `generatePhraseology()` output.
- Runtime station handoff mid-session (e.g. "let me take Tower now") — the
  split is fixed for the session, chosen at the briefing screen. Revisiting
  this is a natural follow-up once the base mechanism exists.

## Architecture

### 1. Station selection state

`GameState` gets one new field:

```ts
playerStations: ControllerStation[] = [ControllerStation.GROUND, ControllerStation.TOWER, ControllerStation.APPROACH]
```

Reset to the full set in `reset()` (so the default is always "control
everything" unless explicitly narrowed for the next session), included in
`GameStateSnapshot` as `readonly playerStations: ReadonlyArray<ControllerStation>`.

`GameContext` gets `setPlayerStations(stations: ControllerStation[])`,
mirroring the existing `setDifficulty()` pattern: mutates
`gameState.playerStations` then pushes a new snapshot.

### 2. Briefing screen UI

`BriefingScreen.tsx` gets a new section below difficulty selection: three
toggle buttons (GROUND / TOWER / APPROACH), multi-select, same visual
treatment as the existing difficulty buttons. At least one must stay
selected — clicking the last remaining active station is a no-op (mirrors
how difficulty selection already only allows exactly one, just inverted to
"at least one" here). `handleStart` calls `setPlayerStations(selected)`
alongside the existing `setDifficulty(selected)` before `startSession()`.

### 3. AI controller module — `src/engine/ai-controller.ts` (new)

One exported function, `runAiControllers(state: GameState, nowMs: number): void`,
called from `simulation-tick.ts`'s `tick()` as a new step after phase
transitions settle for the tick (step 4, renumbering the existing steps
down):

```ts
for (const aircraft of state.allAircraft()) {
  if (state.playerStations.includes(aircraft.controller)) continue   // player's own station — leave it alone
  if (aircraft.readbackTimer !== null) continue                       // already has a command in flight
  if (nowMs - aircraft.lastCommandTime < AI_MIN_DECISION_INTERVAL_MS) continue  // pace it like a human would

  const command = nextExpectedCommand(aircraft)
  if (command) {
    processCommand({ type: command, targetCallsign: aircraft.callsign, params: {} }, state.airport)
  }
}
```

`AI_MIN_DECISION_INTERVAL_MS` (a new constant, ~3-5s) keeps the AI from
machine-gunning commands the instant a phase changes — it "notices" and
acts on a human-like cadence, matching the existing readback-delay flavor
of the rest of the command pipeline.

`nextExpectedCommand(aircraft)` is a pure lookup, one deterministic action
per phase:

| Phase | AI command | Notes |
|---|---|---|
| `PARKED` (departure) | `TAXI` | Runway param omitted — `command-executor.ts` already assigns the first runway when none is given, matching the existing ponytail simplification. |
| `HOLD_SHORT` | `LINE_UP_WAIT` | |
| `LINE_UP` | `CLEARED_TAKEOFF` | |
| `CLIMBING` | `CONTACT_DEPARTURE` | Hands off once climbing — matches how a real Tower clears a departure to Departure/Area promptly. |
| `APPROACH`, not yet cleared | `CLEARED_APPROACH` | `command-executor.ts` already auto-assigns the runway on this command. |
| `APPROACH`, cleared | `CONTACT_TOWER` | Approach hands to Tower once established. |
| `FINAL`, not in violation | `CLEARED_LAND` | Skipped while `aircraft.inViolation` — the one safety-aware branch: don't clear a landing into an active conflict. Retried next eligible tick once clear. |
| `TAXI_IN` | `CONTACT_GROUND` | Tower hands the landed aircraft to Ground. Note: `PHASE_COMMANDS[ROLLOUT]` only allows `EXIT_RUNWAY`/`SQUAWK` — `CONTACT_GROUND` isn't legal until `TAXI_IN`, even though `aircraft.controller` is already auto-synced to `GROUND` by then via `PHASE_CONTROLLER` (phase-transitions.ts sets it on every phase change regardless of commands). Issuing it anyway still matters for the phraseology/radio-log realism, even though the controller field itself wouldn't change. |
| everything else | *(none)* | `TAXI_OUT`, `TAKEOFF_ROLL`, `LANDING`, `MISSED`, `DEPARTED`, `ARRIVED` — either mid-transition (movement/phase-transitions already drive them automatically) or a terminal phase with nothing left to command. |

This table only ever produces commands already in `CONTROLLER_COMMANDS`/
`PHASE_COMMANDS` for that phase, so it can never trigger a validation
rejection.

### 4. Scoring/mission attribution

**Key simplification found while designing this:** attribution doesn't need
a new `source` tag threaded through the `Command` type and command
pipeline. `scoring.ts`'s `handleScoreEvent()` is already the single
funnel every score-affecting event passes through. Adding one guard there:

```ts
function handleScoreEvent(reason: ScoreReason, e: GameEvent): void {
  const callsign = (e.payload.callsign as string) || 'UNKNOWN'
  const aircraft = gameState.getAircraftByCallsign(callsign)
  if (aircraft && !gameState.playerStations.includes(aircraft.controller)) return  // AI-controlled — not the player's outcome
  // ...existing logic unchanged
}
```

This works because `aircraft.controller` at the moment any score-relevant
event fires (`COMMAND_ISSUED`, `TAKEOFF`, `LANDING`, `ARRIVED_GATE`,
`MISSED_APPROACH`, `SEPARATION_VIOLATION`) already reflects *whoever is
currently responsible* for that aircraft — whether the command was typed by
the player or issued by the AI. No new field, no changes to
`command-registry.ts`, `command-executor.ts`, or the `Command` type.

Mission objectives (`mission-system.ts`) key off `GameStateSnapshot`
directly rather than events, so they need no change at all in the current
mission set — but any future objective checking "was a command issued" should
follow the same `playerStations` membership check.

### 5. UI: making the split visible

`CommandPanel.tsx`'s station tab bar (`GND`/`TWR`/`APP`) only shows tabs for
stations in `state.playerStations` — if the player picked Ground only,
there's one tab, not three (nothing to click for stations that aren't
theirs). If exactly one station is selected, the tab bar can be hidden
entirely (nothing to switch between).

A small persistent readout — added to `StatusBar.tsx`, next to the existing
traffic counts — shows the split at a glance, e.g. `GND: YOU · TWR: AI · APP: AI`,
so the player always knows who's flying which frequency without opening the
guide panel.

## Error handling

- `nextExpectedCommand` returning nothing for a phase is the expected
  steady state for most phases most of the time — not an error, just "AI has
  nothing to do this tick."
- If `state.airport` is null (shouldn't happen mid-session, but
  `processCommand` already requires it), `runAiControllers` is called after
  the existing `if (!state.airport) return` guard at the top of `tick()`, so
  it's never invoked in that state.
- If a player narrows to a single station and that station's own aircraft
  queue empties out entirely, nothing breaks — `runAiControllers` simply has
  nothing to act on for the other two stations' traffic until more spawns.

## Testing

This is the one feature in this batch that touches `src/engine/`, so it
gets real Vitest coverage, following the existing pattern in
`__tests__/command-executor.test.ts` and `__tests__/arrival-lifecycle.test.ts`:

- `nextExpectedCommand` unit tests: one assertion per phase row in the table
  above, plus the "in violation → no command" branch for `FINAL`.
- An integration test extending the existing arrival-lifecycle style: spawn
  an aircraft, set `playerStations` to exclude its controlling station,
  run `tick()` repeatedly, and assert it progresses through phases without
  any player-issued commands — proving the AI alone can carry a flight from
  spawn to `ARRIVED`/`DEPARTED`.
- A scoring test: issue an AI-attributed command (aircraft controller not in
  `playerStations`) and assert `gameState.score`/`scoreDimensions` are
  unchanged, versus the same command from a player-controlled aircraft
  changing them.
