import { useEffect, useRef } from 'react'
import { useGame } from '../state/GameContext'
import type { Aircraft } from '../engine/types'
import { AircraftPhase } from '../engine/types'

const PHASE_ABBREV: Record<string, string> = {
  AT_GATE: 'GATE',
  AWAITING_PUSHBACK: 'PBK?',
  PUSHING_BACK: 'PUSH',
  READY_TO_TAXI: 'RDY',
  PARKED: 'GATE',
  TAXI_OUT: 'TAXI',
  HOLD_SHORT: 'HOLD',
  LINE_UP: 'LINE',
  TAKEOFF_ROLL: 'TOFF',
  CLIMBING: 'CLIMB',
  ENTERING: 'ENTR',
  APPROACH: 'APP',
  FINAL: 'FINAL',
  LANDING: 'LAND',
  ROLLOUT: 'ROLL',
  INBOUND_UNCONTROLLED: 'INBND',
  VACATED: 'VCTED',
  TAXI_IN: 'TAXI',
  MISSED: 'MISS',
}

/** Hover text: what the abbreviation means and what the aircraft needs next. */
const PHASE_TOOLTIP: Record<string, string> = {
  AT_GATE: 'At gate',
  AWAITING_PUSHBACK: 'Requesting pushback — awaiting approval',
  PUSHING_BACK: 'Pushing back from the gate',
  READY_TO_TAXI: 'Pushback complete — needs taxi clearance',
  PARKED: 'Parked at gate',
  TAXI_OUT: 'Taxiing to the runway',
  HOLD_SHORT: 'Holding short — needs line-up or crossing clearance',
  LINE_UP: 'Lining up — needs takeoff clearance',
  TAKEOFF_ROLL: 'Rolling for takeoff',
  CLIMBING: 'Climbing out',
  ENTERING: 'Entering the airspace',
  APPROACH: 'On approach',
  FINAL: 'On final',
  LANDING: 'Landing',
  ROLLOUT: 'Landing rollout',
  INBOUND_UNCONTROLLED: 'Inbound, not yet under your control',
  VACATED: 'Runway vacated — taxiing in',
  TAXI_IN: 'Taxiing to the gate',
  MISSED: 'Going around (missed approach)',
}

/** Phases where the aircraft sits waiting for a controller command. */
const AWAITING_COMMAND_PHASES = new Set([
  AircraftPhase.AWAITING_PUSHBACK,
  AircraftPhase.READY_TO_TAXI,
  AircraftPhase.HOLD_SHORT,
  AircraftPhase.LINE_UP, // ponytail: also pulses while still taxiing into position
])

const EXCLUDED_PHASES = new Set([AircraftPhase.DEPARTED, AircraftPhase.ARRIVED])

function fmtAlt(alt: number): string {
  return alt < 100 ? 'GND' : String(Math.round(alt / 100))
}

