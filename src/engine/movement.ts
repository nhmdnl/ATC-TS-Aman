import type { Aircraft, RunwayData, GateData } from './types'
import { AircraftPhase } from './types'
import { METERS_PER_NM, FT_PER_NM_GLIDESLOPE, MAX_TRAIL_LENGTH } from './constants'

// ─── Math Utilities ──────────────────────────────────────────────────────────

export function normalizeHeading(h: number): number {
  let norm = h % 360
  if (norm < 0) norm += 360
  return norm
}

export function headingToRadians(heading: number): number {
  // Heading 0 = +y (North), 90 = +x (East)
  // Standard Math radians: 0 = +x, pi/2 = +y
  // So: radians = (90 - heading) * (Math.PI / 180)
  // Wait, if 0 = +y and 90 = +x, then x = sin(heading), y = cos(heading)
  // To keep it simple, we just use math radians directly for standard JS Math.cos/sin
  // where y is up (positive). If the renderer uses inverted y, that's handled there.
  return (90 - heading) * (Math.PI / 180)
}

export function distanceNM(x1: number, y1: number, x2: number, y2: number): number {
  return Math.sqrt(Math.pow(x2 - x1, 2) + Math.pow(y2 - y1, 2))
}

export function bearingBetween(x1: number, y1: number, x2: number, y2: number): number {
  // Returns heading (0-359) from point 1 to point 2
  const dx = x2 - x1
  const dy = y2 - y1
  let radians = Math.atan2(dy, dx)
  // Math.atan2 returns 0 for +x (East), pi/2 for +y (North)
  // We want 0 for North, 90 for East
  let degrees = 90 - (radians * (180 / Math.PI))
  return normalizeHeading(degrees)
}

export function turnToward(currentHeading: number, targetHeading: number, maxTurnRate: number): number {
  const diff = normalizeHeading(targetHeading - currentHeading)
  // if diff > 180, turn left, else turn right
  let turnAmount = diff
  if (diff > 180) {
    turnAmount = diff - 360
  }
  
  if (Math.abs(turnAmount) <= maxTurnRate) {
    return targetHeading
  } else {
    return normalizeHeading(currentHeading + Math.sign(turnAmount) * maxTurnRate)
  }
}

/**
 * Heading that tracks the runway centerline (PRD §7.4): when cross-track error
 * exceeds ~20 m, steer toward a point `aheadMeters` further along the centerline
 * in the direction of travel; otherwise hold runway heading. Shared by approach,
 * landing, and rollout so a touchdown offset gets flown out instead of persisting
 * as a parallel roll.
 */
export function centerlineHeading(aircraft: Aircraft, runway: RunwayData, aheadMeters = 500): number {
  const rwyRad = headingToRadians(runway.trueHeading)
  const dx = aircraft.x - runway.thresholdX
  const dy = aircraft.y - runway.thresholdY
  const xteMeters = Math.abs(dx * -Math.sin(rwyRad) + dy * Math.cos(rwyRad)) * METERS_PER_NM
  if (xteMeters <= 20) return runway.trueHeading

  const aheadNM = aheadMeters / METERS_PER_NM
  const distAlongLine = -(dx * Math.cos(rwyRad) + dy * Math.sin(rwyRad))
  const targetDist = distAlongLine - aheadNM
  const targetX = runway.thresholdX - Math.cos(rwyRad) * targetDist
  const targetY = runway.thresholdY - Math.sin(rwyRad) * targetDist
  return bearingBetween(aircraft.x, aircraft.y, targetX, targetY)
}

// ─── Movement Sub-Functions ──────────────────────────────────────────────────

// Line-up and backtrack happen on the runway itself — brisker than apron taxi
const RUNWAY_TAXI_SPEED_KT = 35

