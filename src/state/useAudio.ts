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

  /** Output node clips play through — lets the engine mute in-flight audio. */
  out: AudioNode | null = null

  /** Total playback time of a clip chain in seconds (clips + inter-clip gaps). */
  duration(tokens: string[]): number {
    let d = 0
    for (const name of tokens) {
      const buf = this.buffers.get(name)
      if (buf) d += buf.duration + 0.05
    }
    return d
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
    gain.connect(this.out ?? ctx.destination)

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

// ─── Transmission scheduling ──────────────────────────────────────────────────

const READBACK_GAP_MS = 600

/** Serialize radio traffic: ATC starts once the frequency is free, the pilot
 *  reads back after ATC finishes plus a gap. Pure — exported for tests. */
export function transmissionSchedule(
  nowMs: number,
  busyUntilMs: number,
  atcMs: number,
  pilotMs: number,
): { atcStartMs: number; pilotStartMs: number; busyUntilMs: number } {
  const atcStartMs = Math.max(nowMs, busyUntilMs)
  const pilotStartMs = atcMs > 0 ? atcStartMs + atcMs + READBACK_GAP_MS : atcStartMs
  return {
    atcStartMs,
    pilotStartMs,
    busyUntilMs: pilotMs > 0 ? pilotStartMs + pilotMs : atcStartMs + atcMs,
  }
}

// ─── Audio Engine ─────────────────────────────────────────────────────────────

class AudioEngine {
  private ctx: AudioContext | null = null
  private pack = new VoicePack()
  private masterGain: GainNode | null = null
  public muted = false
  private voicePool: SpeechSynthesisVoice[] = []
  private voicesListenerAttached = false
  private pendingUtterances = 0
  private busyUntilMs = 0 // performance.now() timestamp when the frequency goes quiet
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
      // Clips route through a master gain so muting silences a transmission
      // already on the air, not just future ones
      this.masterGain = this.ctx.createGain()
      this.masterGain.connect(this.ctx.destination)
      this.pack.out = this.masterGain
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

  resetPendingSpeech(): void {
    this.pendingUtterances = 0
    this.busyUntilMs = 0
  }

  setMuted(muted: boolean): void {
    this.muted = muted
    if (this.masterGain) this.masterGain.gain.value = muted ? 0 : 1
  }

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

  // ponytail: rough TTS pacing (~3 words/s at rate 1) — only used to hold the
  // frequency; speechSynthesis itself already queues TTS-vs-TTS serially.
  private ttsEstimateMs(text: string, rate: number): number {
    const words = text.split(/\s+/).filter(Boolean).length
    return (words / (3 * rate)) * 1000 + 300
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

    // One transmission at a time: wait for whatever is already on frequency,
    // then ATC speaks in full, then the pilot reads back after a short gap.
    const now = performance.now()
    const atcDurMs = atcClip
      ? this.pack.duration(atcTokens!) * 1000
      : atcText && this.voicePool.length > 0 ? this.ttsEstimateMs(atcText, 1.1) : 0
    const pilotDurMs = pilotClip
      ? this.pack.duration(pilotTokens!) * 1000
      : pilotText && this.voicePool.length > 0 ? this.ttsEstimateMs(pilotText, 1.15) : 0

    const sched = transmissionSchedule(now, this.busyUntilMs, atcDurMs, pilotDurMs)
    this.busyUntilMs = sched.busyUntilMs

    if (atcDurMs > 0) {
      setTimeout(() => {
        if (this.muted) return
        if (atcClip && ctx) this.pack.play(ctx, atcTokens!)
        else this.speakTTS(atcText, this.atcVoice(controller), 1.1, 1.0)
      }, sched.atcStartMs - now)
    }

    if (pilotDurMs > 0) {
      setTimeout(() => {
        if (this.muted) return
        if (pilotClip && ctx) this.pack.play(ctx, pilotTokens!)
        else this.speakTTS(pilotText, this.pilotVoice(callsign), 1.15, 0.9)
      }, sched.pilotStartMs - now)
    }
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

export function useAudio(muted: boolean) {
  const [ttsAvailable, setTtsAvailable] = useState(false)

  useEffect(() => {
    engine.setMuted(muted)
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

    // NOTE: no 'toggle-mute' listener or 'm' key handler here — GameContext
    // owns the event and useKeyboardShortcuts owns the key. Duplicating either
    // made every press toggle mute an even number of times (net no-op).
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
      if ('speechSynthesis' in window) {
        window.speechSynthesis.removeEventListener('voiceschanged', onVoicesChanged)
      }
    }
  }, [muted])

  return { ttsAvailable }
}
