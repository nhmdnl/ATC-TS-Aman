# Tutorial Content Expansion — Design

## Context

`TutorialOverlay.tsx` currently ships a single hardcoded 8-step spotlight
walkthrough of the UI regions (status bar, flight strips, radar, command
panel, command input, radio log), triggered by the `T` key. The player wants
this expanded to cover ATC fundamentals, incident handling, and per-station
(Ground/Tower/Approach) procedure tutorials, structured as a menu of
separate, replayable topics rather than one long sequence.

## Goals

- A `T`-key-accessible menu of six short, independently replayable tutorials,
  grouped for scannability.
- Topics that describe a visual concept (a separation violation, an urgent
  aircraft) show a staged, illustrative example rather than only describing
  it in text.
- Zero risk to scoring, mission tracking, career stats, or the spawn system.
- Reuse the existing spotlight/step mechanism; this is a data and menu
  addition, not a rewrite of `TutorialOverlay`'s rendering.

## Non-goals

- Tracking which tutorials the player has already completed (no checkmarks,
  no "recommended next" logic). Can be added later without a redesign — it's
  additive to the topic-menu data shape.
- Localization / multi-language content.
- Voice narration of tutorial text (out of scope; see the separate TTS spec
  for the existing command-phraseology TTS, which is unrelated).

## Content scope

Six topics, three groups, shown in the new `TutorialMenu`:

**Getting Started**
- *UI Basics* — the existing 8 steps, moved verbatim into the new data file
  as the first topic. No content changes.

**ATC Knowledge**
- *ATC Fundamentals* (~5-6 steps, no demo needed): separation minima (3 NM /
  1000 ft) and why violations flash red; reading a datablock (altitude/speed/
  cleared-value line format); the phase-of-flight flow (PARKED → TAXI_OUT →
  ... → ARRIVED, ENTERING → ... → ARRIVED); what a handoff (`CONTACT ...`)
  means and why aircraft only accept commands from their current controller.
- *Handling Incidents* (4 steps, each with a staged demo — see below): a
  separation violation between two aircraft; an aircraft on FINAL not
  cleared to land (urgent/amber); a go-around in progress; an MVA
  low-altitude alert.

**Role Tutorials**
- *Ground*, *Tower*, *Approach* (3-5 steps each, each with one staged mock
  aircraft in the relevant phase): the typical command sequence for that
  station (e.g. Ground: taxi clearance → hold short → hand off to Tower),
  spotlighting the matching `CommandPanel` tab.

## Architecture

Three pieces:

### `src/data/tutorialContent.ts` (new)

Pure data, no logic.

```ts
export interface TutorialDemoAircraft {
  readonly id: string
  readonly callsign: string
  readonly x: number          // world NM, relative to ARP
  readonly y: number
  readonly altitude: number
  readonly speed: number
  readonly heading: number
  readonly isGround: boolean
  readonly inViolation?: boolean
  readonly urgent?: boolean
}

export interface TutorialStep {
  readonly title: string
  readonly body: string
  readonly selector: string | null   // null = centered card, same as today
  readonly demo?: readonly TutorialDemoAircraft[]  // present = stage these, hide real traffic
}

export interface TutorialTopic {
  readonly id: string
  readonly title: string
  readonly group: 'getting-started' | 'atc-knowledge' | 'role'
  readonly menuDescription: string   // one line, shown in TutorialMenu
  readonly steps: readonly TutorialStep[]
}

export const TUTORIAL_TOPICS: readonly TutorialTopic[]
```

The 8 existing `STEPS` from `TutorialOverlay.tsx` become the `ui-basics`
topic's `steps`, unchanged.

### `src/components/TutorialMenu.tsx` (new)

Renders the three groups from `TUTORIAL_TOPICS`, one row per topic
(title + `menuDescription`). Clicking a topic sets the active topic id.
Replaces the current direct-launch behavior: `T` now opens this menu instead
of jumping straight into a walkthrough.

### `src/components/TutorialOverlay.tsx` (refactored)

Same spotlight/step-navigation/card-placement logic as today. Changes:
- Takes `activeTopicId: string | null` instead of owning its own open/closed
  boolean; steps come from `TUTORIAL_TOPICS.find(t => t.id === activeTopicId).steps`
  instead of a hardcoded array.
- Closing a topic (Esc/Finish) returns to `TutorialMenu` rather than closing
  everything, so the player can pick another topic without reopening from
  the `T` key.
- On mount (any topic opened) and on unmount (topic or menu closed):
  auto-pause handling (below).
- When the active step has a `demo` array, writes it to a ref `RadarCanvas`
  reads (below); clears it when the step changes or the overlay closes.

