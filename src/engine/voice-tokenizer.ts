import { CommandType, AircraftPhase, PilotCallType } from './types'
import type { Command, Aircraft, Airport } from './types'
import { gameState } from './game-state'
import { distanceNM } from './movement'
import { DEPARTURE_HANDOFF_ALT_FT } from './constants'

const AIRLINE_MAP: Record<string, string> = {
  ERE: 'ere', ETH: 'eth', UAE: 'uae', MSR: 'msr',
  KQA: 'kqa', FDB: 'fdb', THY: 'thy', SDV: 'sdv',
}

const DIGIT_IDS = ['d_0','d_1','d_2','d_3','d_4','d_5','d_6','d_7','d_8','d_9']

function tok(role: 'atc' | 'pil', id: string): string {
  return `${role}_${id}`
}

function digitToks(role: 'atc' | 'pil', str: string): string[] {
  return str.split('').filter(c => /\d/.test(c)).map(c => tok(role, DIGIT_IDS[+c]))
}

function callsignToks(role: 'atc' | 'pil', callsign: string): string[] {
  const m = callsign.match(/^([A-Z]{2,3})(\d+)$/)
  if (!m) return digitToks(role, callsign.replace(/\D/g, ''))
  const [, prefix, digits] = m
  const airline = AIRLINE_MAP[prefix]
  const tokens: string[] = []
  if (airline) tokens.push(tok(role, `airline_${airline}`))
  tokens.push(...digitToks(role, digits))
  return tokens
}

function altToks(role: 'atc' | 'pil', ft: number): string[] {
  if (ft >= 18000) {
    return [tok(role, 'w_flight_level'), ...digitToks(role, Math.floor(ft / 100).toString())]
  }
  const thousands = Math.floor(ft / 1000)
  const hundreds = Math.floor((ft % 1000) / 100)
  const tokens: string[] = []
  if (thousands >= 10) {
    tokens.push(...digitToks(role, thousands.toString()))
  } else if (thousands > 0) {
    tokens.push(tok(role, DIGIT_IDS[thousands]))
  }
  tokens.push(tok(role, 'w_thousand'))
  if (hundreds > 0) {
    tokens.push(tok(role, DIGIT_IDS[hundreds]), tok(role, 'w_hundred'))
  }
  return tokens
}

function headingToks(role: 'atc' | 'pil', heading: number): string[] {
  return digitToks(role, heading.toString().padStart(3, '0'))
}

function rwyToks(role: 'atc' | 'pil', rwyId: string): string[] {
  return digitToks(role, rwyId.replace(/\D/g, ''))
}

function windToks(role: 'atc' | 'pil'): string[] {
  const w = gameState.wind
  return [
    tok(role, 'p_wind'),
    ...digitToks(role, w.direction.toString().padStart(3, '0')),
    tok(role, 'w_at'),
    ...digitToks(role, w.speed.toString()),
    tok(role, 'w_knots'),
  ]
}

