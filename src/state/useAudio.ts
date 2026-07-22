import { useEffect, useState } from 'react'
import { eventBus } from '../engine/event-bus'
import { GameEventType, RadioSpeaker, ControllerStation } from '../engine/types'
import type { GameEvent, Command } from '../engine/types'
import { gameState } from '../engine/game-state'
import { tokenizeCommand, tokenizePilotCall } from '../engine/voice-tokenizer'
import { PilotCallType } from '../engine/types'

// ─── Voice Pack ───────────────────────────────────────────────────────────────

class VoicePack {
  private buffers = new Map<string, AudioBuffer>()
  private available = new Set<string>()
  ready = false

  async load(ctx: AudioContext): Promise<void> {
    try {
      const res = await fetch('./assets/voice/manifest.json')
      if (!res.ok) return
      const manifest = await res.json() as { version: number; tokens: string[] }
      if (!Array.isArray(manifest.tokens) || manifest.tokens.length === 0) return

      await Promise.all(manifest.tokens.map(async (name: string) => {
        const folder = name.startsWith('atc_') ? 'atc' : 'pilot'
        try {
          const r = await fetch(`./assets/voice/${folder}/${name}.wav`)
          if (!r.ok) return
          const buf = await ctx.decodeAudioData(await r.arrayBuffer())
          this.buffers.set(name, buf)
          this.available.add(name)
        } catch { /* skip missing clip */ }
      }))

      if (this.buffers.size > 0) {
        this.ready = true
        console.log(`[VoicePack] ${this.buffers.size}/${manifest.tokens.length} tokens loaded`)
      }
    } catch { /* manifest absent — TTS fallback */ }
  }

  hasAll(tokens: string[]): boolean {
    return tokens.length > 0 && tokens.every(t => this.buffers.has(t))
  }

  play(ctx: AudioContext, tokens: string[]): void {
    // bandpass filter simulates radio band (300–3400 Hz narrowed to 1500 Hz centre)
    const filter = ctx.createBiquadFilter()
    filter.type = 'bandpass'
    filter.frequency.value = 1500
    filter.Q.value = 0.8
    const gain = ctx.createGain()
    gain.gain.value = 0.85
    filter.connect(gain)
    gain.connect(ctx.destination)

    let offset = ctx.currentTime + 0.01
    const GAP = 0.05
    for (const name of tokens) {
      const buf = this.buffers.get(name)
      if (!buf) continue
      const src = ctx.createBufferSource()
      src.buffer = buf
      src.connect(filter)
      src.start(offset)
      offset += buf.duration + GAP
    }
  }
}

// ─── Audio Engine ─────────────────────────────────────────────────────────────

class AudioEngine {
  private ctx: AudioContext | null = null
  private pack = new VoicePack()
  public muted = false
  private voicePool: SpeechSynthesisVoice[] = []
  private voicesListenerAttached = false
  private pendingUtterances = 0
  private static readonly MAX_PENDING = 3
  private static readonly STATION_ORDER = [
    ControllerStation.GROUND,
    ControllerStation.TOWER,
    ControllerStation.APPROACH,
    ControllerStation.AREA,
  ]

  init(): void {
    if (!this.ctx) {
      this.ctx = new (window.AudioContext || (window as any).webkitAudioContext)()
      void this.pack.load(this.ctx)
    }
    if (this.ctx.state === 'suspended') this.ctx.resume()
    if ('speechSynthesis' in window) {
      this.resolveVoice()
      if (!this.voicesListenerAttached) {
        this.voicesListenerAttached = true
        window.speechSynthesis.addEventListener('voiceschanged', () => this.resolveVoice())
      }
    }
  }

  private resolveVoice(): void {
    const voices = window.speechSynthesis.getVoices()
    const local = voices.filter(v => v.localService && v.lang.startsWith('en'))
    const eng   = voices.filter(v => v.lang.startsWith('en'))
    const pool  = local.length > 0 ? local : eng.length > 0 ? eng : voices
    this.voicePool = [...pool].sort((a, b) => a.name.localeCompare(b.name))
  }

