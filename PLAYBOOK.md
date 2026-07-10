# PLAYBOOK.md — how to change this codebase safely

Companion to `CLAUDE.md` (architecture) and `QWEN.md` (status/history). This file answers: *how do I add a feature, where do bugs live, what must I verify.* Written for AI agents and new contributors starting with zero context.

Line numbers below were verified 2026-07-10 — they drift; the named symbols don't. Grep the symbol if a line number misses.

## Fresh-session read order

1. `CLAUDE.md` — architecture, tick order, command pipeline, conventions.
2. `QWEN.md` — what's shipped, what's pending, design decisions.
3. This file — before making changes.
4. `PRD_GDD.md` — only when touching game mechanics (scoring values, separation minima, phraseology).

## Development loop

- **Feature:** branch off `main` → follow the matching playbook below → `npm run typecheck` + targeted tests → full `npm test` → manual E2E in `npm run dev` → merge. Update `QWEN.md` status when a feature ships.
- **Bug fix:** find it via the bug-hunting map below. Engine bug → write the failing test *first* (engine is fully testable), fix, keep the test. UI bug → fix + manual E2E; note it in `QWEN.md`'s bug log since nothing automated guards the React layer.
- **Release:** bump `version` in `package.json`, update `CHANGELOG.md`, then `git tag v<version> && git push --tags` — `.github/workflows/release.yml` builds the Windows NSIS installer on a Windows runner and attaches it to a GitHub Release. CI (`ci.yml`) runs typecheck + tests on every push.

## Verifying any change

```bash
npm run typecheck                                  # renderer + electron main
npx vitest run src/engine/__tests__/<file>.test.ts # targeted first
npm test                                           # full suite (~170 tests, 9 files)
npm run dev                                        # E2E: briefing → pick stations → START
```

Tests cover **only** `src/engine/` (node environment, no DOM). There are zero React component tests — any UI change must be eyeballed in `npm run dev`. An engine change that passes all tests can still break the UI if it changes snapshot shape.

## Playbook: add a new command

The pipeline is spread across files that are kept in sync **manually** — nothing enforces it at the type level. Touch all of these, in order:

1. `CommandType` enum — `src/engine/types.ts:40`.
2. `src/engine/constants.ts` — add to `PHASE_COMMANDS` (which phases allow it). `constants.test.ts` locks these tables; update it deliberately, not to silence it.
3. `src/engine/commands/command-validators.ts` — a `case` in `validateCommand` + entry in `getCommandsForPhase` (line ~53).
4. `src/engine/commands/phraseology.ts` — `case` in `generatePhraseology`: ATC transmission + pilot readback strings (PRD phraseology).
5. `src/engine/commands/command-executor.ts` — `case` in `executeCommand` that mutates the aircraft. **Must tolerate a missing aircraft** — execution is deferred by the readback `setTimeout` and re-fetched by callsign.
6. UI: `src/components/CommandPanel.tsx` — `COMMAND_LABELS` (~line 38), plus `PARAM_CONFIG` (~line 31) if it takes a parameter. Text path: `src/engine/commands/command-parser.ts`.
7. `src/engine/ai-controller.ts` — extend `nextExpectedCommand` if AI stations should issue it.
8. Tests: `command-executor.test.ts` (phase wiring), `constants.test.ts` (table invariants), `ai-controller.test.ts` if step 7.

## Playbook: add or modify an aircraft phase

1. `AircraftPhase` enum — `src/engine/types.ts:6` (flow diagrams in the comment above it).
2. `src/engine/movement.ts` — per-phase physics case.
3. `src/engine/phase-transitions.ts` — entry/exit conditions (emits `PHASE_CHANGED`).
4. `src/engine/constants.ts` — `PHASE_CONTROLLER` (who owns the phase), `AIRBORNE_PHASES`, `PHASE_COMMANDS`.
5. `src/engine/separation.ts` — decide if the phase is excluded from separation checks (ground phases are).
6. UI display: `FlightStrips.tsx`, `RadarCanvas.tsx` data tags.
7. `ai-controller.ts` — what the AI does when an aircraft sits in this phase (returning `null` = AI ignores it).
8. Tests: `movement.test.ts`, `constants.test.ts`, `arrival-lifecycle.test.ts` if it's in the arrival flow.

## Playbook: add a new game event

1. `GameEventType` — `src/engine/types.ts:340`.
2. Choose dispatch: `eventBus.emit()` = synchronous, visible before the tick continues (command feedback). `eventBus.queueEvent()` = batched, flushed once at end of tick in `simulation-tick.ts`. Wrong choice = ordering bugs.
3. Subscribers live in: `scoring.ts`, `mission-system.ts`, `useAudio.ts` (TTS), `GameContext.tsx` (radio log).

## Playbook: new per-tick behavior

Insert into `tick()` in `src/engine/simulation-tick.ts` at the correct stage (order documented in CLAUDE.md and enforced by nothing else). Never bolt per-tick logic onto a component or hook — the React layer must stay a passive viewer.

## Playbook: new UI panel or keyboard shortcut

- Layout slots are in `App.tsx`; panel visibility toggles use `useToggleEvent.ts`.
- Shortcuts: `src/state/useKeyboardShortcuts.ts` — auto-suppressed while a text input is focused. Also update the table in CLAUDE.md.
- Radar viewport actions go through `CustomEvent` on `window` (e.g. `radar-zoom-in`), which `RadarCanvas` listens for. **RadarCanvas binds window listeners once on mount** — any changing value they need must be read through a ref (see the `handleWheelRef` pattern in `RadarCanvas.tsx`), or the handler captures a stale first-render closure.

## Bug-hunting map (symptom → where to look)

