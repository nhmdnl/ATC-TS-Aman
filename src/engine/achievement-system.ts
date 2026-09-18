import type { CommendationId } from './constants'
import { eventBus } from './event-bus'
import { gameState } from './game-state'
import { GameEventType } from './types'
import type { Aircraft, GameEvent } from './types'

const STORAGE_KEY = 'atc_aman_commendations'
const STORAGE_VERSION = 1

export interface CommendationStore {
  version: number
  unlocked: Record<string, string>
  counters: Record<string, number>
}

type UnlockListener = (id: CommendationId) => void

function defaultStorage(): Storage | null {
  try {
    if (typeof localStorage === 'undefined') return null
    return localStorage
  } catch {
    return null
  }
}

function emptyStore(): CommendationStore {
  return { version: STORAGE_VERSION, unlocked: {}, counters: {} }
}

export class AchievementSystem {
  state: CommendationStore = emptyStore()

  private storage: Storage | null
  private seenGeneration = -1
  private sessionHadPlayerViolation = false
  private unlockListeners = new Set<UnlockListener>()

  constructor(storage?: Storage | null) {
    this.storage = storage === undefined ? defaultStorage() : storage
    this.load()

    eventBus.on(GameEventType.LANDING, (e) => this.onLanding(e))
    eventBus.on(GameEventType.SEPARATION_VIOLATION, (e) => this.onSeparation(e))
    eventBus.on(GameEventType.SESSION_ENDED, () => this.onSessionEnded())
  }

  onUnlock(listener: UnlockListener): () => void {
    this.unlockListeners.add(listener)
    return () => { this.unlockListeners.delete(listener) }
  }

  isUnlocked(id: string): boolean {
    return this.state.unlocked[id] != null
  }

  /** Test helper — wipe in-memory progress. Does not remove event listeners. */
  resetForTests(): void {
    this.state = emptyStore()
    this.seenGeneration = -1
    this.sessionHadPlayerViolation = false
    this.storage = null
  }

  /** Test helper — swap the backing store and reload (null = memory only). */
  rebindStorage(storage: Storage | null): void {
    this.storage = storage
    this.state = emptyStore()
    this.load()
  }

  private syncSession(): void {
    if (this.seenGeneration === gameState.sessionGeneration) return
    this.seenGeneration = gameState.sessionGeneration
    this.sessionHadPlayerViolation = false
  }

  private onLanding(e: GameEvent): void {
    this.syncSession()
    const ac = this.playerAircraft(e.payload.callsign as string | undefined)
    if (!ac) return

    if (ac.radioFailureUsed) {
      this.bump('nordo_safe_landings')
      this.unlock('say_again')
    }

    if (ac.type.rotorcraft) {
      const pads = gameState.airport?.heliports ?? []
      const onPad = pads.length === 0
        ? true
        : (ac.assignedGate != null && pads.some(h => h.id === ac.assignedGate))
      if (onPad) {
        this.bump('rotor_pad_landings')
        this.unlock('rotors_turning')
      }
    }
  }

  private onSeparation(e: GameEvent): void {
    this.syncSession()
    const violation = e.payload.violation as { callsign1?: string; callsign2?: string } | undefined
    const signs = [
      (e.payload.callsign as string | undefined),
      violation?.callsign1,
      violation?.callsign2,
    ]
    if (!signs.some(cs => this.playerAircraft(cs))) return
    this.sessionHadPlayerViolation = true
    this.bump('player_separation_violations')
  }

  private onSessionEnded(): void {
    this.syncSession()
    this.bump('sessions_completed')
    this.unlock('first_watch')

    // ponytail: empty sessions are not a clean sheet — aircraftHandled is already player-station-only
    if (gameState.aircraftHandled > 0 && !this.sessionHadPlayerViolation) {
      this.unlock('clean_sheet')
    }
  }

  private playerAircraft(callsign: string | undefined): Aircraft | undefined {
    if (!callsign) return undefined
    const ac = gameState.getAircraftByCallsign(callsign)
    if (!ac) return undefined
    if (!gameState.playerStations.includes(ac.controller)) return undefined
    return ac
  }

  private bump(key: string): void {
    this.state.counters[key] = (this.state.counters[key] ?? 0) + 1
    this.save()
  }

  private unlock(id: CommendationId): void {
    if (this.state.unlocked[id]) return
    this.state.unlocked[id] = new Date().toISOString()
    this.save()
    for (const listener of this.unlockListeners) listener(id)
  }

  private load(): void {
    if (!this.storage) return
    try {
      const raw = this.storage.getItem(STORAGE_KEY)
      if (!raw) return
      const parsed = JSON.parse(raw) as CommendationStore
      if (!parsed || typeof parsed !== 'object') return
      this.state = {
        version: STORAGE_VERSION,
        unlocked: parsed.unlocked && typeof parsed.unlocked === 'object' ? parsed.unlocked : {},
        counters: parsed.counters && typeof parsed.counters === 'object' ? parsed.counters : {},
      }
    } catch (e) {
      console.warn('Failed to load commendations', e)
    }
  }

  private save(): void {
    if (!this.storage) return
    try {
      this.storage.setItem(STORAGE_KEY, JSON.stringify(this.state))
    } catch (e) {
      console.warn('Failed to save commendations', e)
    }
  }
}

export const achievementSystem = new AchievementSystem()