export function tokenizeCommand(
  command: Command,
  aircraft: Aircraft,
  airport: Airport | null,
): { atcTokens: string[]; pilotTokens: string[] } {
  const rwy = command.params.runway ?? aircraft.assignedRunway ?? ''
  const atcCs = callsignToks('atc', aircraft.callsign)
  const pilCs = callsignToks('pil', aircraft.callsign)

  let atcTokens: string[] = []
  let pilotTokens: string[] = []

  switch (command.type) {
    case CommandType.PUSHBACK_APPROVED:
      atcTokens  = [...atcCs, tok('atc', 'p_pushback_approved'), ...rwyToks('atc', rwy)]
      pilotTokens = [tok('pil', 'p_pushback_approved_expecting_runway'), ...rwyToks('pil', rwy), ...pilCs]
      break

    case CommandType.STARTUP_APPROVED:
      atcTokens  = [...atcCs, tok('atc', 'p_startup_approved')]
      pilotTokens = [tok('pil', 'p_startup_approved'), ...pilCs]
      break

    case CommandType.STANDBY:
      atcTokens  = [...atcCs, tok('atc', 'p_standby')]
      pilotTokens = [tok('pil', 'p_standby'), ...pilCs]
      break

    case CommandType.TAXI:
      atcTokens  = [...atcCs, tok('atc', 'p_taxi_to_runway'), ...rwyToks('atc', rwy)]
      pilotTokens = [tok('pil', 'p_taxi_to_runway'), ...rwyToks('pil', rwy), ...pilCs]
      break

    case CommandType.HOLD_SHORT:
      atcTokens  = [...atcCs, tok('atc', 'p_hold_short_runway'), ...rwyToks('atc', rwy)]
      pilotTokens = [tok('pil', 'p_hold_short_runway'), ...rwyToks('pil', rwy), ...pilCs]
      break

    case CommandType.CROSS_RUNWAY: {
      const crossing = aircraft.awaitingCrossingRunway ?? rwy
      atcTokens  = [...atcCs, tok('atc', 'p_cross_runway'), ...rwyToks('atc', crossing)]
      pilotTokens = [tok('pil', 'p_crossing_runway'), ...rwyToks('pil', crossing), ...pilCs]
      break
    }

    case CommandType.CONTINUE_TAXI:
      atcTokens  = [...atcCs, tok('atc', 'p_continue_taxi')]
      pilotTokens = [tok('pil', 'p_continue_taxi'), ...pilCs]
      break

    case CommandType.LINE_UP_WAIT: {
      atcTokens = [...atcCs, tok('atc', 'w_runway'), ...rwyToks('atc', rwy), tok('atc', 'p_line_up_and_wait')]
      const luawRunway = airport?.runways.find(r => r.id === rwy) ?? null
      const traffic = [...gameState.aircraft.values()].find(
        ac => ac.id !== aircraft.id && ac.phase === AircraftPhase.FINAL && ac.assignedRunway === rwy
      )
      if (traffic && luawRunway) {
        const dist = Math.round(distanceNM(traffic.x, traffic.y, luawRunway.thresholdX, luawRunway.thresholdY))
        atcTokens = [
          ...atcTokens,
          tok('atc', 'p_traffic_on_final'),
          ...callsignToks('atc', traffic.callsign),
          ...digitToks('atc', dist.toString()),
          tok('atc', 'w_miles'),
        ]
      }
      pilotTokens = [tok('pil', 'p_line_up_and_wait_runway'), ...rwyToks('pil', rwy), ...pilCs]
      break
    }

    case CommandType.CLEARED_TAKEOFF:
      atcTokens = [
        ...atcCs,
        tok('atc', 'w_runway'), ...rwyToks('atc', rwy),
        tok('atc', 'p_cleared_for_takeoff'),
        ...windToks('atc'),
        tok('atc', 'p_passing'), ...altToks('atc', DEPARTURE_HANDOFF_ALT_FT),
        tok('atc', 'p_contact_departure'),
      ]
      pilotTokens = [tok('pil', 'p_cleared_for_takeoff_runway'), ...rwyToks('pil', rwy), ...pilCs]
      break

    case CommandType.CLEARED_LAND:
      atcTokens  = [...atcCs, tok('atc', 'w_runway'), ...rwyToks('atc', rwy), tok('atc', 'p_cleared_to_land')]
      pilotTokens = [tok('pil', 'p_cleared_to_land_runway'), ...rwyToks('pil', rwy), ...pilCs]
      break

    case CommandType.CLEARED_APPROACH: {
      const appRwy = aircraft.assignedRunway ?? rwy
      const ilsAvail = !!airport?.runways.find(r => r.id === appRwy && r.ils?.available)
      const useIls = ilsAvail && (gameState.getConditions() === 'IMC' || Math.random() > 0.3)
      const aType = useIls ? 'ils' : 'visual'
      atcTokens  = [...atcCs, tok('atc', `p_cleared_${aType}_approach`), ...rwyToks('atc', appRwy)]
      pilotTokens = [tok('pil', `p_cleared_${aType}_approach_runway`), ...rwyToks('pil', appRwy), ...pilCs]
      break
    }

    case CommandType.VECTOR: {
      const hdg = command.params.heading ?? 0
      atcTokens  = [...atcCs, tok('atc', 'p_fly_heading'), ...headingToks('atc', hdg)]
      pilotTokens = [tok('pil', 'p_heading'), ...headingToks('pil', hdg), ...pilCs]
      break
    }

    case CommandType.ALTITUDE: {
      const alt = command.params.altitude ?? 0
      atcTokens  = [...atcCs, tok('atc', 'p_climb_and_maintain'), ...altToks('atc', alt)]
      pilotTokens = [tok('pil', 'p_climb_and_maintain'), ...altToks('pil', alt), ...pilCs]
      break
    }

    case CommandType.SPEED: {
      const spd = (command.params.speed ?? 0).toString()
      atcTokens  = [...atcCs, tok('atc', 'p_maintain'), ...digitToks('atc', spd), tok('atc', 'w_knots')]
      pilotTokens = [tok('pil', 'p_maintain'), ...digitToks('pil', spd), tok('pil', 'w_knots'), ...pilCs]
      break
    }

    case CommandType.SQUAWK: {
      const sq = (command.params.squawk ?? '').replace(/\D/g, '')
      atcTokens  = [...atcCs, tok('atc', 'p_squawk'), ...digitToks('atc', sq)]
      pilotTokens = [tok('pil', 'p_squawk'), ...digitToks('pil', sq), ...pilCs]
      break
    }

    case CommandType.CONTACT_DEPARTURE:
      atcTokens  = [...atcCs, tok('atc', 'p_contact_departure')]
      pilotTokens = [tok('pil', 'p_contact_departure'), ...pilCs]
      break

    case CommandType.CONTACT_TOWER:
      atcTokens  = [...atcCs, tok('atc', 'p_contact_tower')]
      pilotTokens = [tok('pil', 'p_contact_tower'), ...pilCs]
      break

    case CommandType.CONTACT_GROUND:
      atcTokens  = [...atcCs, tok('atc', 'p_contact_ground')]
      pilotTokens = [tok('pil', 'p_contact_ground'), ...pilCs]
      break

    case CommandType.GO_AROUND:
      atcTokens  = [...atcCs, tok('atc', 'p_go_around')]
      pilotTokens = [tok('pil', 'p_going_around'), ...pilCs]
      break

    case CommandType.EXIT_RUNWAY:
      atcTokens  = [...atcCs, tok('atc', 'p_exit_runway_when_able')]
      pilotTokens = [tok('pil', 'p_exit_runway_when_able'), ...pilCs]
      break

    case CommandType.CANCEL_TAXI:
      atcTokens  = [...atcCs, tok('atc', 'p_hold_position')]
      pilotTokens = [tok('pil', 'p_holding_position'), ...pilCs]
      break

    case CommandType.REPORT: {
      const reportType = (command.params as Record<string, unknown>).reportType as string ?? 'heading'
      atcTokens = [...atcCs, tok('atc', `p_report_${reportType}`)]
      if (reportType === 'heading') {
        pilotTokens = [tok('pil', 'p_heading'), ...headingToks('pil', aircraft.heading), ...pilCs]
      } else if (reportType === 'airspeed') {
        pilotTokens = [tok('pil', 'p_airspeed'), ...digitToks('pil', Math.round(aircraft.speed).toString()), tok('pil', 'w_knots'), ...pilCs]
      } else {
        const dist = Math.round(distanceNM(aircraft.x, aircraft.y, 0, 0))
        pilotTokens = [...pilCs, tok('pil', 'p_is'), ...digitToks('pil', dist.toString()), tok('pil', 'p_miles_from_the_field')]
      }
      break
    }

    case CommandType.WIND:
      atcTokens  = [...atcCs, ...windToks('atc')]
      pilotTokens = [...windToks('pil'), ...pilCs]
      break

    default:
      break
  }

  return { atcTokens, pilotTokens }
}