function moveTaxi(aircraft: Aircraft, dtSeconds: number): void {
  const target = aircraft.taxiTarget
  if (!target) return // Nowhere to go

  const dist = distanceNM(aircraft.x, aircraft.y, target.x, target.y)
  const onRunway = aircraft.phase === AircraftPhase.LINE_UP || aircraft.phase === AircraftPhase.TAKEOFF_ROLL || aircraft.phase === AircraftPhase.ROLLOUT
  const taxiSpeedKnots = aircraft.clearedSpeed ??
    (onRunway ? Math.max(RUNWAY_TAXI_SPEED_KT, aircraft.type.taxiSpeed) : aircraft.type.taxiSpeed)

  if (dist < 0.01) {
    // Reached the current waypoint — advance along the route, or stop at the end
    if (aircraft.taxiRoute && aircraft.taxiRouteIndex < aircraft.taxiRoute.length - 1) {
      aircraft.taxiRouteIndex++
      aircraft.taxiTarget = aircraft.taxiRoute[aircraft.taxiRouteIndex]
      return // keep rolling toward the next waypoint on the next tick
    }
    aircraft.x = target.x
    aircraft.y = target.y
    aircraft.speed = 0
    return
  }

  // Accelerate / decelerate toward taxi speed
  if (aircraft.speed < taxiSpeedKnots) {
    aircraft.speed = Math.min(aircraft.speed + 2, taxiSpeedKnots)
  } else if (aircraft.speed > taxiSpeedKnots) {
    aircraft.speed = Math.max(aircraft.speed - 2, taxiSpeedKnots)
  }

  const travelNM = (aircraft.speed / 3600) * dtSeconds
  
  // If we would overshoot, just go to the target
  if (travelNM >= dist) {
    aircraft.x = target.x
    aircraft.y = target.y
    aircraft.heading = bearingBetween(aircraft.x, aircraft.y, target.x, target.y)
    return
  }

  const targetHeading = bearingBetween(aircraft.x, aircraft.y, target.x, target.y)
  // Turn instantly on taxiways for simplicity, or max 30 deg/sec
  aircraft.heading = turnToward(aircraft.heading, targetHeading, 30)

  const rad = headingToRadians(aircraft.heading)
  aircraft.x += Math.cos(rad) * travelNM
  aircraft.y += Math.sin(rad) * travelNM
}

function moveLineUp(aircraft: Aircraft, dtSeconds: number, runway: RunwayData | null): void {
  // Follow the executor-built path (hold-short → runway entry → threshold),
  // then swing onto runway heading and hold for takeoff clearance (T-009).
  if (aircraft.taxiRoute && aircraft.taxiRoute.length > 0) {
    const end = aircraft.taxiRoute[aircraft.taxiRoute.length - 1]
    if (distanceNM(aircraft.x, aircraft.y, end.x, end.y) < 0.01) {
      aircraft.speed = 0
      if (runway) aircraft.heading = turnToward(aircraft.heading, runway.trueHeading, 30)
      return
    }
    moveTaxi(aircraft, dtSeconds)
    return
  }

  // Fallback (no graph in the airport file): legacy creep toward runway heading
  if (!runway) return
  const targetHeading = runway.trueHeading
  aircraft.heading = turnToward(aircraft.heading, targetHeading, 15)

  // Move toward runway heading at taxi speed
  const taxiSpeedKnots = aircraft.type.taxiSpeed
  if (aircraft.speed < taxiSpeedKnots) {
    aircraft.speed = Math.min(aircraft.speed + 2, taxiSpeedKnots)
  }

  const travelNM = (aircraft.speed / 3600) * dtSeconds
  const rad = headingToRadians(aircraft.heading)
  aircraft.x += Math.cos(rad) * travelNM
  aircraft.y += Math.sin(rad) * travelNM
}