function StripCard({ ac }: { ac: Aircraft }) {
  const { state, selectAircraft } = useGame()
  const cardRef = useRef<HTMLDivElement>(null)

  const isDep = ac.flightType === 'departure'
  const accent = isDep ? '#39D98A' : '#5CBFFF'
  const phases = PHASE_ABBREV[ac.phase] ?? ac.phase.slice(0, 4)
  const alt = fmtAlt(ac.altitude)

  // Pulse strips stuck waiting on the player (pilot calls already get a dot)
  const needsCommand = AWAITING_COMMAND_PHASES.has(ac.phase)
    && state.playerStations.includes(ac.controller)
    && ac.pendingPilotCall === null

  const handleClick = () => selectAircraft(ac.isSelected ? null : ac.id)

  // Scroll the strip into view when the aircraft is selected elsewhere (e.g.
  // by clicking its radar blip), so the two views stay in sync.
  useEffect(() => {
    if (ac.isSelected) cardRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
  }, [ac.isSelected])

  return (
    <div
      ref={cardRef}
      onClick={handleClick}
      className={needsCommand && !ac.isSelected ? 'strip-attention' : undefined}
      style={{
        background: ac.isSelected ? '#1E3A5F' : '#1D2430',
        borderBottom: '1px solid #1E293B',
        borderLeft: `3px solid ${accent}`,
        padding: '4px 6px',
        cursor: 'pointer',
        display: 'flex',
        alignItems: 'center',
        gap: 6,
        fontFamily: "'SF Mono', 'Cascadia Code', 'Fira Code', monospace",
        fontSize: 11,
        lineHeight: '18px',
        transition: 'background 0.1s',
      }}
    >
      {/* Status indicators */}
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1, width: 10 }}>
        {ac.pendingPilotCall !== null && <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#f59e0b', boxShadow: '0 0 4px #f59e0b' }} title="Incoming pilot call" />}
        {ac.urgent && <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#fb923c' }} title="Urgent" />}
        {ac.inViolation && <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#EF4444' }} />}
      </div>

      {/* Callsign */}
      <span style={{ color: '#E2E8F0', fontWeight: 700, flexShrink: 0 }}>{ac.callsign}</span>

      {/* Type */}
      <span style={{ color: '#64748B', flexShrink: 0 }}>{ac.type.icao}</span>

      {/* Phase */}
      <span
        title={PHASE_TOOLTIP[ac.phase] ?? ac.phase}
        style={{ color: accent, flexShrink: 0, fontWeight: 600, fontSize: 10, cursor: 'help' }}
      >{phases}</span>

      {/* Spacer */}
      <div style={{ flex: 1 }} />

      {/* Altitude */}
      <span style={{ color: '#94A3B8', textAlign: 'right', minWidth: 28 }}>{alt}</span>

      {/* Speed */}
      <span style={{ color: '#94A3B8', textAlign: 'right', minWidth: 28 }}>{ac.speed}</span>
    </div>
  )
}

function StripSection({
  title,
  aircraft,
  accent,
}: {
  title: string
  aircraft: Aircraft[]
  accent: string
}) {
  return (
    <div>
      <div
        style={{
          color: '#64748B',
          fontSize: 10,
          textTransform: 'uppercase',
          letterSpacing: 1,
          padding: '6px 6px 3px',
          fontWeight: 600,
        }}
      >
        {title}{' '}
        <span style={{ color: accent }}>({aircraft.length})</span>
      </div>
      {aircraft.length === 0 ? (
        <div
          style={{
            color: '#475569',
            fontSize: 11,
            textAlign: 'center',
            padding: '12px 0',
            fontFamily: "'SF Mono', 'Cascadia Code', 'Fira Code', monospace",
          }}
        >
          No {title.toLowerCase()}
        </div>
      ) : (
        aircraft.map((ac) => <StripCard key={ac.id} ac={ac} />)
      )}
    </div>
  )
}

export default function FlightStrips() {
  const { state, selectAircraft } = useGame()
  const allAircraft = Array.from(state.aircraft.values())

  const departures = allAircraft.filter(
    (ac) => ac.flightType === 'departure' && !EXCLUDED_PHASES.has(ac.phase)
  )
  const arrivals = allAircraft.filter(
    (ac) => ac.flightType === 'arrival' && !EXCLUDED_PHASES.has(ac.phase)
  )

  const pendingCalls = allAircraft.filter(ac => ac.pendingPilotCall !== null)

  return (
    <div
      style={{
        height: '100%',
        overflowY: 'auto',
        background: '#161B22',
      }}
    >
      <div
        style={{
          color: '#64748B',
          fontSize: 10,
          textTransform: 'uppercase',
          letterSpacing: 1,
          padding: '8px 6px 4px',
          fontWeight: 700,
        }}
      >
        FLIGHT STRIPS
      </div>

      {pendingCalls.length > 0 && (
        <div style={{ borderBottom: '1px solid #92400e', background: 'rgba(245,158,11,0.08)' }}>
          <div style={{ padding: '4px 6px 2px', fontSize: 10, color: '#f59e0b', fontWeight: 700, letterSpacing: 1 }}>
            ▶ PILOT CALLS ({pendingCalls.length})
          </div>
          {pendingCalls.map(ac => (
            <div key={ac.id}
              onClick={() => selectAircraft(ac.id)}
              title="Select aircraft"
              style={{
              padding: '3px 8px 4px',
              fontSize: 11,
              fontFamily: "'SF Mono', 'Cascadia Code', 'Fira Code', monospace",
              color: '#fbbf24',
              borderLeft: '3px solid #f59e0b',
              marginBottom: 2,
              cursor: 'pointer',
            }}>
              <span style={{ fontWeight: 700 }}>{ac.callsign}</span>
              {' — '}
              <span style={{ color: '#e2e8f0' }}>{ac.pendingPilotCall!.message}</span>
            </div>
          ))}
        </div>
      )}

      <StripSection title="DEPARTURES" aircraft={departures} accent="#39D98A" />
      <div style={{ borderTop: '1px solid #1E293B', margin: '4px 0' }} />
      <StripSection title="ARRIVALS" aircraft={arrivals} accent="#5CBFFF" />
    </div>
  )
}
