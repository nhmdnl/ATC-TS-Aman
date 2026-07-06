# TTS Quality & Resource Usage Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the existing native `SpeechSynthesis` TTS pick a deliberate voice (cached, not re-resolved every line), surface an honest "captions only" indicator instead of silently doing nothing when no voice exists, and cap the speech backlog so a busy session can't build an ever-growing queue of stale audio.

**Architecture:** All changes are inside `AudioEngine` (the module-level class in `src/state/useAudio.ts`) plus one new prop threaded to `StatusBar`. No new files, no engine (`src/engine/`) changes, no new dependencies.

**Tech Stack:** Browser `SpeechSynthesis`/`SpeechSynthesisVoice` Web APIs, React 19.

## Global Constraints

- **Depends on the Pause Menu plan's Task 1** (`docs/superpowers/plans/2026-07-06-pause-menu.md`), which refactors `useAudio` from `useAudio(): { muted }` to `useAudio(muted: boolean, toggleMute: () => void)`. This plan's Task 1 modifies that already-refactored file. If Pause Menu's Task 1 has not landed yet, do it first — this plan's code blocks assume it has.
- No cloud/neural TTS — stay on native `SpeechSynthesis` (see the design spec's Non-goals). Do not add network calls or bundle a voice model.
- This project has no component/UI test setup (Vitest targets `src/engine/` only). Verification is `npm run typecheck` plus manual checks, matching the design spec's own Testing section.
- `AudioEngine` stays a plain class with module-level singleton instantiation (`export const engine = ...` pattern already in the file) — don't introduce a new state-management layer for it.

---

### Task 1: Voice caching + backlog cap in `AudioEngine`

**Files:**
- Modify: `src/state/useAudio.ts`

**Interfaces:**
- Produces: `AudioEngine.hasVoice(): boolean`, `AudioEngine.speak(atcText: string, pilotText: string): void` — both consumed by `useAudio`'s effect later in this same task.
- Assumes (from the Pause Menu plan): `useAudio(muted: boolean, toggleMute: () => void)` already exists in this file, with an `engine.muted` sync effect and the `toggle-mute` event wiring already in place. This task only touches the `AudioEngine` class body and the `COMMAND_ISSUED` handler inside `useAudio`'s second effect.

- [ ] **Step 1: Add voice caching and the backlog-capped `speak()` method to `AudioEngine`**

In `src/state/useAudio.ts`, inside the `AudioEngine` class, add these fields right after `public muted = false`:

```ts
  private cachedVoice: SpeechSynthesisVoice | null = null
  private voicesListenerAttached = false
  private pendingUtterances = 0
  private static readonly MAX_PENDING = 3   // ATC+pilot pairs, roughly 1.5 exchanges deep
```

Change `init()` from:

```ts
  init() {
    if (!this.ctx) {
      this.ctx = new (window.AudioContext || (window as any).webkitAudioContext)()
    }
    if (this.ctx.state === 'suspended') {
      this.ctx.resume()
    }
  }
```

to:

```ts
  init() {
    if (!this.ctx) {
      this.ctx = new (window.AudioContext || (window as any).webkitAudioContext)()
    }
    if (this.ctx.state === 'suspended') {
      this.ctx.resume()
    }
    if ('speechSynthesis' in window) {
      this.resolveVoice()
      // getVoices() can return empty synchronously before the browser has
      // finished loading its voice list — re-resolve when that happens.
      // Guarded so repeated init() calls (StrictMode, re-mounts) don't stack
      // up duplicate listeners.
      if (!this.voicesListenerAttached) {
        this.voicesListenerAttached = true
        window.speechSynthesis.addEventListener('voiceschanged', () => this.resolveVoice())
      }
    }
  }

  private resolveVoice(): void {
    const voices = window.speechSynthesis.getVoices()
    // Prefer a local (non-network) English voice for latency + offline
    // reliability; fall back to any English voice, then to whatever's first.
    this.cachedVoice = voices.length === 0 ? null : (
      voices.find(v => v.localService && v.lang.startsWith('en')) ??
      voices.find(v => v.lang.startsWith('en')) ??
      voices[0]
    )
  }

  hasVoice(): boolean {
    return this.cachedVoice !== null
  }
```

Then add a new `speak()` method right after `playAlert()` (before `playSuccess()`):

```ts
  /**
   * Speak an ATC line followed by a pilot readback, using the cached voice.
   * Silently does nothing if muted, TTS is unsupported, no voice was ever
   * resolved, or the pending-pair backlog is already at capacity — in every
   * case the radio log (text) already has both lines regardless, so nothing
   * informational is lost, only the audio for the overflow.
   */
  speak(atcText: string, pilotText: string): void {
    if (this.muted || !('speechSynthesis' in window) || !this.cachedVoice) return
    if (this.pendingUtterances >= AudioEngine.MAX_PENDING) return

    this.pendingUtterances++
    const release = () => { this.pendingUtterances = Math.max(0, this.pendingUtterances - 1) }

    try {
      const u1 = new SpeechSynthesisUtterance(atcText)
      u1.voice = this.cachedVoice
      u1.rate = 1.1
      u1.pitch = 1.0

      const u2 = new SpeechSynthesisUtterance(pilotText)
      u2.voice = this.cachedVoice
      u2.rate = 1.15
      u2.pitch = 0.9 // slightly different voice
      u2.onend = release
      u2.onerror = release

      window.speechSynthesis.speak(u1)
      window.speechSynthesis.speak(u2) // queues after u1
    } catch {
      release() // TTS unavailable — beeps and the log still work
    }
  }
```

- [ ] **Step 2: Replace the inline utterance code in the `COMMAND_ISSUED` handler with a call to `engine.speak()`**

Inside `useAudio`'s second `useEffect`, find:

```ts
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
```

and replace it with:

```ts
      // Best-effort speech on top — engine.speak() handles the mute check,
      // voice availability, and backlog cap internally.
      engine.speak(p.atc, p.pilot)
```

- [ ] **Step 3: Typecheck**

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 4: Manual verification**

Run `npm run dev`, click START, issue a few commands. Confirm speech still plays (if your machine has voices) and the radio log still populates regardless. Then issue a rapid burst of commands (select several aircraft in a row and issue commands as fast as the UI allows) — confirm speech doesn't audibly fall further and further behind in an ever-growing queue; some pairs should be silently skipped once 3 are already pending, while every pair still appears in the text log immediately.

- [ ] **Step 5: Commit**

```bash
git add src/state/useAudio.ts
git commit -m "feat: cache TTS voice selection and cap the speech backlog"
```

---

### Task 2: Surface "TTS unavailable" state to the player

**Files:**
- Modify: `src/state/useAudio.ts`
- Modify: `src/App.tsx`
- Modify: `src/components/StatusBar.tsx`

**Interfaces:**
- Produces: `useAudio(muted, toggleMute)` now returns `{ ttsAvailable: boolean }` (previously returned nothing/`void`).
- Produces: `StatusBar` now takes a required prop `{ ttsAvailable: boolean }` (previously took no props).

- [ ] **Step 1: Track and return `ttsAvailable` from `useAudio`**

In `src/state/useAudio.ts`, add `useState` to the React import:

```ts
import { useEffect, useState } from 'react'
```

Inside `useAudio`, right after the function signature, add:

```ts
export function useAudio(muted: boolean, toggleMute: () => void) {
  const [ttsAvailable, setTtsAvailable] = useState(false)

  useEffect(() => {
    engine.muted = muted
    if (muted) window.speechSynthesis.cancel()
  }, [muted])
```

(The `engine.muted`/cancel effect already exists from the Pause Menu plan — only the new `useState` line above it and the `useEffect` block below are additions.)

Then, inside the second `useEffect` (the one with `handleInteraction`/`unsubCommand`/etc.), change:

```ts
    const handleInteraction = () => engine.init()
```

to:

```ts
    const handleInteraction = () => {
      engine.init()
      setTtsAvailable(engine.hasVoice())
    }
```

and, in that same effect, add a `voiceschanged` listener so a voice that resolves *after* the initial check (some browsers load voices asynchronously) also updates the UI. Add this right after the `handleKey`/`window.addEventListener('keydown', handleKey)` lines and before the `return () => { ... }` cleanup:

```ts
    const onVoicesChanged = () => setTtsAvailable(engine.hasVoice())
    if ('speechSynthesis' in window) {
      window.speechSynthesis.addEventListener('voiceschanged', onVoicesChanged)
    }
```

and add the matching removal inside the existing cleanup function:

```ts
    return () => {
      unsubCommand()
      unsubViolation()
      unsubScore()
      window.removeEventListener('click', handleInteraction)
      window.removeEventListener('keydown', handleInteraction)
      window.removeEventListener('toggle-mute', onToggleMute)
      window.removeEventListener('keydown', handleKey)
      if ('speechSynthesis' in window) {
        window.speechSynthesis.removeEventListener('voiceschanged', onVoicesChanged)
      }
    }
```

Finally, add a return statement at the very end of `useAudio` (after the second `useEffect` call, as the last line of the function):

```ts
  return { ttsAvailable }
}
```

- [ ] **Step 2: Thread `ttsAvailable` from `App.tsx` to `StatusBar`**

In `src/App.tsx`, change:

```ts
  const { state, muted, toggleMute } = useGame()
  useAudio(muted, toggleMute)
```

to:

```ts
  const { state, muted, toggleMute } = useGame()
  const { ttsAvailable } = useAudio(muted, toggleMute)
```

and change:

```tsx
        <div id="status-bar-container" style={{ height: LAYOUT.STATUS_BAR_H, flexShrink: 0, zIndex: 10 }}>
          <StatusBar />
        </div>
```

to:

```tsx
        <div id="status-bar-container" style={{ height: LAYOUT.STATUS_BAR_H, flexShrink: 0, zIndex: 10 }}>
          <StatusBar ttsAvailable={ttsAvailable} />
        </div>
```

- [ ] **Step 3: Show the indicator in `StatusBar`**

In `src/components/StatusBar.tsx`, change the component signature from:

```tsx
export default function StatusBar() {
  const { state, togglePause } = useGame()
```

to:

```tsx
export default function StatusBar({ ttsAvailable }: { ttsAvailable: boolean }) {
  const { state, togglePause } = useGame()
```

Then, in the returned JSX, find the right-hand group:

```tsx
      <div style={{ display: 'flex', gap: 12, fontSize: 11, alignItems: 'center' }}>
        <div style={{ display: 'flex', gap: 4 }}>
          <span style={{ color: '#22c55e' }}>AIR: {airborneCount}</span>
          <span style={{ color: '#64748B' }}>|</span>
          <span style={{ color: '#eab308' }}>GND: {groundCount}</span>
        </div>
        
        <button 
```

and insert the indicator between the traffic-count `div` and the `PAUSE` button:

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

- [ ] **Step 4: Typecheck**

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 5: Manual verification**

Run `npm run dev`. If the machine has zero `speechSynthesis` voices (confirm via DevTools console: `speechSynthesis.getVoices().length`), the `TTS: CAPTIONS ONLY` label should appear in the status bar shortly after the first click/keypress (when `handleInteraction` fires). If the machine has voices, the label should **not** appear, and speech should play normally.

To force-test the empty-voices path on a machine that does have voices, temporarily add `debugger` inside `resolveVoice()` in DevTools and step through, or temporarily hardcode `this.cachedVoice = null` in `resolveVoice()` — revert before committing.

- [ ] **Step 6: Commit**

```bash
git add src/state/useAudio.ts src/App.tsx src/components/StatusBar.tsx
git commit -m "feat: surface TTS-unavailable state as a captions-only indicator"
```

---

## Self-Review Notes

- **Spec coverage:** voice caching (Task 1, Step 1), backlog cap (Task 1, Step 1's `speak()` method), captions-only indicator (Task 2). The spec's "everything else stays as-is" section (Web Audio beeps, existing try/catch, mute interaction) required no tasks — confirmed nothing in Task 1/2 touches `playBeep`/`playRoger`/`playAlert`/`playSuccess`.
- **Placeholder scan:** none found.
- **Type consistency:** `useAudio`'s return type `{ ttsAvailable: boolean }` (Task 2, Step 1) matches its destructuring at the `App.tsx` call site (Task 2, Step 2) and the prop type StatusBar declares (Task 2, Step 3).