function moveTakeoffRoll(aircraft: Aircraft, dtSeconds: number, runway: RunwayData | null): void {
  // Cleared while still backtracking to the threshold (T-009 line-up route):
  // finish the taxi first, or the roll starts midfield and runs off the far end
  if (aircraft.taxiRoute && aircraft.taxiRoute.length > 0) {
    const end = aircraft.taxiRoute[aircraft.taxiRoute.length - 1]
    if (distanceNM(aircraft.x, aircraft.y, end.x, end.y) >= 0.01) {
      moveTaxi(aircraft, dtSeconds)
      return
    }
    aircraft.taxiRoute = null
    aircraft.taxiTarget = null
    aircraft.speed = 0
  }

  if (runway) {
    // Track the drawn centerline — bare runway heading would freeze any
    // line-up offset into a parallel roll off the strip (same as rollout)
    const target = centerlineHeading(aircraft, runway)
    const diff = Math.abs(normalizeHeading(target - aircraft.heading))
    if (diff > 45 && diff < 315) {
      // Turnaround at the threshold: swing around before rolling
      aircraft.heading = turnToward(aircraft.heading, target, 30)
      return
    }
    aircraft.heading = turnToward(aircraft.heading, target, 8)
  }

  // Accelerate (~0.25 g — a B738 reaches Vr ≈ 145 kt in ~29 s / 0.6 NM)
  aircraft.speed += 5
  
  const travelNM = (aircraft.speed / 3600) * dtSeconds
  const rad = headingToRadians(aircraft.heading)
  aircraft.x += Math.cos(rad) * travelNM
  aircraft.y += Math.sin(rad) * travelNM
}

function moveClimb(aircraft: Aircraft, dtSeconds: number): void {
  // Rotorcraft liftoff (T-014): hover-climb vertically until ~500 ft, then
  // accelerate out on heading like any departure. Departure altitudes run
  // from 0 at the pad, matching the fixed-wing climb profile frame.
  if (aircraft.type.rotorcraft && aircraft.altitude < 500) {
    const targetAlt = aircraft.clearedAltitude ?? aircraft.type.serviceCeiling
    if (aircraft.altitude < targetAlt) {
      const climbFt = aircraft.type.climbRate * (dtSeconds / 60)
      aircraft.altitude = Math.min(aircraft.altitude + climbFt, targetAlt)
    }
    return // no translation while transitioning to forward flight
  }

  // Heading
  const targetHeading = aircraft.clearedHeading !== null ? aircraft.clearedHeading : aircraft.heading
  aircraft.heading = turnToward(aircraft.heading, targetHeading, 3) // standard rate ~3 deg/sec

  // Speed
  const targetSpeed = aircraft.clearedSpeed ?? aircraft.type.cruiseSpeed
  if (aircraft.speed < targetSpeed) {
    aircraft.speed = Math.min(aircraft.speed + 3, targetSpeed)
  } else if (aircraft.speed > targetSpeed) {
    aircraft.speed = Math.max(aircraft.speed - 1, targetSpeed)
  }

  // Altitude
  const targetAlt = aircraft.clearedAltitude ?? aircraft.type.serviceCeiling
  if (aircraft.altitude < targetAlt) {
    const climbFt = aircraft.type.climbRate * (dtSeconds / 60)
    aircraft.altitude = Math.min(aircraft.altitude + climbFt, targetAlt)
  } else if (aircraft.altitude > targetAlt) {
    const descFt = aircraft.type.descentRate * (dtSeconds / 60)
    aircraft.altitude = Math.max(aircraft.altitude - descFt, targetAlt)
  }

  // Position
  const travelNM = (aircraft.speed / 3600) * dtSeconds
  const rad = headingToRadians(aircraft.heading)
  aircraft.x += Math.cos(rad) * travelNM
  aircraft.y += Math.sin(rad) * travelNM
}

