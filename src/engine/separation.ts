import type { Aircraft } from './types'
import { SEPARATION_FT, SEPARATION_COOLDOWN_MS, AIRBORNE_PHASES, WAKE_SEPARATION_NM, MRS_NM } from './constants'
import { distanceNM } from './movement'
import { eventBus } from './event-bus'
import { GameEventType } from './types'

type ViolationPairKey = string

function makePairKey(id1: string, id2: string): ViolationPairKey {
  return [id1, id2].sort().join('|')
}

/**
 * Required lateral separation for a pair using the TS3 wake turbulence matrix.
 * Takes the conservative (max) of both orderings since we don't resolve
 * leader/trailer in general airspace.
 */
function requiredSepNM(ac1: Aircraft, ac2: Aircraft): number {
  const cat1 = ac1.type.wakeCategory
  const cat2 = ac2.type.wakeCategory
  const a = WAKE_SEPARATION_NM[cat1]?.[cat2] ?? MRS_NM
  const b = WAKE_SEPARATION_NM[cat2]?.[cat1] ?? MRS_NM
  return Math.max(a, b)
}

export interface SeparationViolation {
  callsign1: string
  callsign2: string
  lateralNM: number
  verticalFt: number
  requiredNM: number
}

export class SeparationChecker {
  private cooldowns: Map<ViolationPairKey, number> = new Map()

  checkSeparation(aircraft: Aircraft[], nowMs: number): SeparationViolation[] {
    const violations: SeparationViolation[] = []
    const airborne = aircraft.filter(ac => AIRBORNE_PHASES.has(ac.phase))

    for (let i = 0; i < airborne.length; i++) {
      for (let j = i + 1; j < airborne.length; j++) {
        const ac1 = airborne[i]
        const ac2 = airborne[j]

        const lateralDist = distanceNM(ac1.x, ac1.y, ac2.x, ac2.y)
        const verticalDist = Math.abs(ac1.altitude - ac2.altitude)
        const required = requiredSepNM(ac1, ac2)

        if (lateralDist < required && verticalDist < SEPARATION_FT) {
          const pairKey = makePairKey(ac1.id, ac2.id)
          const lastViolationTime = this.cooldowns.get(pairKey) ?? 0

          if (nowMs - lastViolationTime > SEPARATION_COOLDOWN_MS) {
            this.cooldowns.set(pairKey, nowMs)
            ac1.inViolation = true
            ac2.inViolation = true

            const violation: SeparationViolation = {
              callsign1: ac1.callsign,
              callsign2: ac2.callsign,
              lateralNM: lateralDist,
              verticalFt: verticalDist,
              requiredNM: required,
            }
            violations.push(violation)
            eventBus.emit(GameEventType.SEPARATION_VIOLATION, { callsign: ac1.callsign, violation })
          } else {
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

export function clearViolationFlags(aircraft: Aircraft[]): void {
  for (const ac of aircraft) {
    ac.inViolation = false
  }
}
