import { useState, useCallback, useRef, useEffect } from 'react'
import type { CommandParams } from '../engine/types'
import { ControllerStation, CommandType } from '../engine/types'
import {
  CONTROLLER_COMMANDS,
  PHASE_COMMANDS,
  DEFAULT_FREQUENCIES,
  CSS_COLORS,
} from '../engine/constants'
import { useGame } from '../state/GameContext'

// ─── Tab Configuration ────────────────────────────────────────────────────────

interface StationTab {
  station: ControllerStation
  frequency: number
  label: string
}

const STATION_TABS: StationTab[] = [
  { station: ControllerStation.GROUND, frequency: DEFAULT_FREQUENCIES[ControllerStation.GROUND], label: 'GND' },
  { station: ControllerStation.TOWER, frequency: DEFAULT_FREQUENCIES[ControllerStation.TOWER], label: 'TWR' },
  { station: ControllerStation.APPROACH, frequency: DEFAULT_FREQUENCIES[ControllerStation.APPROACH], label: 'APP' },
] as const

// ─── Command Metadata ─────────────────────────────────────────────────────────

const COMMANDS_NEEDING_PARAMS: Partial<
  Record<CommandType, { param: keyof CommandParams; placeholder: string; label: string }>
> = {
  [CommandType.VECTOR]: { param: 'heading', placeholder: '000-360', label: 'HDG' },
  [CommandType.ALTITUDE]: { param: 'altitude', placeholder: 'ft MSL', label: 'ALT' },
  [CommandType.SPEED]: { param: 'speed', placeholder: 'knots', label: 'SPD' },
  [CommandType.SQUAWK]: { param: 'squawk', placeholder: 'e.g. 4521', label: 'SQK' },
}

