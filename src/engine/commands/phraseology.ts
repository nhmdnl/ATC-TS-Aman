import type { Command, Aircraft, Airport } from '../types'
import { gameState } from '../game-state'
import { CommandType } from '../types'

export interface PhraseologyResult {
  atc: string
  pilot: string
  station: string
}

function formatHeading(heading: number): string {
  return heading.toString().padStart(3, '0').split('').map(digitToWord).join(' ')
}

function digitToWord(digit: string): string {
  const map: Record<string, string> = {
    '0': 'ZERO', '1': 'ONE', '2': 'TWO', '3': 'THREE', '4': 'FOUR',
    '5': 'FIVE', '6': 'SIX', '7': 'SEVEN', '8': 'EIGHT', '9': 'NINE',
  }
  return map[digit] || digit
}

function formatAltitude(altitude: number): string {
  if (altitude < 18000) {
    if (altitude % 1000 === 0) return `${Math.floor(altitude / 1000)} THOUSAND`
    if (altitude % 100 === 0) return `${Math.floor(altitude / 1000)} THOUSAND ${Math.floor((altitude % 1000) / 100)} HUNDRED`
    return altitude.toString()
  }
  const fl = Math.floor(altitude / 100)
  return `FLIGHT LEVEL ${fl.toString().split('').map(digitToWord).join(' ')}`
}

function formatFrequency(freq: number): string {
  return freq.toFixed(1).replace('.', ' DECIMAL ')
}

function getFrequencyStr(airport: Airport, stationName: string): string {
  const f = airport.frequencies.find(f =>
    f.name.toUpperCase().includes(stationName.toUpperCase()) ||
    f.callsign.toUpperCase().includes(stationName.toUpperCase()))
  return f ? formatFrequency(f.frequency) : ''
}

export function generatePhraseology(command: Command, aircraft: Aircraft, airport: Airport, stationName: string): PhraseologyResult {
  const cs = aircraft.callsign
  const rwy = command.params.runway || aircraft.assignedRunway || 'active'
  const wind = (() => {
    // We don't have wind here directly; it lives in gameState — keep phraseology pure
    // Wind will be injected by the caller when available; for now use a placeholder
    return ''
  })()
  let atc = ''
  let pilot = ''

  switch (command.type) {
    case CommandType.PUSHBACK_APPROVED:
      atc = `${cs}, pushback approved, expect runway ${rwy}`
      pilot = `Pushback approved, expecting runway ${rwy}, ${cs}`
      break

    case CommandType.STARTUP_APPROVED:
      atc = `${cs}, startup approved, expect runway ${rwy}`
      pilot = `Startup approved, ${cs}`
      break

    case CommandType.STANDBY:
      atc = `${cs}, standby`
      pilot = `Standby, ${cs}`
      break

    case CommandType.TAXI:
      atc = `${cs}, taxi to runway ${rwy}`
      pilot = `Taxi to runway ${rwy}, ${cs}`
      break

    case CommandType.HOLD_SHORT:
      atc = `${cs}, hold short runway ${rwy}`
      pilot = `Hold short runway ${rwy}, ${cs}`
      break

    case CommandType.CROSS_RUNWAY:
      atc = `${cs}, cross runway ${aircraft.awaitingCrossingRunway ?? rwy}`
      pilot = `Crossing runway ${aircraft.awaitingCrossingRunway ?? rwy}, ${cs}`
      break

    case CommandType.CONTINUE_TAXI:
      atc = `${cs}, continue taxi`
      pilot = `Continue taxi, ${cs}`
      break

    case CommandType.LINE_UP_WAIT:
      atc = `${cs}, runway ${rwy}, line up and wait`
      pilot = `Line up and wait runway ${rwy}, ${cs}`
      break

    case CommandType.CLEARED_TAKEOFF: {
      atc = `${cs}, runway ${rwy}, cleared for takeoff`
      pilot = `Cleared for takeoff runway ${rwy}, ${cs}`
      break
    }

    case CommandType.CLEARED_LAND:
      atc = `${cs}, runway ${aircraft.assignedRunway || 'ahead'}, cleared to land`
      pilot = `Cleared to land runway ${aircraft.assignedRunway || 'ahead'}, ${cs}`
      break

    case CommandType.CLEARED_APPROACH: {
      const ilsRwy = airport.runways.find(r => r.id === aircraft.assignedRunway && r.ils?.available)
      const approachType = ilsRwy ? 'ILS' : 'visual'
      atc = `${cs}, cleared ${approachType} approach runway ${aircraft.assignedRunway || 'ahead'}`
      pilot = `Cleared ${approachType} approach runway ${aircraft.assignedRunway || 'ahead'}, ${cs}`
      break
    }

    case CommandType.VECTOR: {
      const hdg = formatHeading(command.params.heading || 0)
      atc = `${cs}, fly heading ${hdg}`
      pilot = `Heading ${hdg}, ${cs}`
      break
    }

    case CommandType.ALTITUDE: {
      const alt = formatAltitude(command.params.altitude || 0)
      atc = `${cs}, climb and maintain ${alt}`
      pilot = `Climb and maintain ${alt}, ${cs}`
      break
    }

    case CommandType.SPEED:
      atc = `${cs}, maintain ${command.params.speed} knots`
      pilot = `Maintain ${command.params.speed} knots, ${cs}`
      break

    case CommandType.SQUAWK: {
      const sq = (command.params.squawk || '').split('').map(digitToWord).join(' ')
      atc = `${cs}, squawk ${sq}`
      pilot = `Squawk ${sq}, ${cs}`
      break
    }

    case CommandType.CONTACT_DEPARTURE: {
      const freq = getFrequencyStr(airport, 'DEPARTURE') || getFrequencyStr(airport, 'APPROACH')
      atc = `${cs}, contact departure${freq ? ` ${freq}` : ''}`
      pilot = `Contact departure, ${cs}`
      break
    }

    case CommandType.CONTACT_TOWER: {
      const freq = getFrequencyStr(airport, 'TOWER')
      atc = `${cs}, contact tower${freq ? ` ${freq}` : ''}`
      pilot = `Contact tower, ${cs}`
      break
    }

    case CommandType.CONTACT_GROUND: {
      const freq = getFrequencyStr(airport, 'GROUND')
      atc = `${cs}, contact ground${freq ? ` ${freq}` : ''}`
      pilot = `Contact ground, ${cs}`
      break
    }

    case CommandType.GO_AROUND:
      atc = `${cs}, go around, I say again, go around`
      pilot = `Going around, ${cs}`
      break

    case CommandType.EXIT_RUNWAY:
      atc = `${cs}, exit runway when able`
      pilot = `Exit runway when able, ${cs}`
      break

    case CommandType.CANCEL_TAXI:
      atc = `${cs}, hold position`
      pilot = `Holding position, ${cs}`
      break

    case CommandType.WIND: {
      const wind = gameState.wind
      const windDir = wind.direction.toString().padStart(3, '0').split('').map(digitToWord).join(' ')
      const windSpd = wind.speed.toString().split('').map(digitToWord).join(' ')
      atc = `${cs}, wind ${windDir} at ${windSpd}`
      pilot = `Wind ${windDir} at ${windSpd}, ${cs}`
      break
    }
  }

  return { atc, pilot, station: stationName }
}
