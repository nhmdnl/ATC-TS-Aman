import { describe, it, expect } from 'vitest'
import { spawnDeparture, spawnArrival, isSpawnPointClear } from '../aircraft-factory'
import { AircraftPhase } from '../types'
import type { GateData, SpawnPointData } from '../types'

describe('aircraft-factory', () => {
  describe('spawnDeparture', () => {
    const gate: GateData = {
      id: 'G1',
      x: 1.5,
      y: 2.0,
      taxiwayId: 'TW-A',
    }
    const runwayId = '07'

    it('returns a valid Aircraft object', () => {
      const ac = spawnDeparture(gate, runwayId)
      expect(ac).toBeDefined()
      expect(typeof ac.id).toBe('string')
      expect(ac.id.length).toBeGreaterThan(0)
    })

    it('generates a callsign with airline prefix and flight number', () => {
      const ac = spawnDeparture(gate, runwayId)
      // Pattern: 3-letter prefix + 3-4 digit number
      expect(ac.callsign).toMatch(/^[A-Z]{3}\d{3,4}$/)
    })

    it('generates a 4-digit octal squawk code', () => {
      const ac = spawnDeparture(gate, runwayId)
      expect(ac.squawk).toMatch(/^[0-7]{4}$/)
    })

    it('sets position from gate coordinates', () => {
      const ac = spawnDeparture(gate, runwayId)
      expect(ac.x).toBe(1.5)
      expect(ac.y).toBe(2.0)
    })

    it('sets initial altitude to 0', () => {
      const ac = spawnDeparture(gate, runwayId)
      expect(ac.altitude).toBe(0)
    })

    it('sets initial speed to 0', () => {
      const ac = spawnDeparture(gate, runwayId)
      expect(ac.speed).toBe(0)
    })

    it('produces AT_GATE phase', () => {
      const ac = spawnDeparture(gate, runwayId)
      expect(ac.phase).toBe(AircraftPhase.AT_GATE)
    })

    it('is a departure flight type', () => {
      const ac = spawnDeparture(gate, runwayId)
      expect(ac.flightType).toBe('departure')
    })

    it('assigns the specified runway', () => {
      const ac = spawnDeparture(gate, runwayId)
      expect(ac.assignedRunway).toBe('07')
    })

    it('assigns the gate and taxiway from gate data', () => {
      const ac = spawnDeparture(gate, runwayId)
      expect(ac.assignedGate).toBe('G1')
      expect(ac.assignedTaxiway).toBe('TW-A')
    })

    it('creates an aircraft with a valid type from the catalog', () => {
      const ac = spawnDeparture(gate, runwayId)
      expect(ac.type.icao).toBeDefined()
      expect(ac.type.name).toBeDefined()
      expect(ac.type.cruiseSpeed).toBeGreaterThan(0)
      expect(ac.type.approachSpeed).toBeGreaterThan(0)
      expect(ac.type.climbRate).toBeGreaterThan(0)
    })

    it('assigns GROUND controller', () => {
      const ac = spawnDeparture(gate, runwayId)
      expect(ac.controller).toBe('GROUND')
    })

    it('initializes all clearance fields to null/false', () => {
      const ac = spawnDeparture(gate, runwayId)
      expect(ac.clearedHeading).toBeNull()
      expect(ac.clearedAltitude).toBeNull()
      expect(ac.clearedSpeed).toBeNull()
      expect(ac.clearedToLand).toBe(false)
      expect(ac.clearedForApproach).toBe(false)
    })

    it('initializes flags to false', () => {
      const ac = spawnDeparture(gate, runwayId)
      expect(ac.urgent).toBe(false)
      expect(ac.inViolation).toBe(false)
      expect(ac.isSelected).toBe(false)
      expect(ac.handedOff).toBe(false)
    })

    it('sets spawnTime to a positive number', () => {
      const ac = spawnDeparture(gate, runwayId)
      expect(ac.spawnTime).toBeGreaterThan(0)
    })
  })

  describe('spawnArrival', () => {
    const spawnPoint: SpawnPointData = {
      id: 'ENTRY-NE',
      type: 'arrival',
      x: 40,
      y: 20,
      heading: 220,
      altitude: 12000,
    }

    it('returns a valid Aircraft object', () => {
      const ac = spawnArrival(spawnPoint)
      expect(ac).toBeDefined()
      expect(typeof ac.id).toBe('string')
      expect(ac.id.length).toBeGreaterThan(0)
    })

    it('generates a callsign with airline prefix and flight number', () => {
      const ac = spawnArrival(spawnPoint)
      expect(ac.callsign).toMatch(/^[A-Z]{3}\d{3,4}$/)
    })

    it('generates a 4-digit octal squawk code', () => {
      const ac = spawnArrival(spawnPoint)
      expect(ac.squawk).toMatch(/^[0-7]{4}$/)
    })

    it('sets position from spawn point', () => {
      const ac = spawnArrival(spawnPoint)
      expect(ac.x).toBe(40)
      expect(ac.y).toBe(20)
    })

    it('sets altitude from spawn point', () => {
      const ac = spawnArrival(spawnPoint)
      expect(ac.altitude).toBe(12000)
    })

    it('sets heading from spawn point', () => {
      const ac = spawnArrival(spawnPoint)
      expect(ac.heading).toBe(220)
    })

    it('produces ENTERING phase', () => {
      const ac = spawnArrival(spawnPoint)
      expect(ac.phase).toBe(AircraftPhase.ENTERING)
    })

    it('is an arrival flight type', () => {
      const ac = spawnArrival(spawnPoint)
      expect(ac.flightType).toBe('arrival')
    })

    it('initializes speed to reasonable approach speed (70% cruise, capped at 250)', () => {
      const ac = spawnArrival(spawnPoint)
      expect(ac.speed).toBeGreaterThan(0)
      expect(ac.speed).toBeLessThanOrEqual(250)
    })

    it('assigns null runway (approach controller assigns later)', () => {
      const ac = spawnArrival(spawnPoint)
      expect(ac.assignedRunway).toBeNull()
    })

    it('assigns null gate/ taxiway (arrivals not yet gated)', () => {
      const ac = spawnArrival(spawnPoint)
      expect(ac.assignedGate).toBeNull()
      expect(ac.assignedTaxiway).toBeNull()
    })

    it('assigns APPROACH controller', () => {
      const ac = spawnArrival(spawnPoint)
      expect(ac.controller).toBe('APPROACH')
    })

    it('sets spawnTime to a positive number', () => {
      const ac = spawnArrival(spawnPoint)
      expect(ac.spawnTime).toBeGreaterThan(0)
    })

    it('initializes trail as empty array', () => {
      const ac = spawnArrival(spawnPoint)
      expect(ac.trail).toEqual([])
    })
  })

  describe('both spawn functions—common contracts', () => {
    const gate: GateData = { id: 'G1', x: 1, y: 2, taxiwayId: 'TW-A' }
    const sp: SpawnPointData = { id: 'ENTRY', type: 'arrival', x: 40, y: 20, heading: 220, altitude: 12000 }

    it('produce unique IDs each call', () => {
      const dep1 = spawnDeparture(gate, '07')
      const dep2 = spawnDeparture(gate, '07')
      expect(dep1.id).not.toBe(dep2.id)
    })

    it('produce unique squawks each call', () => {
      const a1 = spawnDeparture(gate, '07')
      const a2 = spawnDeparture(gate, '07')
      // Very unlikely to collide; 4-digit octal = 4096 possibilities
      expect(a1.squawk).not.toBe(a2.squawk)
    })

    it('produce valid AircraftType on both paths', () => {
      const dep = spawnDeparture(gate, '07')
      const arr = spawnArrival(sp)
      const icaoPattern = /^[A-Z0-9]{2,4}$/
      expect(dep.type.icao).toMatch(icaoPattern)
      expect(arr.type.icao).toMatch(icaoPattern)
    })
  })

  describe('isSpawnPointClear', () => {
    const point: SpawnPointData = {
      id: 'ENTRY-NE',
      type: 'arrival',
      x: 40,
      y: 20,
      heading: 220,
      altitude: 12000,
    }

    function trafficAt(x: number, y: number, altitude: number) {
      const ac = spawnArrival(point)
      ac.x = x
      ac.y = y
      ac.altitude = altitude
      return ac
    }

    it('is clear with no traffic', () => {
      expect(isSpawnPointClear(point, [])).toBe(true)
    })

    it('is blocked by traffic at the point (would spawn in violation)', () => {
      expect(isSpawnPointClear(point, [trafficAt(40.5, 20, 12000)])).toBe(false)
    })

    it('is blocked inside 2x lateral minima at same altitude', () => {
      expect(isSpawnPointClear(point, [trafficAt(45, 20, 11800)])).toBe(false)
    })

    it('is clear when traffic is laterally far', () => {
      expect(isSpawnPointClear(point, [trafficAt(50, 20, 12000)])).toBe(true)
    })

    it('is clear when traffic is vertically separated', () => {
      expect(isSpawnPointClear(point, [trafficAt(40, 20, 10500)])).toBe(true)
    })
  })
})
