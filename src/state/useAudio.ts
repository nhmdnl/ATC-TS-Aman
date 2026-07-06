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
    if (muted && 'speechSynthesis' in window) window.speechSynthesis.cancel()
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