**Navigation semantics** (disambiguating "closed" at two nesting levels):
`T` always fully closes whatever is open — menu or an active topic — back to
nothing, and opens the menu when nothing is open (simple toggle, matching
today's single-boolean behavior). `Esc`/"Finish" *inside* a topic steps back
up one level, to the menu, not all the way closed. `Esc` while only the menu
is showing (no topic active) closes it fully, same as `T` would.

State ownership: one `activeTopicId: string | null` in a shared parent
(`App.tsx`, alongside where `MissionTracker`/`GuidePanel` are already
mounted). `null` covers both "menu is showing" and "everything closed" —
`TutorialMenu` and `TutorialOverlay` are mutually exclusive on a second
boolean (`menuOpen`), toggled by `T`.

## Staged demo aircraft

**Why render-only, not real `Aircraft` objects:** a real, flagged aircraft
in `gameState.aircraft` would need exclusion guards threaded through
`scoring.ts`, `mission-system.ts`, career tracking, and the spawn/despawn
logic in `simulation-tick.ts` — four-plus files modified, each a chance to
forget a guard later. A render-only mock aircraft never enters `gameState`,
so none of those systems need to know it exists. The trade-off (the
"violation" is asserted, not detected by the real separation checker) is
fine here — the goal is showing what it looks like, not testing the
detection math.

**Rendering:** `RadarCanvas.redrawDynamic()`'s per-aircraft drawing (blip,
trail, vector, leader-line datablock, violation pulse, hover ring) is
currently inline and tied to the real `Aircraft` type. Extract the drawing
portion into an internal helper parameterized on the minimal fields used
(`x`, `y`, `isGround`, `inViolation`, `urgent`, `isSelected`, `callsign`,
`altitude`, `speed`, `heading`, `clearedAltitude`, `clearedSpeed`) so it
runs identically for real `Aircraft` and `TutorialDemoAircraft`. No visual
duplication — a demo violation looks pixel-identical to a real one because
it's drawn by the same code.

**Activation:** `RadarCanvas` gets one new ref, `tutorialDemoRef: TutorialDemoAircraft[] | null`,
written by `TutorialOverlay` when a step with `demo` is active, cleared
otherwise. Each frame, if `tutorialDemoRef.current` is non-null,
`redrawDynamic()` draws *only* the mock list (real traffic is skipped that
frame — not removed from `gameState`, just not drawn) and `redrawStatic()`
still draws the airport/runways underneath as normal.

**Framing:** entering a demo step also resets zoom/pan (reusing the existing
`radar-reset-view` custom event) so the illustration is always centered and
legible regardless of where the player had the view panned to.

## Auto-pause

Opening the menu or any topic (`TutorialOverlay`/`TutorialMenu` mount, via a
shared effect) checks `state.sessionStarted && !state.paused`; if true, it
calls `togglePause()` and remembers `wePaused = true`. On close, if
`wePaused`, it calls `togglePause()` again to resume. If the player had
already manually paused before opening a tutorial, `wePaused` stays `false`
and closing the tutorial leaves the game paused (doesn't surprise-resume).
If no session is running yet (pre-game, from the briefing screen), no pause
call happens at all — the sim isn't ticking regardless
(`sessionStarted` gate in `simulation-tick.ts`).

## Access points

- `T` key: toggles `TutorialMenu` open/closed (existing keybinding, new
  target — was direct-launch, now opens the menu). Works both pre-game and
  mid-session.
- A `TUTORIALS` button added to `BriefingScreen`, for players who haven't
  started a session yet and might not know the `T` shortcut exists.

## Error handling

- If a step's `selector` doesn't match any element (e.g. a role-tutorial
  step targets a `CommandPanel` tab that's conditionally hidden), the
  existing fallback already in `TutorialOverlay` applies: no spotlight rect,
  centered card. No new failure mode introduced.
- Demo ref is cleared in the `TutorialOverlay` unmount effect's cleanup
  function unconditionally, so a mid-tutorial crash or fast-close can't
  leave stale mock aircraft rendering after the overlay is gone.

## Testing

Per this project's convention (Vitest tests target `src/engine/`; there is
no component test setup), this feature adds no new engine code and needs no
new automated tests. `tutorialContent.ts` is pure data — a lightweight
sanity check (every topic has ≥1 step, every `demo` entry has finite
`x`/`y`) is cheap to add if desired but not required. Verification is
manual/CDP-driven, same as the rest of the UI work this session: open each
topic, step through it, confirm spotlight targeting and (for
Handling-Incidents / Role topics) that staged aircraft render and clear
correctly.
