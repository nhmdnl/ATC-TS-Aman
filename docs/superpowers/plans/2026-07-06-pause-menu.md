# Pause Menu Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a pause menu (Resume / Restart Session / Mute / Main Menu / Quit to Desktop) that appears whenever the sim is paused mid-session, plus lift mute state so both the `M` key and the new menu button control the same thing.

**Architecture:** One new React overlay component (`PauseMenu.tsx`), mounted alongside the existing `EndScreen`/`TutorialOverlay` overlays in `App.tsx`, driven entirely by state already in `GameContext` plus two new context fields (`muted`, `toggleMute`). One new Electron IPC handler for "Quit to Desktop". No engine (`src/engine/`) changes.

**Tech Stack:** React 19, TypeScript, Electron 35 (`ipcMain`/`ipcRenderer` via the existing `preload.ts` bridge).

## Global Constraints

- No save/load system is being built here — "Restart Session" and "Main Menu" both use the existing `resetGame()`/`startSession()` methods already in `GameContext`. Do not add any serialization.
- This project has no component/UI test setup (per `CLAUDE.md`: Vitest targets `src/engine/` only, `environment: 'node'`, no DOM). Verification for every task in this plan is `npm run typecheck` plus a manual check — do not invent React component tests that don't fit the project.
- Match existing inline-style conventions (see `BriefingScreen.tsx`, `EndScreen.tsx`) — plain `style={{ ... }}` objects, no CSS modules, no new dependencies.
- `window.electronAPI` (from `src/types/electron.d.ts`) is only present when running under Electron, not under `npm run preview` — any code that calls it must guard for its absence.

---

### Task 1: Lift mute state into `GameContext`, refactor `useAudio` to receive it

**Files:**
- Modify: `src/state/GameContext.tsx`
- Modify: `src/state/useAudio.ts`
- Modify: `src/App.tsx:26-29` (the `GameUI` function body)

**Interfaces:**
- Produces: `GameContextType.muted: boolean`, `GameContextType.toggleMute: () => void` — consumed by `PauseMenu` (Task 2) and by `useAudio`.
- Produces: `useAudio(muted: boolean, toggleMute: () => void): void` — new signature (previously `useAudio(): { muted: boolean }`, called with no arguments).

