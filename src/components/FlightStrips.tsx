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
  CLIMBING: 'CLMB',
  ENTERING: 'ENTR',
  APPROACH: 'APP',
  FINAL: 'FNL',
  LANDING: 'LND',
  ROLLOUT: 'ROLL',
  INBOUND_UNCONTROLLED: 'INB',
  VACATED: 'VCTD',
  TAXI_IN: 'TAXI',
  MISSED: 'MISS',
}

const PHASE_TOOLTIP: Record<string, string> = {
  AT_GATE: 'At gate',
  AWAITING_PUSHBACK: 'Requesting pushback — awaiting approval',
  PUSHING_BACK: 'Pushing back from gate',
  READY_TO_TAXI: 'Pushback complete — needs taxi clearance',
  PARKED: 'Parked at gate',
  TAXI_OUT: 'Taxiing to runway',
  HOLD_SHORT: 'Holding short — needs line-up or crossing clearance',
  LINE_UP: 'Lining up — needs takeoff clearance',
  TAKEOFF_ROLL: 'Rolling for takeoff',
  CLIMBING: 'Climbing out',
  ENTERING: 'Entering airspace',
  APPROACH: 'On approach',
  FINAL: 'On final approach',
  LANDING: 'Landing',
  ROLLOUT: 'Landing rollout',
  INBOUND_UNCONTROLLED: 'Inbound, unassigned',
  VACATED: 'Runway vacated — taxiing in',
  TAXI_IN: 'Taxiing to gate',
  MISSED: 'Going around (missed approach)',
}

const AWAITING_COMMAND_PHASES = new Set([
  AircraftPhase.AWAITING_PUSHBACK,
  AircraftPhase.READY_TO_TAXI,
  AircraftPhase.HOLD_SHORT,
  AircraftPhase.LINE_UP,
])

const EXCLUDED_PHASES = new Set([AircraftPhase.DEPARTED, AircraftPhase.ARRIVED])

function fmtAlt(alt: number): string {
  return alt < 100 ? 'GND' : `FL${Math.round(alt / 100).toString().padStart(3, '0')}`
}