| Symptom | Look in |
|---|---|
| Aircraft stuck / not moving | `movement.ts` per-phase case; `phase-transitions.ts` guard conditions; taxi with no target (`moveTaxi` goes nowhere without one) |
| Command button missing or greyed | `PHASE_COMMANDS` (`constants.ts`); `getCommandsForPhase` (`command-validators.ts`); `CommandPanel.tsx` tab filtering by `playerStations` |
| Command accepted, nothing happens | Readback delay (`READBACK_DELAY_*`); aircraft removed mid-delay (executor re-fetches by callsign); missing `case` in `command-executor.ts` |
| UI stale / not re-rendering | The `window._updateGameSnapshot` chain: `GameContext.tsx` ↔ `useGameLoop.ts` (deliberate escape hatch — see CLAUDE.md) |
| No TTS audio | `useAudio.ts` (backlog cap 3, mute state); Linux dev machine has zero voices unless speech-dispatcher flag is set in `electron/main.ts`; **production target is Windows SAPI voices** |
| Score wrong / missing | `scoring.ts` — attribution is by `aircraft.controller` at event-fire time, **deliberate** (comment at `scoring.ts:28`); deltas in `SCORE_DELTAS` |
| AI station misbehaving | `ai-controller.ts` `nextExpectedCommand` switch; AI only acts on stations not in `gameState.playerStations` |
| Radar visual glitch | `RadarCanvas.tsx` (1000+ lines): init effect vs redraw effects; StrictMode double-init guard at line ~651 |
| False separation alerts | `separation.ts` ground-phase exclusions and alert cooldown |

## Sharp edges (all verified against source 2026-07-10)

1. **Pending readback timers survive reset.** `processCommand` schedules execution via `setTimeout` (`command-registry.ts:53`) and nothing calls `clearTimeout`; `gameState.reset()` (`game-state.ts:171`) doesn't cancel them. A reset mid-delay + a new aircraft reusing the callsign = stale command executes on the wrong session. Fix path: collect timeout ids, clear on reset.
2. **Two pause paths.** Spacebar mutates `gameState.paused` directly (`useKeyboardShortcuts.ts:40`); `GameContext.togglePause` (`GameContext.tsx:72`) also pushes a snapshot. Neither emits `SIM_PAUSED`/`SIM_RESUMED` (those enum values are currently decorative). Prefer `togglePause` in new code.
3. **Snapshots are shallow per-aircraft.** `snapshot()` copies the Map (`game-state.ts:193`) but shares `Aircraft` object references — components can observe mid-tick field mutations. Protects against add/remove only.
4. **Module-level listener wiring.** `initializeScoringSystem()` runs at the top level of `GameContext.tsx:10` — once per module load (StrictMode does *not* double it), but a Vite HMR reload of that module re-registers listeners → doubled scoring in dev after hot edits. Symptom: scores change twice per event → restart the dev server.
5. **`AircraftList.tsx` is dead code.** Nothing imports it; `FlightStrips.tsx` superseded it. Delete it or wire it in — don't extend it by accident.
6. **All arrivals get the same gate.** Unassigned arrivals receive `airport.gates[0]` at ROLLOUT→TAXI_IN (`phase-transitions.ts:98`). Unflagged simplification; make gate assignment smarter here.
7. **Engine/UI sync tables are manual.** `types.ts`, `constants.ts`, `command-validators.ts`, and `ai-controller.ts` each hold a slice of "which command/phase/controller goes together" with no type-level enforcement — `constants.test.ts` is the only guard.

## Deliberate debt (`ponytail:` comments in source)

| Location | Simplification → upgrade path |
|---|---|
| `aircraft-factory.ts:9` | Flat random callsigns → sequential/realistic when flight schedule system added |
| `movement.ts:56` | Instant heading snap on taxiways → pathfinding when taxiway graph is connected |
| `airport-loader.ts:89` | HHAS traced under scale, `SCALE` fudge constant (~971 units = 3000 m runway) → re-trace at true scale |
| `airport-loader.ts:203` | Diagram taxiways are render-only polylines → build routable graph |
| `command-executor.ts:50` | Always picks first runway → wind-based active-runway logic |
| `command-executor.ts:99` | Hardcoded HHAS missed approach → load from airport data for multi-airport |
| `phase-transitions.ts:76` | Same hardcoded missed approach (second copy) |
| `simulation-tick.ts:47` | MVA check hardcoded 8800 ft floor → per-quadrant MVA from airport data |
| `simulation-tick.ts:120` | Always picks first runway (second copy of the runway simplification) |
| `electron/preload.ts:3` | Two IPC channels → expand for game-state sync / file dialogs |
| `electron/main.ts:32` | Hardcoded dev/prod switch → config when staging env exists |

## Test map

| File | Tests | Breaks when you change |
|---|---|---|
| `game-state.test.ts` | 43 | GameState API, snapshot shape, reset semantics |
| `aircraft-factory.test.ts` | 32 | Spawn defaults, phases, flight types |
| `constants.test.ts` | 28 | Any constant table (`SCORE_DELTAS`, `DIFFICULTY_PRESETS`, `PHASE_COMMANDS`, `PHASE_CONTROLLER`, `AIRBORNE_PHASES`, separation minima) |
| `movement.test.ts` | 25 | Heading/bearing/distance math, per-phase movement |
| `separation.test.ts` | 14 | Violation detection, cooldown, ground exclusions |
| `ai-controller.test.ts` | 12 | AI decision table (integration, real HHAS data) |
| `command-executor.test.ts` | 10 | Executor phase wiring (incl. ESM `require()` crash regression) |
| `arrival-lifecycle.test.ts` | 2 | Full arrival flow end-to-end incl. go-around (integration) |
| `scoring.test.ts` | 2 | Player-station score attribution |
