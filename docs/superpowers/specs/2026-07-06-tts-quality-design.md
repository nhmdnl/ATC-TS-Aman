# TTS Quality & Resource Usage — Design

## Context

`useAudio.ts` uses the browser-native `SpeechSynthesis` API to speak ATC and
pilot lines on every `COMMAND_ISSUED` event: one `SpeechSynthesisUtterance`
for the ATC line, a second (queued ~1.5s later) for the pilot readback.

**Finding from earlier this session:** on this Linux/Electron environment,
`speechSynthesis.getVoices().length` returned `0`. With no voices installed,
`speechSynthesis.speak()` either silently does nothing or emits a system
default with no real ATC-radio character — which is very plausibly *why*
"quality" reads as a problem: there may be no meaningful voice choice
happening at all right now, and the player never gets any signal that
anything is wrong. This needs confirming on the player's actual machine, but
it's the most likely root cause and shapes the design below.

## Goals

- Keep resource usage minimal — no bundled neural/cloud TTS model. The
  native `SpeechSynthesis` API is already about as cheap as speech synthesis
  gets (OS-level, no download, no network, no GPU); the fix is using it
  better, not replacing it with something heavier.
- Pick the best available voice deliberately instead of accepting whatever
  the browser defaults to, and cache that choice instead of re-resolving it
  on every utterance.
- Never let TTS silently do nothing — if no usable voice exists, the player
  sees that captions-only mode is active instead of wondering why it's quiet.
- Bound resource usage under heavy traffic: today, every command queues two
  utterances with a fixed 1.5s gap regardless of how many commands are
  already queued. In a busy session this can build an ever-growing speech
  backlog that lags further and further behind real time while still
  consuming CPU to process.

## Non-goals

- Replacing `SpeechSynthesis` with a cloud TTS API (Azure/ElevenLabs/etc.) —
  directly conflicts with "minimal resource usage" and would require
  network access and API keys in what's currently a fully offline app.
- Bundling a local neural TTS model (e.g. Piper) — meaningfully better voice
  quality, but a real resource/size trade-off (tens of MB of model weights,
  measurably more CPU per utterance) that isn't justified until native
  `SpeechSynthesis`, used well, is confirmed insufficient.

## Design

### 1. Voice selection, resolved once and cached

On `AudioEngine.init()` (currently just constructs the `AudioContext`), also
resolve and cache a preferred voice:

```ts
private cachedVoice: SpeechSynthesisVoice | null = null

private resolveVoice(): SpeechSynthesisVoice | null {
  const voices = window.speechSynthesis.getVoices()
  if (voices.length === 0) return null
  // Prefer a local (non-network) English voice for latency + offline reliability;
  // fall back to any English voice, then to whatever's first.
  return (
    voices.find(v => v.localService && v.lang.startsWith('en')) ??
    voices.find(v => v.lang.startsWith('en')) ??
    voices[0]
  )
}
```

`getVoices()` can return empty synchronously before the browser's
`voiceschanged` event fires — so resolution also re-runs once on that event
(voices load asynchronously in some browsers/Electron builds), not just at
init.

### 2. Explicit "TTS unavailable" state, surfaced to the player

If `resolveVoice()` finds nothing (the zero-voices case), `useAudio` exposes
`ttsAvailable: false` instead of silently proceeding. `StatusBar` (or the
existing mute indicator area) shows a small `TTS: CAPTIONS ONLY` label in
that case instead of a normal mute icon — replacing silent failure with an
honest, visible state. Radio log text (which never depended on TTS) is
unaffected either way.

### 3. Backlog cap — bound worst-case resource usage

Today: every `COMMAND_ISSUED` unconditionally schedules two utterances. Add
a small pending-utterance counter in `AudioEngine`:

```ts
private pendingUtterances = 0
private static readonly MAX_PENDING = 3   // ATC + pilot pairs, roughly 1.5 exchanges deep
```

When a new pair would push `pendingUtterances` past `MAX_PENDING`, skip
speaking that pair entirely (increment/decrement around each
`speak()`/`onend`) — the radio log still gets both text lines immediately,
same as today, so nothing is lost from the player's information; only the
audio is dropped for the overflow. This puts a hard ceiling on how far
behind real-time the speech queue can ever get, and on the CPU spent
processing a backlog that's no longer useful anyway (a 20-second-old "cleared
to land" readback voiced after the aircraft has already landed is noise, not
information).

### 4. Everything else stays as-is

- Web Audio beeps (`playRoger`/`playAlert`/`playSuccess`) are already cheap
  (a couple of oscillator nodes for tens of milliseconds) — no change.
  needed.
- The existing `try/catch` around speech synthesis calls (added earlier this
  session) stays — `resolveVoice()` and the backlog cap sit inside that same
  guarded path.
- Mute (`M` key / pause-menu toggle from the separate Pause Menu spec) is
  unaffected — muting already short-circuits before any of this runs.

## Error handling

- `resolveVoice()` returning `null` is not an error path — it's the normal
  "no voices installed" case, handled by (2) above, not by a console
  warning nobody sees.
- If `speechSynthesis` itself is entirely absent (older/embedded WebViews),
  the existing `'speechSynthesis' in window` guard already short-circuits
  before any of this new code runs.

## Testing

Audio/browser-API code has no meaningful unit-test surface in this
project's Vitest setup (`environment: 'node'`, no DOM/Web Audio). Verified
manually: confirm voice resolution picks a sensible voice when one exists,
confirm the `TTS: CAPTIONS ONLY` indicator appears correctly when
`getVoices()` is empty (can be forced in DevTools for testing), and confirm
the backlog cap actually caps by issuing a burst of commands faster than
they can be spoken and checking no more than `MAX_PENDING` pairs ever play
concurrently.