function StripCard({ ac }: { ac: Aircraft }) {
  const { state, selectAircraft } = useGame()
  const cardRef = useRef<HTMLDivElement>(null)

  const isDep = ac.flightType === 'departure'
  const accent = isDep ? '#00FF66' : '#00E5FF'
  const phases = PHASE_ABBREV[ac.phase] ?? ac.phase.slice(0, 4)
  const alt = fmtAlt(ac.altitude)

  const needsCommand = AWAITING_COMMAND_PHASES.has(ac.phase)
    && state.playerStations.includes(ac.controller)
    && ac.pendingPilotCall === null

  const handleClick = () => selectAircraft(ac.isSelected ? null : ac.id)

  useEffect(() => {
    if (ac.isSelected) cardRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
  }, [ac.isSelected])

  return (
    <div
      ref={cardRef}
      onClick={handleClick}
      className={needsCommand && !ac.isSelected ? 'strip-attention' : undefined}
      style={{
        background: ac.isSelected ? '#122338' : '#0A0F16',
        borderBottom: '1px solid #1E293B',
        borderLeft: `4px solid ${accent}`,
        padding: '6px 8px',
        cursor: 'pointer',
        display: 'flex',
        flexDirection: 'column',
        gap: 4,
        fontFamily: "'SF Mono', 'Cascadia Code', 'Fira Code', monospace",
        fontSize: 11,
        transition: 'background 0.1s',
      }}
    >
      {/* Top Row: Callsign, Type/Wake, Status Dot */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ color: '#F8FAFC', fontWeight: 700, fontSize: 12, letterSpacing: 0.5 }}>
            {ac.callsign}
          </span>
          <span
            title={`${ac.type.name} (${ac.type.wakeCategory}) — Min RWY: ${(ac.type.minRunwayLengthFt ?? 5000).toLocaleString()} ft`}
            style={{ color: '#64748B', fontSize: 10, background: '#1E293B', padding: '1px 4px', borderRadius: 2, cursor: 'help' }}
          >
            {ac.type.icao} {ac.type.wakeCategory?.slice(0, 1) ?? ''}
          </span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          {ac.pendingPilotCall !== null && <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#FFD600', boxShadow: '0 0 6px #FFD600' }} title="Incoming pilot call" />}
          {ac.urgent && <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#FFD600' }} title="Urgent" />}
          {ac.inViolation && <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#FF1744' }} />}
          <span
            title={PHASE_TOOLTIP[ac.phase] ?? ac.phase}
            style={{ color: accent, fontWeight: 700, fontSize: 10, background: 'rgba(0,0,0,0.4)', padding: '1px 5px', borderRadius: 2, border: `1px solid ${accent}33` }}
          >
            {phases}
          </span>
        </div>
      </div>

      {/* Bottom Grid: Altitude, Speed, Squawk */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', color: '#94A3B8', fontSize: 10 }}>
        <span>ALT <strong style={{ color: '#E2E8F0' }}>{alt}</strong></span>
        <span>SPD <strong style={{ color: '#E2E8F0' }}>{ac.speed}KT</strong></span>
        <span>SQ <strong style={{ color: '#64748B' }}>{ac.squawk ?? '2401'}</strong></span>
      </div>
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
          letterSpacing: 1.2,
          padding: '8px 8px 4px',
          fontWeight: 700,
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          background: '#070B10',
          borderBottom: '1px solid #162338',
        }}
      >
        <span>{title}</span>
        <span style={{ color: accent, background: 'rgba(255,255,255,0.05)', padding: '1px 6px', borderRadius: 3 }}>
          {aircraft.length}
        </span>
      </div>
      {aircraft.length === 0 ? (
        <div
          style={{
            color: '#475569',
            fontSize: 10,
            textAlign: 'center',
            padding: '12px 0',
            fontFamily: "'SF Mono', 'Cascadia Code', 'Fira Code', monospace",
          }}
        >
          NO ACTIVE {title}
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
        background: '#05080E',
      }}
    >
      <div
        style={{
          color: '#94A3B8',
          fontSize: 10,
          textTransform: 'uppercase',
          letterSpacing: 1.5,
          padding: '10px 8px 6px',
          fontWeight: 800,
          borderBottom: '1px solid #1E293B',
          background: '#020408',
        }}
      >
        ELECTRONIC FLIGHT STRIPS (EFS)
      </div>

      {pendingCalls.length > 0 && (
        <div style={{ borderBottom: '1px solid #92400e', background: 'rgba(255,214,0,0.08)' }}>
          <div style={{ padding: '4px 8px 2px', fontSize: 10, color: '#FFD600', fontWeight: 700, letterSpacing: 1 }}>
            ▶ INCOMING CALLS ({pendingCalls.length})
          </div>
          {pendingCalls.map(ac => (
            <div key={ac.id}
              onClick={() => selectAircraft(ac.id)}
              title="Select aircraft"
              style={{
              padding: '4px 8px',
              fontSize: 11,
              fontFamily: "'SF Mono', 'Cascadia Code', 'Fira Code', monospace",
              color: '#FFD600',
              borderLeft: '3px solid #FFD600',
              marginBottom: 2,
              cursor: 'pointer',
            }}>
              <span style={{ fontWeight: 700 }}>{ac.callsign}</span>
              {' — '}
              <span style={{ color: '#E2E8F0' }}>{ac.pendingPilotCall!.message}</span>
            </div>
          ))}
        </div>
      )}

      <StripSection title="DEPARTURES" aircraft={departures} accent="#00FF66" />
      <div style={{ borderTop: '1px solid #162338', margin: '2px 0' }} />
      <StripSection title="ARRIVALS" aircraft={arrivals} accent="#00E5FF" />
    </div>
  )
}