function moveApproach(aircraft: Aircraft, dtSeconds: number, runway: RunwayData | null, helipad: GateData | null = null): void {
  // If on vector, fly the vector
  if (aircraft.clearedHeading !== null && !aircraft.clearedForApproach) {
    aircraft.heading = turnToward(aircraft.heading, aircraft.clearedHeading, 3)
  } else if (aircraft.type.rotorcraft && helipad && aircraft.clearedForApproach) {
    // Rotorcraft (T-014): steer onto the assigned helipad, not a runway centerline
    aircraft.heading = turnToward(aircraft.heading,
      bearingBetween(aircraft.x, aircraft.y, helipad.x, helipad.y), 3)
  } else if (aircraft.clearedForApproach && runway) {
    // Steer toward extended centerline (PRD §7.4 Centerline Alignment)
    aircraft.heading = turnToward(aircraft.heading, centerlineHeading(aircraft, runway), 3)
  }

  // Speed
  const defaultAppSpeed = Math.min(aircraft.type.approachSpeed, 200)
  const targetSpeed = aircraft.clearedSpeed ?? defaultAppSpeed
  if (aircraft.speed < targetSpeed) {
    aircraft.speed = Math.min(aircraft.speed + 1, targetSpeed)
  } else if (aircraft.speed > targetSpeed) {
    aircraft.speed = Math.max(aircraft.speed - 2, targetSpeed)
  }

  // Altitude
  if (aircraft.type.rotorcraft && helipad && aircraft.clearedForApproach) {
    // Rotorcraft: descend straight toward the pad elevation — no glideslope.
    // The pad carries the elevation because a rotor has no assignedRunway to
    // read it from — without it they descended to 0 ft MSL, ~7,600 ft below
    // the HHAS field.
    const padElev = helipad.elevationFt ?? runway?.elevationFt ?? 0
    if (aircraft.altitude > padElev) {
      const descFt = aircraft.type.descentRate * (dtSeconds / 60)
      aircraft.altitude = Math.max(aircraft.altitude - descFt, padElev)
    }
  } else if (aircraft.clearedForApproach && runway) {
    const distToThresh = distanceNM(aircraft.x, aircraft.y, runway.thresholdX, runway.thresholdY)
    // 3 deg glideslope altitude
    const gsAlt = runway.elevationFt + (distToThresh * FT_PER_NM_GLIDESLOPE)
    
    if (aircraft.altitude > gsAlt) {
      // Descend to catch glideslope
      const descFt = aircraft.type.descentRate * (dtSeconds / 60)
      aircraft.altitude = Math.max(aircraft.altitude - descFt, gsAlt)
    } else if (aircraft.altitude < gsAlt && aircraft.clearedAltitude) {
       // Maintain cleared altitude until intercepting glideslope
       if (aircraft.altitude < aircraft.clearedAltitude) {
           const climbFt = aircraft.type.climbRate * (dtSeconds / 60)
           aircraft.altitude = Math.min(aircraft.altitude + climbFt, aircraft.clearedAltitude)
       } else if (aircraft.altitude > aircraft.clearedAltitude) {
           const descFt = aircraft.type.descentRate * (dtSeconds / 60)
           aircraft.altitude = Math.max(aircraft.altitude - descFt, aircraft.clearedAltitude)
       }
    }
  } else if (aircraft.clearedAltitude !== null) {
    // Normal altitude tracking
    if (aircraft.altitude < aircraft.clearedAltitude) {
      const climbFt = aircraft.type.climbRate * (dtSeconds / 60)
      aircraft.altitude = Math.min(aircraft.altitude + climbFt, aircraft.clearedAltitude)
    } else if (aircraft.altitude > aircraft.clearedAltitude) {
      const descFt = aircraft.type.descentRate * (dtSeconds / 60)
      aircraft.altitude = Math.max(aircraft.altitude - descFt, aircraft.clearedAltitude)
    }
  }

  // Position
  const travelNM = (aircraft.speed / 3600) * dtSeconds
  const rad = headingToRadians(aircraft.heading)
  aircraft.x += Math.cos(rad) * travelNM
  aircraft.y += Math.sin(rad) * travelNM
}

