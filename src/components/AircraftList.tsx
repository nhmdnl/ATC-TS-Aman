import React from 'react'
import { useGame } from '../state/GameContext'
import { AircraftPhase } from '../engine/types'

export default function AircraftList() {
  const { state, selectAircraft } = useGame()

  const aircraft = Array.from(state.aircraft.values())
  const departures = aircraft.filter(a => a.flightType === 'departure' && ![AircraftPhase.DEPARTED, AircraftPhase.ARRIVED].includes(a.phase))
  const arrivals = aircraft.filter(a => a.flightType === 'arrival' && ![AircraftPhase.DEPARTED, AircraftPhase.ARRIVED].includes(a.phase))

  const renderItem = (ac: any) => {
    const isSelected = ac.isSelected
    return (
      <div 
        key={ac.id}
        onClick={() => selectAircraft(ac.id)}
        style={{
          padding: '4px 8px',
          fontSize: 11,
          fontFamily: 'SF Mono, monospace',
          color: isSelected ? '#0f172a' : (ac.inViolation ? '#ef4444' : ac.urgent ? '#eab308' : '#e2e8f0'),
          backgroundColor: isSelected ? '#38bdf8' : 'transparent',
          cursor: 'pointer',
          display: 'flex',
          justifyContent: 'space-between',
          borderBottom: '1px solid #1e293b'
        }}
      >
        <span style={{ fontWeight: 600 }}>{ac.callsign}</span>
        <span>{ac.type.icao}</span>
        <span>{ac.altitude < 100 ? 'GND' : Math.round(ac.altitude/100).toString().padStart(3, '0')}</span>
      </div>
    )
  }

  return (
    <div className="panel-bg" style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <div style={{ padding: '8px', fontSize: 10, fontWeight: 600, color: '#64748B', borderBottom: '1px solid #1E293B' }}>
        DEPARTURES ({departures.length})
      </div>
      <div style={{ flex: 1, overflowY: 'auto' }}>
        {departures.map(renderItem)}
      </div>
      
      <div style={{ padding: '8px', fontSize: 10, fontWeight: 600, color: '#64748B', borderBottom: '1px solid #1E293B', borderTop: '2px solid #0f172a' }}>
        ARRIVALS ({arrivals.length})
      </div>
      <div style={{ flex: 1, overflowY: 'auto' }}>
        {arrivals.map(renderItem)}
      </div>
    </div>
  )
}