  hasVoice(): boolean { return this.voicePool.length > 0 }

  private atcVoice(controller: ControllerStation): SpeechSynthesisVoice {
    const idx = Math.max(0, AudioEngine.STATION_ORDER.indexOf(controller))
    return this.voicePool[idx % this.voicePool.length]
  }

  private pilotVoice(callsign: string): SpeechSynthesisVoice {
    let hash = 0
    for (let i = 0; i < callsign.length; i++) hash = (hash * 31 + callsign.charCodeAt(i)) >>> 0
    const reserved = AudioEngine.STATION_ORDER.length
    return this.voicePool.length > reserved
      ? this.voicePool[reserved + (hash % (this.voicePool.length - reserved))]
      : this.voicePool[hash % this.voicePool.length]
  }

  resetPendingSpeech(): void { this.pendingUtterances = 0 }

  playBeep(freq1: number, freq2: number | null, durationMs: number, type: OscillatorType = 'sine'): void {
    if (this.muted || !this.ctx) return
    const osc  = this.ctx.createOscillator()
    const gain = this.ctx.createGain()
    osc.type = type
    osc.frequency.setValueAtTime(freq1, this.ctx.currentTime)
    if (freq2) osc.frequency.linearRampToValueAtTime(freq2, this.ctx.currentTime + durationMs / 1000)
    gain.gain.setValueAtTime(0.1, this.ctx.currentTime)
    gain.gain.exponentialRampToValueAtTime(0.01, this.ctx.currentTime + durationMs / 1000)
    osc.connect(gain)
    gain.connect(this.ctx.destination)
    osc.start()
    osc.stop(this.ctx.currentTime + durationMs / 1000)
  }

  playRoger(): void  { this.playBeep(1000, null, 90, 'sine') }
  playAlert(): void  { this.playBeep(800, 600, 150, 'square') }

  private speakTTS(text: string, voice: SpeechSynthesisVoice, rate: number, pitch: number): void {
    if (!('speechSynthesis' in window) || !text) return
    if (this.pendingUtterances >= AudioEngine.MAX_PENDING) return
    this.pendingUtterances++
    const release = () => { this.pendingUtterances = Math.max(0, this.pendingUtterances - 1) }
    try {
      const u = new SpeechSynthesisUtterance(text)
      u.voice = voice
      u.rate  = rate
      u.pitch = pitch
      u.onend  = release
      u.onerror = release
      window.speechSynthesis.speak(u)
    } catch { release() }
  }

  speak(
    atcText: string,
    pilotText: string,
    controller: ControllerStation,
    callsign: string,
    atcTokens?: string[],
    pilotTokens?: string[],
  ): void {
    if (this.muted) return
    const ctx = this.ctx

    const atcClip   = ctx && atcTokens   && this.pack.hasAll(atcTokens)
    const pilotClip = ctx && pilotTokens && this.pack.hasAll(pilotTokens)

    // ATC speech
    if (atcClip && ctx) {
      this.pack.play(ctx, atcTokens!)
    } else if (atcText && this.voicePool.length > 0) {
      this.speakTTS(atcText, this.atcVoice(controller), 1.1, 1.0)
    }

    // Pilot readback — delayed to simulate readback gap
    setTimeout(() => {
      if (this.muted) return
      if (pilotClip && ctx) {
        this.pack.play(ctx, pilotTokens!)
      } else if (pilotText && this.voicePool.length > 0) {
        this.speakTTS(pilotText, this.pilotVoice(callsign), 1.15, 0.9)
      }
    }, 1500)
  }

