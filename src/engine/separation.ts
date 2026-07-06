import type { Aircraft } from './types'
import { SEPARATION_NM, SEPARATION_FT, SEPARATION_COOLDOWN_MS, AIRBORNE_PHASES } from './constants'
import { distanceNM } from './movement'
import { eventBus } from './event-bus'
import { GameEventType } from './types'

type ViolationPairKey = string

function makePairKey(id1: string, id2: string): ViolationPairKey {
  return [id1, id2].sort().join('|')
}

export interface SeparationViolation {
  callsign1: string
  callsign2: string
  lateralNM: number
  verticalFt: number
}

export class SeparationChecker {
  private cooldowns: Map<ViolationPairKey, number> = new Map()

  /**
   * Check all airborne aircraft pairs for separation violations.
   * @param aircraft List of all active aircraft
   * @param nowMs Current timestamp in ms
   * @returns Array of new violations detected this tick
   */
  checkSeparation(aircraft: Aircraft[], nowMs: number): SeparationViolation[] {
    const violations: SeparationViolation[] = []
    
    // Filter to only airborne aircraft
    const airborne = aircraft.filter(ac => AIRBORNE_PHASES.has(ac.phase))

    for (let i = 0; i < airborne.length; i++) {
      for (let j = i + 1; j < airborne.length; j++) {
        const ac1 = airborne[i]
        const ac2 = airborne[j]

        const lateralDist = distanceNM(ac1.x, ac1.y, ac2.x, ac2.y)
        const verticalDist = Math.abs(ac1.altitude - ac2.altitude)

        if (lateralDist < SEPARATION_NM && verticalDist < SEPARATION_FT) {
          const pairKey = makePairKey(ac1.id, ac2.id)
          const lastViolationTime = this.cooldowns.get(pairKey) ?? 0

          // If not in cooldown, register violation
          if (nowMs - lastViolationTime > SEPARATION_COOLDOWN_MS) {
            this.cooldowns.set(pairKey, nowMs)
            
            ac1.inViolation = true
            ac2.inViolation = true

            const violation: SeparationViolation = {
              callsign1: ac1.callsign,
              callsign2: ac2.callsign,
              lateralNM: lateralDist,
              verticalFt: verticalDist
            }
            
            violations.push(violation)

            eventBus.emit(GameEventType.SEPARATION_VIOLATION, {
              callsign: ac1.callsign, // For score tracking, attribute to one or both? Usually handled in scoring.
              violation
            })
          } else {
             // Still in violation, keep flags true
             ac1.inViolation = true
             ac2.inViolation = true
          }
        }
      }
    }

    return violations
  }

  reset(): void {
    this.cooldowns.clear()
  }
}

export const separationChecker = new SeparationChecker()

/**
 * Clear the inViolation flag on all aircraft.
 * Should be called at the start of the separation check phase.
 */
export function clearViolationFlags(aircraft: Aircraft[]): void {
  for (const ac of aircraft) {
    ac.inViolation = false
  }
}