function moveFinal(aircraft: Aircraft, dtSeconds: number, runway: RunwayData | null, helipad: GateData | null = null): void {
  // Essentially the same as approach but with tighter descent tracking
  moveApproach(aircraft, dtSeconds, runway, helipad)
}

function moveLanding(aircraft: Aircraft, dtSeconds: number, runway: RunwayData | null, helipad: GateData | null = null): void {
  // Rotorcraft (T-014): flare onto the pad — track the pad bearing and slow
  // to a hover; phase-transitions completes ARRIVED once over the pad
  if (aircraft.type.rotorcraft && helipad) {
    aircraft.heading = turnToward(aircraft.heading,
      bearingBetween(aircraft.x, aircraft.y, helipad.x, helipad.y), 5)
    aircraft.speed = Math.max(aircraft.speed - 3, 0)
    const padElev = helipad.elevationFt ?? runway?.elevationFt ?? 0
    if (aircraft.altitude > padElev) {
      aircraft.altitude = Math.max(aircraft.altitude - 50, padElev)
    }
    const travelNM = (aircraft.speed / 3600) * dtSeconds
    const dist = distanceNM(aircraft.x, aircraft.y, helipad.x, helipad.y)
    if (dist <= 0.005 || travelNM >= dist) {
      // On the pad — stay planted (oscillating around the target would never
      // satisfy the ARRIVED proximity check)
      aircraft.x = helipad.x
      aircraft.y = helipad.y
    } else {
      const rad = headingToRadians(aircraft.heading)
      aircraft.x += Math.cos(rad) * travelNM
      aircraft.y += Math.sin(rad) * travelNM
    }
    return
  }

  if (runway) {
    // Track the centerline so a touchdown offset is flown out during the flare
    aircraft.heading = turnToward(aircraft.heading, centerlineHeading(aircraft, runway), 5)
  }
  
  // Decelerate
  aircraft.speed = Math.max(aircraft.speed - 3, 0)
  
  // Descend to 0 ft AGL
  const groundAlt = runway ? runway.elevationFt : 0
  if (aircraft.altitude > groundAlt) {
    aircraft.altitude = Math.max(aircraft.altitude - 50, groundAlt) // rough touchdown descent
  }
  
  const travelNM = (aircraft.speed / 3600) * dtSeconds
  const rad = headingToRadians(aircraft.heading)
  aircraft.x += Math.cos(rad) * travelNM
  aircraft.y += Math.sin(rad) * travelNM
}

function moveRollout(aircraft: Aircraft, dtSeconds: number, runway: RunwayData | null): void {
  if (runway) {
    // Steer back to the centerline rather than snapping to bare runway heading,
    // which would leave any lateral offset frozen as a parallel roll off the strip
    aircraft.heading = turnToward(aircraft.heading, centerlineHeading(aircraft, runway), 8)
  }
  
  // Decelerate
  aircraft.speed = Math.max(aircraft.speed - 3, 0)
  
  const travelNM = (aircraft.speed / 3600) * dtSeconds
  const rad = headingToRadians(aircraft.heading)
  aircraft.x += Math.cos(rad) * travelNM
  aircraft.y += Math.sin(rad) * travelNM
}

function moveMissed(aircraft: Aircraft, dtSeconds: number): void {
  const targetHeading = aircraft.missedHeading ?? aircraft.heading
  aircraft.heading = turnToward(aircraft.heading, targetHeading, 3)

  // Maintain current speed or accelerate slightly
  const targetSpeed = Math.max(aircraft.speed, aircraft.type.approachSpeed)
  if (aircraft.speed < targetSpeed) {
    aircraft.speed = Math.min(aircraft.speed + 2, targetSpeed)
  }

  // Climb to missed altitude
  const targetAlt = aircraft.missedAltitude ?? 5000
  if (aircraft.altitude < targetAlt) {
    const climbFt = aircraft.type.climbRate * (dtSeconds / 60)
    aircraft.altitude = Math.min(aircraft.altitude + climbFt, targetAlt)
  }

  const travelNM = (aircraft.speed / 3600) * dtSeconds
  const rad = headingToRadians(aircraft.heading)
  aircraft.x += Math.cos(rad) * travelNM
  aircraft.y += Math.sin(rad) * travelNM
}