  playSuccess(): void {
    if (this.muted || !this.ctx) return
    const t = this.ctx.currentTime
    const notes = [{ f: 523.25, start: 0 }, { f: 659.25, start: 0.1 }]
    for (const { f, start } of notes) {
      const osc  = this.ctx.createOscillator()
      const gain = this.ctx.createGain()
      osc.frequency.value = f
      gain.gain.setValueAtTime(0.1, t + start)
      gain.gain.exponentialRampToValueAtTime(0.01, t + start + 0.2)
      osc.connect(gain)
      gain.connect(this.ctx.destination)
      osc.start(t + start)
      osc.stop(t + start + 0.2)
    }
  }
}

const engine = new AudioEngine()

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useAudio(muted: boolean, toggleMute: () => void) {
  const [ttsAvailable, setTtsAvailable] = useState(false)

  useEffect(() => {
    engine.muted = muted
    if (muted && 'speechSynthesis' in window) {
      window.speechSynthesis.cancel()
      engine.resetPendingSpeech()
    }
  }, [muted])

  useEffect(() => {
    const handleInteraction = () => {
      engine.init()
      setTtsAvailable(engine.hasVoice())
    }
    window.addEventListener('click', handleInteraction, { once: true })
    window.addEventListener('keydown', handleInteraction, { once: true })

    const unsubCommand = eventBus.on(GameEventType.COMMAND_ISSUED, (e: GameEvent) => {
      engine.playRoger()

      const p = e.payload.phraseology as { atc: string; pilot: string; station: string } | undefined
      if (!p) return

      gameState.addRadioMessage({ timestamp: Date.now(), speaker: 'ATC', message: p.atc, station: p.station })
      setTimeout(() => {
        gameState.addRadioMessage({ timestamp: Date.now(), speaker: 'PILOT', message: p.pilot, station: e.payload.callsign as string })
      }, 1500)

      // Derive token sequences from the original command when voice pack is loaded
      const command = e.payload.command as Command | undefined
      let atcTokens: string[] | undefined
      let pilotTokens: string[] | undefined
      if (command) {
        const callsign = e.payload.callsign as string
        const aircraft = gameState.aircraft.get(callsign) ?? gameState.getAircraftByCallsign(callsign)
        if (aircraft) {
          const result = tokenizeCommand(command, aircraft, gameState.airport)
          atcTokens   = result.atcTokens
          pilotTokens = result.pilotTokens
        }
      }

      engine.speak(
        p.atc,
        p.pilot,
        (e.payload.controller as ControllerStation) ?? ControllerStation.TOWER,
        e.payload.callsign as string,
        atcTokens,
        pilotTokens,
      )
    })

    const unsubViolation = eventBus.on(GameEventType.SEPARATION_VIOLATION, () => {
      engine.playAlert()
    })

    const unsubPilotCall = eventBus.on(GameEventType.PILOT_CALL, (e: GameEvent) => {
      const message  = e.payload.message  as string
      const callsign = e.payload.callsign as string
      const callType = e.payload.callType as PilotCallType | undefined

      gameState.addRadioMessage({ timestamp: Date.now(), speaker: 'INBOUND', message, callsign })

      let pilotTokens: string[] | undefined
      if (callType) {
        const aircraft = gameState.aircraft.get(callsign) ?? gameState.getAircraftByCallsign(callsign)
        if (aircraft && gameState.airport) {
          pilotTokens = tokenizePilotCall(callType, aircraft, gameState.airport)
        }
      }

      engine.speak('', message, ControllerStation.GROUND, callsign, undefined, pilotTokens)
    })

    const unsubScore = eventBus.on(GameEventType.SCORE_CHANGED, (e: GameEvent) => {
      if (['takeoff', 'landing', 'departure_handoff', 'arrived_gate'].includes(e.payload.reason as string)) {
        engine.playSuccess()
      }
    })

    const onToggleMute = () => toggleMute()
    window.addEventListener('toggle-mute', onToggleMute)

    const handleKey = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() === 'm') window.dispatchEvent(new CustomEvent('toggle-mute'))
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
