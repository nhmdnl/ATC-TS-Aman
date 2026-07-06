import type { Command, Aircraft, Airport } from '../types'
import { CommandType } from '../types'

export interface PhraseologyResult {
  atc: string
  pilot: string
  station: string
}

function formatHeading(heading: number): string {
  const s = heading.toString().padStart(3, '0')
  return s.split('').map(digitToWord).join(' ')
}

function digitToWord(digit: string): string {
  const map: Record<string, string> = {
    '0': 'ZERO', '1': 'ONE', '2': 'TWO', '3': 'THREE', '4': 'FOUR',
    '5': 'FIVE', '6': 'SIX', '7': 'SEVEN', '8': 'EIGHT', '9': 'NINE'
  }
  return map[digit] || digit
}

function formatAltitude(altitude: number): string {
  if (altitude < 18000) {
    if (altitude % 1000 === 0) return `${Math.floor(altitude / 1000)} THOUSAND`
    if (altitude % 100 === 0) return `${Math.floor(altitude / 1000)} THOUSAND ${Math.floor((altitude % 1000) / 100)} HUNDRED`
    return altitude.toString()
  } else {
    const fl = Math.floor(altitude / 100)
    return `FLIGHT LEVEL ${fl.toString().split('').map(digitToWord).join(' ')}`
  }
}

export function generatePhraseology(command: Command, aircraft: Aircraft, airport: Airport, stationName: string): PhraseologyResult {
  const callsign = aircraft.callsign
  let atc = ''
  let pilot = ''

  switch (command.type) {
    case CommandType.TAXI:
      atc = `${callsign}, taxi to runway ${command.params.runway || aircraft.assignedRunway}`
      pilot = `Taxi to runway ${command.params.runway || aircraft.assignedRunway}, ${callsign}`
      break
    case CommandType.HOLD_SHORT:
      atc = `${callsign}, hold short runway ${command.params.runway || aircraft.assignedRunway}`
      pilot = `Hold short runway ${command.params.runway || aircraft.assignedRunway}, ${callsign}`
      break
    case CommandType.LINE_UP_WAIT:
      atc = `${callsign}, runway ${command.params.runway || aircraft.assignedRunway}, line up and wait`
      pilot = `Line up and wait runway ${command.params.runway || aircraft.assignedRunway}, ${callsign}`
      break
    case CommandType.CLEARED_TAKEOFF:
      atc = `${callsign}, runway ${command.params.runway || aircraft.assignedRunway}, cleared for takeoff`
      pilot = `Cleared for takeoff runway ${command.params.runway || aircraft.assignedRunway}, ${callsign}`
      break
    case CommandType.CLEARED_LAND:
      atc = `${callsign}, runway ${aircraft.assignedRunway || 'ahead'}, cleared to land`
      pilot = `Cleared to land runway ${aircraft.assignedRunway || 'ahead'}, ${callsign}`
      break
    case CommandType.CLEARED_APPROACH:
      atc = `${callsign}, cleared approach runway ${aircraft.assignedRunway || 'ahead'}`
      pilot = `Cleared approach runway ${aircraft.assignedRunway || 'ahead'}, ${callsign}`
      break
    case CommandType.VECTOR:
      const hdg = formatHeading(command.params.heading || 0)
      atc = `${callsign}, fly heading ${hdg}`
      pilot = `Heading ${hdg}, ${callsign}`
      break
    case CommandType.ALTITUDE:
      const alt = formatAltitude(command.params.altitude || 0)
      atc = `${callsign}, maintain ${alt}`
      pilot = `Maintain ${alt}, ${callsign}`
      break
    case CommandType.SPEED:
      atc = `${callsign}, maintain ${command.params.speed} knots`
      pilot = `Maintain ${command.params.speed} knots, ${callsign}`
      break
    case CommandType.SQUAWK:
      const sq = (command.params.squawk || '').split('').map(digitToWord).join(' ')
      atc = `${callsign}, squawk ${sq}`
      pilot = `Squawk ${sq}, ${callsign}`
      break
    case CommandType.CONTACT_DEPARTURE:
      atc = `${callsign}, contact departure`
      pilot = `Contact departure, ${callsign}`
      break
    case CommandType.CONTACT_TOWER:
      atc = `${callsign}, contact tower`
      pilot = `Contact tower, ${callsign}`
      break
    case CommandType.CONTACT_GROUND:
      atc = `${callsign}, contact ground`
      pilot = `Contact ground, ${callsign}`
      break
    case CommandType.GO_AROUND:
      atc = `${callsign}, go around, I say again, go around`
      pilot = `Going around, ${callsign}`
      break
    case CommandType.EXIT_RUNWAY:
      atc = `${callsign}, exit runway when able`
      pilot = `Exit runway when able, ${callsign}`
      break
    case CommandType.CANCEL_TAXI:
      atc = `${callsign}, hold position`
      pilot = `Holding position, ${callsign}`
      break
  }

  return { atc, pilot, station: stationName }
}