export function tokenizePilotCall(
  callType: PilotCallType,
  aircraft: Aircraft,
  airport: Airport,
): string[] {
  const cs = callsignToks('pil', aircraft.callsign)
  const rwy = (aircraft.assignedRunway ?? '').replace(/\D/g, '')

  switch (callType) {
    case PilotCallType.REQUEST_PUSHBACK: {
      const gateNum = (aircraft.assignedGate ?? '').replace(/\D/g, '')
      return [
        tok('pil', 'pc_asmara'), tok('pil', 'pc_ground'),
        ...cs,
        tok('pil', 'pc_at_gate'),
        ...(gateNum ? [tok('pil', `gate_g${gateNum}`)] : []),
        tok('pil', 'pc_request_pushback_expecting_runway'),
        ...digitToks('pil', rwy),
      ]
    }
    case PilotCallType.REQUEST_STARTUP:
      return [
        tok('pil', 'pc_asmara'), tok('pil', 'pc_ground'),
        ...cs,
        tok('pil', 'pc_request_startup_expecting_runway'),
        ...digitToks('pil', rwy),
      ]
    case PilotCallType.WITH_YOU_FINAL:
      return [
        tok('pil', 'pc_asmara'), tok('pil', 'pc_tower'),
        ...cs,
        tok('pil', 'pc_with_you_on_final_runway'),
        ...digitToks('pil', rwy),
      ]
    case PilotCallType.REQUEST_CROSSING: {
      const crossRwy = (aircraft.awaitingCrossingRunway ?? rwy).replace(/\D/g, '')
      return [
        tok('pil', 'pc_asmara'), tok('pil', 'pc_ground'),
        ...cs,
        tok('pil', 'pc_holding_short_runway'),
        ...digitToks('pil', crossRwy),
        tok('pil', 'pc_request_crossing'),
      ]
    }
    case PilotCallType.VACATED_REQUEST_TAXI:
      return [
        tok('pil', 'pc_asmara'), tok('pil', 'pc_ground'),
        ...cs,
        tok('pil', 'w_runway'),
        ...digitToks('pil', rwy),
        tok('pil', 'pc_vacated_request_taxi_to_terminal'),
      ]
  }
}
