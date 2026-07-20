import type { Command, Aircraft } from '../types'
import { CommandType } from '../types'

/**
 * Parses a raw text input into a Command object if possible.
 */
export function parseCommand(text: string, aircraftList: Aircraft[]): Command | null {
  const parts = text.trim().toUpperCase().split(/\s+/)
  if (parts.length < 2) return null

  const callsign = parts[0]
  const targetAircraft = aircraftList.find(a => a.callsign.toUpperCase() === callsign)
  
  if (!targetAircraft) return null

  // Command verbs
  const verb = parts[1]
  const args = parts.slice(2)

  let type: CommandType | null = null
  let params: any = {}

  switch (verb) {
    case 'C':
    case 'CLIMB':
    case 'D':
    case 'DESCEND':
    case 'A':
    case 'ALTITUDE':
    case 'MAINTAIN':
      type = CommandType.ALTITUDE
      if (args.length > 0) {
        params.altitude = parseInt(args[0], 10) * 100 // usually input as FL or hundreds (e.g. "050" = 5000, "120" = 12000)
        // If input is > 1000 assume they typed the full feet
        if (parseInt(args[0], 10) >= 1000) {
          params.altitude = parseInt(args[0], 10)
        }
      }
      break

    case 'H':
    case 'HDG':
    case 'HEADING':
    case 'V':
    case 'VECTOR':
    case 'TURN':
      type = CommandType.VECTOR
      if (args.length > 0) {
        // e.g. "TURN L 270" or "HEADING 270"
        const numStr = args.find(a => !isNaN(parseInt(a, 10)))
        if (numStr) {
          params.heading = parseInt(numStr, 10)
        }
      }
      break

    case 'S':
    case 'SPD':
    case 'SPEED':
      type = CommandType.SPEED
      if (args.length > 0) {
        params.speed = parseInt(args[0], 10)
      }
      break

    case 'SQ':
    case 'SQUAWK':
      type = CommandType.SQUAWK
      if (args.length > 0) {
        params.squawk = args[0]
      }
      break

    case 'T':
    case 'TAXI':
      type = CommandType.TAXI
      // check if runway is provided
      const rwyIdx = args.findIndex(a => a === 'RWY' || a === 'RUNWAY')
      if (rwyIdx !== -1 && rwyIdx + 1 < args.length) {
        params.runway = args[rwyIdx + 1]
      }
      break

    case 'CT':
    case 'CLEARED_TAKEOFF':
    case 'TAKEOFF':
      type = CommandType.CLEARED_TAKEOFF
      break

    case 'CL':
    case 'CLEARED_LAND':
    case 'LAND':
      type = CommandType.CLEARED_LAND
      break

    case 'CA':
    case 'CLEARED_APPROACH':
    case 'APPROACH':
      type = CommandType.CLEARED_APPROACH
      break

    case 'LUW':
    case 'LINE_UP_WAIT':
    case 'LINEUP':
      type = CommandType.LINE_UP_WAIT
      break

    case 'HS':
    case 'HOLD_SHORT':
    case 'HOLD':
      type = CommandType.HOLD_SHORT
      break

    case 'GA':
    case 'GO_AROUND':
      type = CommandType.GO_AROUND
      break

    case 'CONTACT':
      if (args.includes('DEP') || args.includes('DEPARTURE')) type = CommandType.CONTACT_DEPARTURE
      else if (args.includes('TWR') || args.includes('TOWER')) type = CommandType.CONTACT_TOWER
      else if (args.includes('GND') || args.includes('GROUND')) type = CommandType.CONTACT_GROUND
      break

    case 'PB':
    case 'PUSHBACK':
      type = CommandType.PUSHBACK_APPROVED
      if (args.length > 0) params.pushbackHeading = parseInt(args[0], 10)
      break

    case 'SU':
    case 'STARTUP':
      type = CommandType.STARTUP_APPROVED
      break

    case 'SBY':
    case 'STANDBY':
      type = CommandType.STANDBY
      break

    case 'CROSS':
      type = CommandType.CROSS_RUNWAY
      break

    case 'CONT':
    case 'CONTINUE':
      type = CommandType.CONTINUE_TAXI
      break

    case 'ER':
    case 'EXIT':
      type = CommandType.EXIT_RUNWAY
      break

    case 'CANCEL':
    case 'CNCL':
      type = CommandType.CANCEL_TAXI
      break

    case 'WIND':
    case 'W':
      type = CommandType.WIND
      break

    case 'REPORT':
    case 'RPT':
      type = CommandType.REPORT
      if (args.length > 0) {
        params.reportType = args[0].toLowerCase() // heading|position|airspeed
      }
      break
  }

  if (type) {
    return {
      type,
      targetCallsign: targetAircraft.callsign,
      params
    }
  }

  return null
}
