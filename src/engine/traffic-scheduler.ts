import type { Airport, Wind } from './types'
import { AIRCRAFT_TYPES } from './constants'
import { spawnArrival, spawnDeparture, isSpawnPointClear } from './aircraft-factory'
import { getArrivalSpawnPoints, getAvailableGates, selectActiveRunway, filterSuitableAircraftTypes } from './airport-loader'
import type { GameState } from './game-state'
import { GameEventType } from './types'
import { eventBus } from './event-bus'

export interface ScheduledFlight {
  callsign: string
  flightType: 'arrival' | 'departure'
  aircraftIcao: string
  offsetMs: number
  gate?: string
}

export class TrafficScheduler {
  private spawned: Set<string> = new Set()

  reset(): void {
    this.spawned.clear()
  }

  tick(state: GameState, schedule: ScheduledFlight[]): void {
    if (!state.airport) return

    for (const flight of schedule) {
      if (this.spawned.has(flight.callsign)) continue
      if (state.elapsedMs < flight.offsetMs) continue

      const spawned = flight.flightType === 'arrival'
        ? this.trySpawnArrival(flight, state)
        : this.trySpawnDeparture(flight, state)

      if (spawned) this.spawned.add(flight.callsign)
    }
  }

  private trySpawnArrival(flight: ScheduledFlight, state: GameState): boolean {
    const airport = state.airport!
    const traffic = state.allAircraft()
    const points = getArrivalSpawnPoints(airport).filter(p => isSpawnPointClear(p, traffic))
    if (points.length === 0) return false

    const point = points[Math.floor(Math.random() * points.length)]
    const suitableTypes = filterSuitableAircraftTypes(airport)
    let type = suitableTypes.find(t => t.icao === flight.aircraftIcao)
    if (!type) {
      type = suitableTypes[Math.floor(Math.random() * suitableTypes.length)]
    }
    const ac = spawnArrival(point, flight.callsign, type, airport)
    ac.assignedRunway = selectActiveRunway(airport, state.wind)?.id ?? null
    state.addAircraft(ac)
    eventBus.emit(GameEventType.AIRCRAFT_SPAWNED, { callsign: ac.callsign, flightType: 'arrival' })
    return true
  }

  private trySpawnDeparture(flight: ScheduledFlight, state: GameState): boolean {
    const airport = state.airport!
    const available = getAvailableGates(airport, state.occupiedGateIds)

    let gate = flight.gate ? available.find(g => g.id === flight.gate) : undefined
    if (!gate) gate = available[Math.floor(Math.random() * available.length)]
    if (!gate) return false

    const runway = selectActiveRunway(airport, state.wind)?.id ?? ''
    const suitableTypes = filterSuitableAircraftTypes(airport)
    let type = suitableTypes.find(t => t.icao === flight.aircraftIcao)
    if (!type) {
      type = suitableTypes[Math.floor(Math.random() * suitableTypes.length)]
    }
    const ac = spawnDeparture(gate, runway, flight.callsign, type, airport)
    state.addAircraft(ac)
    eventBus.emit(GameEventType.AIRCRAFT_SPAWNED, { callsign: ac.callsign, flightType: 'departure' })
    return true
  }
}

export const trafficScheduler = new TrafficScheduler()