// ─── Master Movement Function ────────────────────────────────────────────────

function movePushingBack(aircraft: Aircraft, dtSeconds: number): void {
  // ponytail: drifts aircraft backward on pushbackHeading; stops when phase-transitions flips to READY_TO_TAXI
  const heading = aircraft.pushbackHeading ?? ((aircraft.heading + 180) % 360)
  const speed = 0.0005 // NM per second (~1.8 kt tug speed → ~40 m over the 45 s pushback)
  const headingRad = (heading * Math.PI) / 180
  aircraft.x += Math.sin(headingRad) * speed * dtSeconds
  aircraft.y += Math.cos(headingRad) * speed * dtSeconds
}

export function moveAircraft(aircraft: Aircraft, dtSeconds: number, runway: RunwayData | null, helipad: GateData | null = null): void {
  // Record trail position periodically
  // We'll push current position before moving to create the trail
  // In a real app we might only push every X seconds, but for now we'll push every tick
  
  // Only push if position changed significantly
  if (aircraft.trail.length === 0 || distanceNM(
      aircraft.x, aircraft.y, 
      aircraft.trail[aircraft.trail.length - 1].x, aircraft.trail[aircraft.trail.length - 1].y
    ) > 0.1) {
    
    aircraft.trail.push({ x: aircraft.x, y: aircraft.y })
    if (aircraft.trail.length > MAX_TRAIL_LENGTH) {
      aircraft.trail.shift()
    }
  }

  switch (aircraft.phase) {
    case AircraftPhase.TAXI_OUT:
    case AircraftPhase.TAXI_IN:
      moveTaxi(aircraft, dtSeconds)
      break
    case AircraftPhase.LINE_UP:
      moveLineUp(aircraft, dtSeconds, runway)
      break
    case AircraftPhase.TAKEOFF_ROLL:
      moveTakeoffRoll(aircraft, dtSeconds, runway)
      break
    case AircraftPhase.CLIMBING:
    case AircraftPhase.DEPARTED:
      // DEPARTED keeps the climb-out profile going so the aircraft actually
      // flies out to the 25 NM removal boundary instead of freezing mid-air
      moveClimb(aircraft, dtSeconds)
      break
    case AircraftPhase.ENTERING:
    // INBOUND_UNCONTROLLED keeps flying inbound: the "with you" call only
    // fires within WITH_YOU_CALL_NM of the threshold, so a stationary phase
    // here would deadlock every arrival at the 12 NM handoff boundary.
    case AircraftPhase.INBOUND_UNCONTROLLED:
    case AircraftPhase.APPROACH:
      moveApproach(aircraft, dtSeconds, runway, helipad)
      break
    case AircraftPhase.FINAL:
      moveFinal(aircraft, dtSeconds, runway, helipad)
      break
    case AircraftPhase.LANDING:
      moveLanding(aircraft, dtSeconds, runway, helipad)
      break
    case AircraftPhase.ROLLOUT:
      moveRollout(aircraft, dtSeconds, runway)
      break
    case AircraftPhase.MISSED:
      moveMissed(aircraft, dtSeconds)
      break
    case AircraftPhase.PUSHING_BACK:
      movePushingBack(aircraft, dtSeconds)
      break
    case AircraftPhase.AT_GATE:
    case AircraftPhase.AWAITING_PUSHBACK:
    case AircraftPhase.READY_TO_TAXI:
    case AircraftPhase.VACATED:
    case AircraftPhase.HOLD_SHORT:
    case AircraftPhase.ARRIVED:
      break
  }
}
