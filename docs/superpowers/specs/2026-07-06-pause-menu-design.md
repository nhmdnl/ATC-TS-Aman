# Pause Menu — Design

## Context

`PAUSE` today is a single `StatusBar` button that flips `gameState.paused`.
There is no menu, no way to restart a session without closing the app, no
mute control outside the `M` key, and no way to return to the main menu
(briefing screen) mid-session. The player asked for a proper pause menu
with "pause/save/go to main menu and other things as such."

## Scope decision: what "save" means here

There is no save/load system anywhere in this codebase today. A full
mid-session save (resume a session later exactly where you left off) would
need to serialize the entire `GameState` — the aircraft map (including
trails, taxi routes, in-flight `readbackTimer`/`setTimeout` command
executions), elapsed time, score history, radio log, mission state — and
restore it faithfully, including re-arming any pending delayed command
executions. That's a substantial subsystem on its own, not a pause-menu
button.

Given sessions are short by design (15/25/35 min per the difficulty
presets), and the one thing that's meant to persist *between* sessions
(XP, level, best grade, high score) already does via `career-system.ts`'s
existing `localStorage` persistence — this spec scopes "save" down to: **the
things that should survive are already surviving.** Mid-session
save-and-resume-later is called out explicitly below as a future extension,
not built now.

## Goals

- A menu that appears whenever the game is paused mid-session (not
  pre-game): Resume, Restart Session, Main Menu, Quit to Desktop, and a
  Mute toggle.
- Reuses the existing `paused` flag and `PAUSE` button — no new keybinding
  required beyond what already exists (`Space` already toggles pause via
  `useKeyboardShortcuts`).
- No engine changes; this is a new UI overlay plus one small IPC addition
  for "Quit to Desktop."

## Non-goals

- Mid-session save/resume (see above) — flagged as a future extension.
- Settings beyond mute (no volume slider, no key-rebinding UI) — the
  existing keyboard shortcuts and difficulty selection are out of scope
  for this menu.

## Design

### `src/components/PauseMenu.tsx` (new)

Rendered in `App.tsx` alongside the other overlays
(`EndScreen`/`TutorialOverlay`/etc.), visible when
`state.paused && state.sessionStarted && !state.sessionEnded`. The
`sessionStarted` check keeps it from appearing over the briefing screen (
pausing pre-game isn't a real state today, but the guard costs nothing and
prevents a future regression). The `sessionEnded` check keeps it from
stacking on top of `EndScreen`.

Same visual treatment as `EndScreen`/`BriefingScreen`: full-screen backdrop,
centered panel.

Buttons:
- **RESUME** — `togglePause()` (existing context method).
- **RESTART SESSION** — `resetGame()` then immediately `setDifficulty(state.difficulty)`
  + `startSession()`, so the player gets a fresh session at the same
  difficulty without detouring through the briefing screen. Fast-retry loop.
- **MAIN MENU** — `resetGame()` only, returning to `BriefingScreen` (matches
  existing "PLAY AGAIN" behavior on `EndScreen`).
- **MUTE** toggle — dispatches a new `toggle-mute` `CustomEvent` (see below),
  reflecting current mute state as a checked/unchecked button, same pattern
  as the existing `radar-toggle-ruler` event.
- **QUIT TO DESKTOP** — calls `window.electronAPI.send('app-quit', null)`.
  Only rendered when `window.electronAPI` exists (i.e. running under
  Electron, not a bare browser preview via `npm run preview`).

### Mute wiring

`useAudio.ts` currently only toggles mute via a hardcoded `M` keydown
listener, with mute state private to that hook (`engine.muted` +local
`useState`). To let `PauseMenu` trigger the same toggle: add a
`window.addEventListener('toggle-mute', ...)` listener inside `useAudio`'s
existing effect, calling the same code path the `M` key already uses. No
new state model — just a second trigger for an existing action, matching
how radar keyboard shortcuts and the ruler toggle already work
(`CustomEvent` dispatched by UI, engine-side hook listens).

For `PauseMenu` to *display* the current mute state (so the button can show
pressed/unpressed), `useAudio`'s returned `{ muted }` needs to be lifted to
where `PauseMenu` can read it — simplest: `useAudio()` is already called
once in `App.tsx`'s `GameUI`; thread its `muted` value down as a prop, or
promote it into `GameContext` alongside `paused`. Given `GameContext` is
where the rest of the cross-cutting session state already lives, adding
`muted: boolean` there (updated by the same `toggle-mute` event handler,
now also updating `gameState`-adjacent React state) is the more consistent
choice — the pause menu button then reads `state` like everything else.

### Electron IPC: Quit to Desktop

`preload.ts` already exposes a generic `send(channel, data)` bridge. Add:

```ts
// electron/main.ts
ipcMain.on('app-quit', () => app.quit())
```

One new import (`ipcMain`) and one handler. No changes to the existing
`onMenuAction` bridge (currently unused after the native menu bar was
removed — left in place in case a future feature wants main→renderer
messages, per the existing `ponytail:` comment on that file).

## Error handling

- `RESTART SESSION` re-reads `state.difficulty` (a `DifficultyLevel` string,
  already present in the snapshot) rather than assuming a specific value —
  works regardless of which difficulty was active.
- `QUIT TO DESKTOP` button is simply omitted (not disabled) outside Electron,
  so there's no dead click target in a browser-preview context.

## Testing

UI-only change, no engine code touched beyond the trivial mute-event
listener addition. Verification is manual/CDP: pause mid-session, confirm
the menu appears with all four actions working, confirm mute toggles from
both the menu and the `M` key stay in sync, confirm the menu does not
appear pre-game or after `EndScreen` is showing.
