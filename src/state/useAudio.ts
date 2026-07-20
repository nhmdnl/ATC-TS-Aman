import { useEffect, useState } from 'react'
import { eventBus } from '../engine/event-bus'
import { GameEventType, RadioSpeaker, ControllerStation } from '../engine/types'
import type { GameEvent } from '../engine/types'
import { gameState } from '../engine/game-state'

class AudioEngine {
  private ctx: AudioContext | null = null
  public muted = false
  private voicePool: SpeechSynthesisVoice[] = []
  private voicesListenerAttached = false
  private pendingUtterances = 0
  private static readonly MAX_PENDING = 3   // ATC+pilot pairs, roughly 1.5 exchanges deep
  // Fixed station→pool-index order so each controller keeps one voice all session.
  private static readonly STATION_ORDER = [
    ControllerStation.GROUND,
    ControllerStation.TOWER,
    ControllerStation.APPROACH,
    ControllerStation.AREA,
  ]

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
    // Prefer local (non-network) English voices for latency + offline
    // reliability; fall back to any English voice, then to whatever exists.
    // On Windows (the deployment target) this keeps the full SAPI/OneCore set
    // (David, Zira, Mark, ...). Sorted by name so pool indices — and therefore
    // per-role voice assignment — are stable across sessions and across the
    // async voiceschanged re-fires Windows does on startup.
    const localEnglish = voices.filter(v => v.localService && v.lang.startsWith('en'))
    const english = voices.filter(v => v.lang.startsWith('en'))
    const pool = localEnglish.length > 0 ? localEnglish : english.length > 0 ? english : voices
    this.voicePool = [...pool].sort((a, b) => a.name.localeCompare(b.name))
  }

  hasVoice(): boolean {
    return this.voicePool.length > 0
  }

  /** One fixed voice per controller station (Ground/Tower/Approach/Area). */
  private atcVoice(controller: ControllerStation): SpeechSynthesisVoice {
    const idx = Math.max(0, AudioEngine.STATION_ORDER.indexOf(controller))
    return this.voicePool[idx % this.voicePool.length]
  }

  /** Deterministic per-callsign voice so each aircraft sounds consistent.
   *  Offset past the controller block when the pool is big enough, so a
   *  pilot never shares a voice with the station they're talking to. */
  private pilotVoice(callsign: string): SpeechSynthesisVoice {
    let hash = 0
    for (let i = 0; i < callsign.length; i++) {
      hash = (hash * 31 + callsign.charCodeAt(i)) >>> 0
    }
    const reserved = AudioEngine.STATION_ORDER.length
    if (this.voicePool.length > reserved) {
      return this.voicePool[reserved + (hash % (this.voicePool.length - reserved))]
    }
    return this.voicePool[hash % this.voicePool.length]
  }

  /** Reset the pending-speech backlog counter — call immediately after
   *  cancel(), since canceled/queued utterances may not fire onend/onerror,
   *  which would otherwise leak pendingUtterances permanently. */
  resetPendingSpeech(): void {
    this.pendingUtterances = 0
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

  /**
   * Speak an ATC line followed by a pilot readback, with a distinct voice
   * per controller station and per aircraft callsign (voice pool permitting).
   * Silently does nothing if muted, TTS is unsupported, no voice was ever
   * resolved, or the pending-pair backlog is already at capacity — in every
   * case the radio log (text) already has both lines regardless, so nothing
   * informational is lost, only the audio for the overflow.
   */
  speak(atcText: string, pilotText: string, controller: ControllerStation, callsign: string): void {
    if (this.muted || !('speechSynthesis' in window) || this.voicePool.length === 0) return
    if (this.pendingUtterances >= AudioEngine.MAX_PENDING) return

    this.pendingUtterances++
    const release = () => { this.pendingUtterances = Math.max(0, this.pendingUtterances - 1) }

    try {
      const u1 = new SpeechSynthesisUtterance(atcText)
      u1.voice = this.atcVoice(controller)
      u1.rate = 1.1
      u1.pitch = 1.0

      const u2 = new SpeechSynthesisUtterance(pilotText)
      u2.voice = this.pilotVoice(callsign)
      u2.rate = 1.15
      u2.pitch = 0.9 // keeps roles apart even on a single-voice pool (Linux dev)
      u2.onend = release
      u2.onerror = release

      window.speechSynthesis.speak(u1)
      window.speechSynthesis.speak(u2) // queues after u1
    } catch {
      release() // TTS unavailable — beeps and the log still work
    }
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
  const [ttsAvailable, setTtsAvailable] = useState(false)

  // Keep the engine's internal flag (checked by playBeep/playSuccess) in sync
  // with the GameContext-owned mute state, and cut off any in-flight speech
  // the instant the player mutes.
  useEffect(() => {
    engine.muted = muted
    if (muted && 'speechSynthesis' in window) {
      window.speechSynthesis.cancel()
      engine.resetPendingSpeech()
    }
  }, [muted])

  useEffect(() => {
    // Need user interaction to start AudioContext usually, but we initialize here
    const handleInteraction = () => {
      engine.init()
      setTtsAvailable(engine.hasVoice())
    }
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

      // Best-effort speech on top — engine.speak() handles the mute check,
      // voice availability, and backlog cap internally.
      engine.speak(
        p.atc,
        p.pilot,
        (e.payload.controller as ControllerStation) ?? ControllerStation.TOWER,
        e.payload.callsign as string,
      )
    })

    const unsubViolation = eventBus.on(GameEventType.SEPARATION_VIOLATION, () => {
      engine.playAlert()
    })

    // Incoming pilot calls: write to radio log as INBOUND, speak as pilot voice
    const unsubPilotCall = eventBus.on(GameEventType.PILOT_CALL, (e: GameEvent) => {
      const message = e.payload.message as string
      const callsign = e.payload.callsign as string
      gameState.addRadioMessage({
        timestamp: Date.now(),
        speaker: 'INBOUND',
        message,
        callsign,
      })
      // Speak as pilot voice (speak() second arg = pilot text)
      engine.speak('', message, ControllerStation.GROUND, callsign)
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

    const onVoicesChanged = () => setTtsAvailable(engine.hasVoice())
    if ('speechSynthesis' in window) {
      window.speechSynthesis.addEventListener('voiceschanged', onVoicesChanged)
    }

    return () => {
      unsubCommand()
      unsubViolation()
      unsubPilotCall()
      unsubScore()
      window.removeEventListener('click', handleInteraction)
      window.removeEventListener('keydown', handleInteraction)
      window.removeEventListener('toggle-mute', onToggleMute)
      window.removeEventListener('keydown', handleKey)
      if ('speechSynthesis' in window) {
        window.speechSynthesis.removeEventListener('voiceschanged', onVoicesChanged)
      }
    }
  }, [muted, toggleMute])

  return { ttsAvailable }
}
