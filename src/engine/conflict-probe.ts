import type { Aircraft } from './types'
import { AIRBORNE_PHASES, CONFLICT_PROBE_HORIZON_S, CONFLICT_PROBE_STEP_S, SEPARATION_FT } from './constants'
import { requiredSepNM } from './separation'
import { distanceNM, headingToRadians } from './movement'

interface ProjectedState {
  x: number
  y: number
  altitude: number
}

/**
 * Dead-reckon one aircraft `seconds` ahead along its current clearance:
 * constant heading (clearedHeading if set, else current), constant speed,
 * altitude converging on clearedAltitude at the type's climb/descent rate.
 * Deliberately simple — a vectoring probe, not a flight-management system.
 */
function project(aircraft: Aircraft, seconds: number): ProjectedState {
  const heading = aircraft.clearedHeading ?? aircraft.heading
  const rad = headingToRadians(heading)
  const distanceNMFlown = (aircraft.speed / 3600) * seconds
  // Movement convention matches movement.ts: x = cos(rad), y = sin(rad)
  const x = aircraft.x + Math.cos(rad) * distanceNMFlown
  const y = aircraft.y + Math.sin(rad) * distanceNMFlown

  let altitude = aircraft.altitude
  if (aircraft.clearedAltitude != null && aircraft.clearedAltitude !== aircraft.altitude) {
    const ratePerS = (aircraft.type.climbRate / 60) // ft per second (climb rate used both ways — magnitude only)
    const delta = aircraft.clearedAltitude - aircraft.altitude
    const maxChange = ratePerS * seconds
    altitude = Math.abs(delta) <= maxChange
      ? aircraft.clearedAltitude
      : aircraft.altitude + Math.sign(delta) * maxChange
  }

  return { x, y, altitude }
}

/**
 * Conflict prediction probe — dead-reckons every airborne aircraft up to
 * CONFLICT_PROBE_HORIZON_S ahead in CONFLICT_PROBE_STEP_S increments and marks
 * pairs that will lose separation (wake-matrix-aware) if nothing changes.
 *
 * Purely advisory: sets `predictedConflictWith` / `predictedConflictInS` for
 * the radar's amber indications. No scoring, no flags shared with the reactive
 * separation checker. Pairs already inViolation are skipped — the red pulse
 * already covers them.
 *
 * Runs once per tick (after the separation check) inside simulation-tick.ts.
 */
export function predictConflicts(aircraft: Aircraft[]): void {
  // Reset last tick's predictions — every probe run recomputes from scratch
  for (const ac of aircraft) {
    ac.predictedConflictWith = null
    ac.predictedConflictInS = null
  }

  const airborne = aircraft.filter(ac => AIRBORNE_PHASES.has(ac.phase))

  for (let i = 0; i < airborne.length; i++) {
    for (let j = i + 1; j < airborne.length; j++) {
      const ac1 = airborne[i]
      const ac2 = airborne[j]

      // Already flashing red — a prediction adds nothing
      if (ac1.inViolation || ac2.inViolation) continue
      if (ac1.speed < 30 && ac2.speed < 30) continue

      const requiredNM = requiredSepNM(ac1, ac2)

      for (let t = CONFLICT_PROBE_STEP_S; t <= CONFLICT_PROBE_HORIZON_S; t += CONFLICT_PROBE_STEP_S) {
        const p1 = project(ac1, t)
        const p2 = project(ac2, t)
        if (distanceNM(p1.x, p1.y, p2.x, p2.y) < requiredNM &&
            Math.abs(p1.altitude - p2.altitude) < SEPARATION_FT) {
          ac1.predictedConflictWith = ac2.callsign
          ac1.predictedConflictInS = t
          ac2.predictedConflictWith = ac1.callsign
          ac2.predictedConflictInS = t
          break // earliest loss found for this pair
        }
      }
    }
  }
}