Today, `useAudio.ts` owns mute state privately (its own `useState(false)`, checked via `if (!muted && ...)` before speaking, and toggled by a hardcoded `M` keydown listener that calls `engine.muted = ...` and the hook's local `setMuted`). The pause menu needs a `MUTE` button that controls the exact same flag, so mute state moves up to `GameContext` (alongside `paused`) and `useAudio` becomes a consumer instead of an owner.

- [ ] **Step 1: Add `muted`/`toggleMute` to `GameContext`**

In `src/state/GameContext.tsx`, add `useState` to the existing React import (it's already imported — `import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react'`, no import change needed), then inside `GameProvider`, alongside the existing `snapshot` state:

```ts
  const [muted, setMuted] = useState(false)
  const toggleMute = () => setMuted(m => !m)
```

Add both to `GameContextType`:

```ts
export interface GameContextType {
  state: GameStateSnapshot
  selectAircraft: (id: string | null) => void
  issueCommand: (command: Command) => void
  togglePause: () => void
  resetGame: () => void
  setDifficulty: (level: DifficultyLevel) => void
  startSession: () => void
  muted: boolean
  toggleMute: () => void
}
```

And to the `value` object at the end of `GameProvider`:

```ts
  const value: GameContextType = {
    state: snapshot,
    selectAircraft,
    issueCommand,
    togglePause,
    resetGame,
    setDifficulty,
    startSession,
    muted,
    toggleMute
  }
```

- [ ] **Step 2: Refactor `useAudio` to take `muted`/`toggleMute` as parameters**

Replace the full contents of `src/state/useAudio.ts` with:

```ts
import { useEffect } from 'react'
import { eventBus } from '../engine/event-bus'
import { GameEventType, RadioSpeaker } from '../engine/types'
import type { GameEvent } from '../engine/types'
import { gameState } from '../engine/game-state'

class AudioEngine {
  private ctx: AudioContext | null = null
  public muted = false

  init() {
    if (!this.ctx) {
      this.ctx = new (window.AudioContext || (window as any).webkitAudioContext)()
    }
    if (this.ctx.state === 'suspended') {
      this.ctx.resume()
    }
  }

  playBeep(freq1: number, freq2: number | null, durationMs: number, type: OscillatorType = 'sine') {
    if (this.muted || !this.ctx) return
    const osc = this.ctx.createOscillator()
    const gain = this.ctx.createGain()

    osc.type = type
    osc.frequency.setValueAtTime(freq1, this.ctx.currentTime)
    if (freq2) {
      osc.frequency.linearRampToValueAtTime(freq2, this.ctx.currentTime + durationMs / 1000)
    }

    gain.gain.setValueAtTime(0.1, this.ctx.currentTime)
    gain.gain.exponentialRampToValueAtTime(0.01, this.ctx.currentTime + durationMs / 1000)

    osc.connect(gain)
    gain.connect(this.ctx.destination)

    osc.start()
    osc.stop(this.ctx.currentTime + durationMs / 1000)
  }

  playRoger() {
    this.playBeep(1000, null, 90, 'sine')
  }

  playAlert() {
    this.playBeep(800, 600, 150, 'square')
  }

  playSuccess() {
    if (this.muted || !this.ctx) return
    const t = this.ctx.currentTime

    const osc1 = this.ctx.createOscillator()
    const gain1 = this.ctx.createGain()
    osc1.frequency.value = 523.25 // C5
    gain1.gain.setValueAtTime(0.1, t)
    gain1.gain.exponentialRampToValueAtTime(0.01, t + 0.1)
    osc1.connect(gain1)
    gain1.connect(this.ctx.destination)
    osc1.start(t)
    osc1.stop(t + 0.1)

    const osc2 = this.ctx.createOscillator()
    const gain2 = this.ctx.createGain()
    osc2.frequency.value = 659.25 // E5
    gain2.gain.setValueAtTime(0.1, t + 0.1)
    gain2.gain.exponentialRampToValueAtTime(0.01, t + 0.3)
    osc2.connect(gain2)
    gain2.connect(this.ctx.destination)
    osc2.start(t + 0.1)
    osc2.stop(t + 0.3)
  }
}

const engine = new AudioEngine()

export function useAudio(muted: boolean, toggleMute: () => void) {
  // Keep the engine's internal flag (checked by playBeep/playSuccess) in sync
  // with the GameContext-owned mute state, and cut off any in-flight speech
  // the instant the player mutes.
  useEffect(() => {
    engine.muted = muted
    if (muted) window.speechSynthesis.cancel()
  }, [muted])

  useEffect(() => {
    // Need user interaction to start AudioContext usually, but we initialize here
    const handleInteraction = () => engine.init()
    window.addEventListener('click', handleInteraction, { once: true })
    window.addEventListener('keydown', handleInteraction, { once: true })

    const unsubCommand = eventBus.on(GameEventType.COMMAND_ISSUED, (e: GameEvent) => {
      engine.playRoger()

      const p = e.payload.phraseology as { atc: string, pilot: string, station: string }
      if (!p) return

      // The radio log is the record of what was said — always append it,
      // independent of mute state and of whether TTS is available (Linux
      // Electron often has zero speechSynthesis voices, so nothing that
      // matters may hang off utterance callbacks).
      gameState.addRadioMessage({ timestamp: Date.now(), speaker: 'ATC', message: p.atc, station: p.station })
      setTimeout(() => {
        gameState.addRadioMessage({ timestamp: Date.now(), speaker: 'PILOT', message: p.pilot, station: e.payload.callsign as string })
      }, 1500)

      // Best-effort speech on top
      if (!muted && 'speechSynthesis' in window) {
        try {
          const u1 = new SpeechSynthesisUtterance(p.atc)
          u1.rate = 1.1
          u1.pitch = 1.0
          const u2 = new SpeechSynthesisUtterance(p.pilot)
          u2.rate = 1.15
          u2.pitch = 0.9 // slightly different voice
          window.speechSynthesis.speak(u1)
          window.speechSynthesis.speak(u2) // queues after u1
        } catch { /* TTS unavailable — beeps and the log still work */ }
      }
    })

    const unsubViolation = eventBus.on(GameEventType.SEPARATION_VIOLATION, () => {
      engine.playAlert()
    })

    const unsubScore = eventBus.on(GameEventType.SCORE_CHANGED, (e: GameEvent) => {
      if (['takeoff', 'landing', 'departure_handoff', 'arrived_gate'].includes(e.payload.reason as string)) {
        engine.playSuccess()
      }
    })

    // Single source of truth for "the mute button/key was pressed" — the M
    // key and the pause-menu MUTE button both just dispatch this event, so
    // there is exactly one place that decides what toggling mute means.
    const onToggleMute = () => toggleMute()
    window.addEventListener('toggle-mute', onToggleMute)

    const handleKey = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() === 'm') {
        window.dispatchEvent(new CustomEvent('toggle-mute'))
      }
    }
    window.addEventListener('keydown', handleKey)

    return () => {
      unsubCommand()
      unsubViolation()
      unsubScore()
      window.removeEventListener('click', handleInteraction)
      window.removeEventListener('keydown', handleInteraction)
      window.removeEventListener('toggle-mute', onToggleMute)
      window.removeEventListener('keydown', handleKey)
    }
  }, [muted, toggleMute])
}
```

- [ ] **Step 3: Update the call site in `App.tsx`**

In `src/App.tsx`, change:

```ts
function GameUI() {
  useGameLoop()
  useAudio()
  useKeyboardShortcuts()
  const { state } = useGame()
```

to:

```ts
function GameUI() {
  useGameLoop()
  const { state, muted, toggleMute } = useGame()
  useAudio(muted, toggleMute)
  useKeyboardShortcuts()
```

(Reordered so `useGame()` runs before `useAudio(muted, toggleMute)` needs its return values.)

- [ ] **Step 4: Typecheck**

Run: `npm run typecheck`
Expected: no errors. This confirms `GameContextType`'s new fields, `useAudio`'s new signature, and the `App.tsx` call site all agree.

- [ ] **Step 5: Manual verification**

Run `npm run dev`, wait for the Electron window, click START. Press `M` — confirm the existing mute behavior still works exactly as before (radio log still populates either way; if your machine has TTS voices, speech stops when muted). This proves the refactor didn't change behavior, only where the state lives.

- [ ] **Step 6: Commit**

```bash
git add src/state/GameContext.tsx src/state/useAudio.ts src/App.tsx
git commit -m "refactor: lift mute state into GameContext so it can be controlled from more than the M key"
```

---

### Task 2: `PauseMenu` component

**Files:**
- Create: `src/components/PauseMenu.tsx`
- Modify: `src/App.tsx` (import + mount)

**Interfaces:**
- Consumes: `useGame()` → `state.paused`, `state.sessionStarted`, `state.sessionEnded`, `state.difficulty` (all already on `GameStateSnapshot`); `togglePause`, `resetGame`, `setDifficulty`, `startSession`, `muted`, `toggleMute` (all on `GameContextType` — `muted`/`toggleMute` added in Task 1).
- Consumes: `window.electronAPI.send(channel: string, data: unknown): void` (already exists in `src/types/electron.d.ts`, exposed by `electron/preload.ts` — no changes needed to either file for this task).

- [ ] **Step 1: Write `PauseMenu.tsx`**

```tsx
import React from 'react'
import { useGame } from '../state/GameContext'
import type { DifficultyLevel } from '../engine/types'

function buttonStyle(variant: 'primary' | 'default'): React.CSSProperties {
  return {
    padding: '10px 24px',
    background: variant === 'primary' ? '#22C55E' : '#1D2430',
    color: '#FFF',
    border: variant === 'primary' ? 'none' : '1px solid #334155',
    borderRadius: 4,
    cursor: 'pointer',
    fontWeight: 700,
    fontSize: 13,
    fontFamily: 'inherit',
  }
}

export default function PauseMenu() {
  const { state, togglePause, resetGame, setDifficulty, startSession, muted, toggleMute } = useGame()

  if (!(state.paused && state.sessionStarted && !state.sessionEnded)) return null

  const handleRestart = () => {
    const level = state.difficulty as DifficultyLevel
    resetGame()
    setDifficulty(level)
    startSession()
  }

  return (
    <div style={{
      position: 'absolute',
      inset: 0,
      zIndex: 1000,
      background: 'rgba(15, 23, 42, 0.92)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
    }}>
      <div style={{
        background: '#161B22',
        border: '1px solid #1D2430',
        borderRadius: 8,
        padding: 32,
        minWidth: 260,
      }}>
        <h1 style={{ margin: '0 0 20px', color: '#0EA5E9', fontSize: 20, fontWeight: 700, textAlign: 'center' }}>
          PAUSED
        </h1>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <button style={buttonStyle('primary')} onClick={togglePause}>RESUME</button>
          <button style={buttonStyle('default')} onClick={handleRestart}>RESTART SESSION</button>
          <button style={buttonStyle('default')} onClick={toggleMute}>{muted ? 'UNMUTE' : 'MUTE'}</button>
          <button style={buttonStyle('default')} onClick={resetGame}>MAIN MENU</button>
          {window.electronAPI && (
            <button
              style={buttonStyle('default')}
              onClick={() => window.electronAPI.send('app-quit', null)}
            >
              QUIT TO DESKTOP
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Mount it in `App.tsx`**

Add the import next to the other overlay imports:

```ts
import PauseMenu from './components/PauseMenu'
```

And render it next to `EndScreen`/`TutorialOverlay`:

```tsx
        <EndScreen />
        <TutorialOverlay />
        <PauseMenu />
```

- [ ] **Step 3: Typecheck**

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 4: Manual verification**

Run `npm run dev`, click START, press `Space` (or the `PAUSE` button) to pause. Confirm:
- The pause menu appears, centered, with all 5 buttons (4 in a browser preview without `window.electronAPI`).
- RESUME closes the menu and the sim continues.
- MUTE toggles and its label flips between MUTE/UNMUTE; pressing `M` on the keyboard while the menu is open also flips it (proves Task 1's shared event actually shares).
- RESTART SESSION immediately drops you into a fresh session at the same difficulty (check the difficulty readout/traffic pattern matches what you had).
- MAIN MENU returns to the briefing screen.
- Confirm the menu does **not** appear before clicking START, and does **not** appear on top of the end-of-session `EndScreen` (let a session run to expiry, or manually trigger it, and confirm only `EndScreen` shows, not both).

- [ ] **Step 5: Commit**

```bash
git add src/components/PauseMenu.tsx src/App.tsx
git commit -m "feat: add pause menu with resume/restart/mute/main-menu actions"
```

---

### Task 3: Quit to Desktop (Electron IPC)

**Files:**
- Modify: `electron/main.ts`

**Interfaces:**
- Consumes: nothing new — `preload.ts`'s existing `send: (channel: string, data: unknown) => void` already forwards any channel name via `ipcRenderer.send(channel, data)`, so `PauseMenu`'s `window.electronAPI.send('app-quit', null)` call from Task 2 already reaches the main process; this task only adds the main-process listener for that channel.
- Produces: nothing consumed by later tasks — this is the last task in the plan.

- [ ] **Step 1: Add the `ipcMain` handler**

In `electron/main.ts`, change the import line:

```ts
import { app, BrowserWindow, Menu } from 'electron'
```

to:

```ts
import { app, BrowserWindow, Menu, ipcMain } from 'electron'
```

Then add the handler right after `app.whenReady().then(createWindow)`:

```ts
app.whenReady().then(createWindow)

ipcMain.on('app-quit', () => app.quit())

app.on('window-all-closed', () => {
```

(Only the new `ipcMain.on(...)` line is added between the existing `app.whenReady()...` and `app.on('window-all-closed'...)` lines — nothing else in the file changes.)

- [ ] **Step 2: Typecheck the main process**

Run: `npx tsc -p tsconfig.main.json --noEmit`
Expected: no errors.

- [ ] **Step 3: Rebuild the main process and verify**

The dev script (`npm run dev`) does not recompile `electron/main.ts` automatically — it runs whatever's already in `dist-electron/main.js`. Rebuild it first:

Run: `npx tsc -p tsconfig.main.json`
Expected: exits with no output, `dist-electron/main.js` timestamp updates.

Then run `npm run dev`, click START, pause, click QUIT TO DESKTOP, and confirm the Electron window actually closes and the process exits (check with `pgrep -f electron` afterward — it should return nothing).

- [ ] **Step 4: Commit**

```bash
git add electron/main.ts
git commit -m "feat: wire Quit to Desktop pause-menu button to app.quit() via IPC"
```

---

## Self-Review Notes

- **Spec coverage:** All five pause-menu buttons (Resume, Restart, Main Menu, Mute, Quit) are covered — Resume/Restart/Main Menu/Mute in Task 2, Quit's IPC plumbing in Task 3. The spec's "sessionStarted && !sessionEnded" visibility guard and the "reuse existing paused flag, no new keybinding" goal are both implemented in Task 2 exactly as specified.
- **Placeholder scan:** none found — every step has complete, runnable code.
- **Type consistency:** `GameContextType.muted`/`toggleMute` (Task 1) match the destructured names used in `PauseMenu.tsx` (Task 2) exactly. `useAudio`'s new two-parameter signature matches its Task 1 call site in `App.tsx`.