const COMMAND_LABELS: Record<CommandType, string> = {
  [CommandType.PUSHBACK_APPROVED]: 'PUSHBACK',
  [CommandType.STARTUP_APPROVED]: 'STARTUP',
  [CommandType.STANDBY]: 'STANDBY',
  [CommandType.TAXI]: 'TAXI',
  [CommandType.HOLD_SHORT]: 'HOLD SHORT',
  [CommandType.CROSS_RUNWAY]: 'CROSS RWY',
  [CommandType.CONTINUE_TAXI]: 'CONTINUE',
  [CommandType.LINE_UP_WAIT]: 'LINE UP',
  [CommandType.CLEARED_TAKEOFF]: 'CLR T/OFF',
  [CommandType.CLEARED_LAND]: 'CLR LAND',
  [CommandType.CLEARED_APPROACH]: 'CLR APPR',
  [CommandType.VECTOR]: 'VECTOR',
  [CommandType.ALTITUDE]: 'ALTITUDE',
  [CommandType.SPEED]: 'SPEED',
  [CommandType.SQUAWK]: 'SQUAWK',
  [CommandType.CONTACT_DEPARTURE]: 'DEPARTURE',
  [CommandType.CONTACT_TOWER]: 'CONTACT TWR',
  [CommandType.CONTACT_GROUND]: 'CONTACT GND',
  [CommandType.GO_AROUND]: 'GO AROUND',
  [CommandType.EXIT_RUNWAY]: 'EXIT RWY',
  [CommandType.CANCEL_TAXI]: 'CNCL TAXI',
  [CommandType.WIND]: 'WIND',
  [CommandType.REPORT]: 'REPORT',
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function CommandPanel() {
  const { state, issueCommand } = useGame()
  const [activeStation, setActiveStation] = useState<ControllerStation>(ControllerStation.TOWER)
  const [pendingCmd, setPendingCmd] = useState<CommandType | null>(null)
  const [paramValue, setParamValue] = useState('')
  const paramInputRef = useRef<HTMLInputElement>(null)

  const visibleTabs = STATION_TABS.filter((tab) => state.playerStations.includes(tab.station))

  // If the player narrows their stations while a now-hidden tab is active
  // (or on first mount, since the default activeStation is TOWER regardless
  // of what was actually selected), snap to the first station still visible.
  useEffect(() => {
    if (!state.playerStations.includes(activeStation) && visibleTabs.length > 0) {
      setActiveStation(visibleTabs[0].station)
    }
  }, [state.playerStations, activeStation, visibleTabs])

  const selectedAircraft = Array.from(state.aircraft.values()).find((ac) => ac.isSelected) ?? null

  const availableCommands = CONTROLLER_COMMANDS[activeStation]
  const pendingParamInfo = pendingCmd ? COMMANDS_NEEDING_PARAMS[pendingCmd] : null

  const isCommandValid = useCallback(
    (cmdType: CommandType): boolean => {
      if (!selectedAircraft) return true
      return PHASE_COMMANDS[selectedAircraft.phase].includes(cmdType)
    },
    [selectedAircraft],
  )

  const handleCommandClick = useCallback(
    (cmdType: CommandType) => {
      if (!selectedAircraft) return
      if (!isCommandValid(cmdType)) return

      const paramInfo = COMMANDS_NEEDING_PARAMS[cmdType]
      if (paramInfo) {
        setPendingCmd(cmdType)
        setParamValue('')
        return
      }

      issueCommand({
        type: cmdType,
        targetCallsign: selectedAircraft.callsign,
        params: {},
      })
    },
    [selectedAircraft, isCommandValid, issueCommand],
  )

  const handleParamSubmit = useCallback(() => {
    if (!pendingCmd || !selectedAircraft) return

    const paramInfo = COMMANDS_NEEDING_PARAMS[pendingCmd]
    if (!paramInfo) {
      setPendingCmd(null)
      return
    }

    const paramKey = paramInfo.param
    const numericVal = parseInt(paramValue, 10)
    const params: CommandParams =
      paramKey === 'heading' ? { heading: numericVal } :
      paramKey === 'altitude' ? { altitude: numericVal } :
      paramKey === 'speed' ? { speed: numericVal } :
      paramKey === 'squawk' ? { squawk: paramValue } :
      {}

    issueCommand({
      type: pendingCmd,
      targetCallsign: selectedAircraft.callsign,
      params,
    })

    setPendingCmd(null)
    setParamValue('')
  }, [pendingCmd, selectedAircraft, paramValue, issueCommand])

  useEffect(() => {
    if (pendingCmd && paramInputRef.current) {
      paramInputRef.current.focus()
    }
  }, [pendingCmd])

  // ─── Base Styles ──────────────────────────────────────────────────────────

  const S = {
    panel: {
      height: '100%',
      background: '#161B22',
      display: 'flex',
      flexDirection: 'column',
      overflow: 'hidden' as const,
      fontFamily: "'SF Mono', 'Cascadia Code', 'Menlo', 'Consolas', monospace",
      fontSize: 11,
      color: '#E2E8F0',
      borderRadius: 4,
    },
    tabBar: {
      display: 'flex',
      background: '#1D2430',
      borderBottom: '1px solid #0E1116',
      flexShrink: 0,
    },
    tabBtn: (active: boolean): React.CSSProperties => ({
      flex: 1,
      padding: '6px 4px',
      background: active ? '#0ea5e9' : 'transparent',
      color: active ? '#FFFFFF' : '#94A3B8',
      border: 'none',
      cursor: 'pointer',
      fontFamily: 'inherit',
      fontSize: 10,
      fontWeight: 600,
      textTransform: 'uppercase' as const,
      letterSpacing: 0.5,
    }),
    content: {
      flex: 1,
      overflowY: 'auto' as const,
      padding: 6,
      display: 'flex',
      flexDirection: 'column' as const,
      gap: 4,
    },
    btnGrid: {
      display: 'flex',
      flexWrap: 'wrap' as const,
      gap: 4,
    },
    cmdBtn: (valid: boolean): React.CSSProperties => ({
      padding: '5px 8px',
      background: '#1D2430',
      color: '#E2E8F0',
      border: '1px solid transparent',
      borderRadius: 3,
      cursor: valid ? 'pointer' : 'not-allowed',
      fontFamily: 'inherit',
      fontSize: 11,
      opacity: valid ? 1 : 0.4,
      flex: '1 0 auto',
      minWidth: 0,
      whiteSpace: 'nowrap' as const,
      textTransform: 'uppercase' as const,
      letterSpacing: 0.3,
    }),
    paramRow: {
      display: 'flex',
      gap: 4,
      alignItems: 'center',
      padding: '4px 0',
    },
    paramInput: {
      flex: 1,
      background: '#1D2430',
      color: '#E2E8F0',
      border: '1px solid #0ea5e9',
      borderRadius: 3,
      padding: '4px 6px',
      fontFamily: 'inherit',
      fontSize: 11,
      outline: 'none',
    },
    miniBtn: {
      padding: '4px 8px',
      background: '#1D2430',
      color: '#E2E8F0',
      border: '1px solid #0E1116',
      borderRadius: 3,
      cursor: 'pointer',
      fontFamily: 'inherit',
      fontSize: 10,
    },
    selectedInfo: {
      padding: '4px 0 6px',
      fontSize: 10,
      color: CSS_COLORS.text.secondary,
      borderBottom: `1px solid #1D2430`,
      marginBottom: 4,
    },
    empty: {
      color: CSS_COLORS.text.muted,
      textAlign: 'center' as const,
      padding: 16,
      fontSize: 11,
    },
  } as const

  return (
    <div style={S.panel}>
      <style>{`
        .cp-tab-btn:hover { background: #1e293b !important; }
        .cp-tab-btn-active:hover { background: #0ea5e9 !important; }
        .cp-cmd-btn:hover:not(:disabled) { background: #1e293b !important; }
        .cp-mini-btn:hover { background: #1e293b !important; }
      `}</style>

      {/* Tab bar — only shown when there is more than one station to switch between */}
      {visibleTabs.length > 1 && (
        <div style={S.tabBar}>
          {visibleTabs.map((tab) => {
            const active = activeStation === tab.station
            return (
              <button
                key={tab.station}
                className={active ? 'cp-tab-btn-active' : 'cp-tab-btn'}
                style={S.tabBtn(active)}
                onClick={() => {
                  setActiveStation(tab.station)
                  setPendingCmd(null)
                }}
              >
                {tab.label} {tab.frequency.toFixed(1)}
              </button>
            )
          })}
        </div>
      )}

      {/* Content */}
      <div style={S.content}>
        <div style={S.selectedInfo}>
          {selectedAircraft
            ? `${selectedAircraft.callsign} - ${selectedAircraft.type.icao} - ${selectedAircraft.phase}`
            : 'No aircraft selected'}
        </div>

        {/* Param input row */}
        {pendingCmd && pendingParamInfo ? (
          <div style={S.paramRow}>
            <span style={{ fontSize: 10, color: CSS_COLORS.text.secondary, whiteSpace: 'nowrap' }}>
              {pendingParamInfo.label}:
            </span>
            <input
              ref={paramInputRef}
              style={S.paramInput}
              value={paramValue}
              onChange={(e) => setParamValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleParamSubmit()
                if (e.key === 'Escape') setPendingCmd(null)
              }}
              placeholder={pendingParamInfo.placeholder}
            />
            <button className="cp-mini-btn" style={S.miniBtn} onClick={handleParamSubmit}>
              OK
            </button>
            <button
              className="cp-mini-btn"
              style={{ ...S.miniBtn, color: CSS_COLORS.text.muted }}
              onClick={() => setPendingCmd(null)}
            >
              X
            </button>
          </div>
        ) : null}

        {/* Command buttons */}
        <div style={S.btnGrid}>
          {availableCommands.map((cmdType) => {
            const valid = !selectedAircraft || isCommandValid(cmdType)
            return (
              <button
                key={cmdType}
                className="cp-cmd-btn"
                style={S.cmdBtn(valid)}
                disabled={!valid}
                onClick={() => handleCommandClick(cmdType)}
                title={
                  COMMANDS_NEEDING_PARAMS[cmdType]
                    ? `Requires ${COMMANDS_NEEDING_PARAMS[cmdType]!.label}`
                    : undefined
                }
              >
                {COMMAND_LABELS[cmdType]}
              </button>
            )
          })}
        </div>

        {availableCommands.length === 0 ? (
          <div style={S.empty}>No commands for this station</div>
        ) : null}
      </div>
    </div>
  )
}
