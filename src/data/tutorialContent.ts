// Pure data — no logic. Six replayable tutorial topics, grouped for the
// TutorialMenu. UI Basics is the original 8-step walkthrough, unchanged.

/** A render-only aircraft staged for a tutorial step. Never enters gameState —
 *  RadarCanvas draws it with the same code path as real aircraft, but nothing
 *  in scoring/mission/career/spawn systems ever sees it. */
export interface TutorialDemoAircraft {
  readonly id: string
  readonly callsign: string
  readonly x: number          // world NM, relative to the airport reference point
  readonly y: number
  readonly altitude: number   // ft MSL
  readonly speed: number      // knots
  readonly heading: number    // degrees true
  readonly isGround: boolean
  readonly inViolation?: boolean
  readonly urgent?: boolean
}

export interface TutorialStep {
  readonly title: string
  readonly body: string
  readonly selector: string | null   // null = centered card, same as today
  /** Present = stage these aircraft and hide real traffic for this step. */
  readonly demo?: readonly TutorialDemoAircraft[]
}

export type TutorialGroup = 'getting-started' | 'atc-knowledge' | 'role'

export interface TutorialTopic {
  readonly id: string
  readonly title: string
  readonly group: TutorialGroup
  readonly menuDescription: string
  readonly steps: readonly TutorialStep[]
}

const UI_BASICS_STEPS: readonly TutorialStep[] = [
  {
    title: 'WELCOME TO ASMARA TOWER',
    body: 'You are the air traffic controller for Asmara International (HHAS). Guide departures from gate to the sky and arrivals from the sector boundary down to their gate — safely and efficiently. This tour shows you the console.',
    selector: null,
  },
  {
    title: 'STATUS BAR',
    body: 'Session time, your score, and the current traffic count (AIR airborne / GND on the ground). The PAUSE button — or Space — freezes the simulation.',
    selector: '#status-bar-container',
  },
  {
    title: 'FLIGHT STRIPS',
    body: 'Every aircraft under your control gets a strip: departures on top, arrivals below. Each shows callsign, type, phase, and altitude/speed. Click a strip to select that aircraft.',
    selector: '#flight-strips-container',
  },
  {
    title: 'RADAR SCOPE',
    body: 'Click a blip to select an aircraft. Drag to pan, scroll to zoom (or + / - / 0 keys). Press R and drag to measure distance and bearing. Keep airborne traffic separated by 3 NM or 1,000 ft — violations flash red.',
    selector: '#radar-container',
  },
  {
    title: 'COMMAND PANEL',
    body: 'With an aircraft selected, issue clearances from here. The GND / TWR / APP tabs mirror the three controller positions — an aircraft only accepts commands from the frequency it is on. Hand aircraft between positions with the CONTACT buttons.',
    selector: '#commands-container',
  },
  {
    title: 'COMMAND INPUT',
    body: 'Prefer typing? Enter commands like "DAL123 DESCEND 90" here. Press / to focus it from anywhere; auto-complete suggests callsigns and verbs as you type.',
    selector: '#command-input-container',
  },
  {
    title: 'RADIO LOG',
    body: 'The party line. Your transmissions, pilot readbacks, and system warnings appear here. Pilots take a moment to read back and comply — just like the real thing.',
    selector: '#radio-log-container',
  },
  {
    title: 'YOU HAVE THE POSITION',
    body: 'Press G for the full controller guide, O for the mission tracker, and T to reopen this tutorial menu. Good luck — Asmara Tower is yours.',
    selector: null,
  },
]

const ATC_FUNDAMENTALS_STEPS: readonly TutorialStep[] = [
  {
    title: 'ATC FUNDAMENTALS',
    body: 'A quick primer on the concepts every controller decision here rests on: separation, datablocks, phase flow, and handoffs.',
    selector: null,
  },
  {
    title: 'SEPARATION MINIMA',
    body: 'Two airborne aircraft must stay at least 3 nautical miles apart laterally, OR 1,000 feet apart vertically. If both fall below those thresholds at once, it is a separation violation — the radar shows it as a pulsing red ring around both aircraft, and it costs you points. Watch converging tracks before they get close, not after.',
    selector: '#radar-container',
  },
  {
    title: 'READING A DATABLOCK',
    body: 'Each aircraft label has up to three lines: callsign; current altitude (in hundreds of feet) and speed (in tens of knots); and, if a clearance is pending, a "C:" line showing the cleared altitude/speed you assigned. A leader line connects the label to the aircraft it belongs to.',
    selector: '#radar-container',
  },
  {
    title: 'THE PHASE-OF-FLIGHT FLOW',
    body: 'Departures move through PARKED → TAXI_OUT → HOLD_SHORT → LINE_UP → TAKEOFF_ROLL → CLIMBING → DEPARTED. Arrivals move through ENTERING → APPROACH → FINAL → LANDING → ROLLOUT → TAXI_IN → ARRIVED. Each phase only accepts specific commands — the command panel greys out anything that is not valid right now, so you cannot get it wrong.',
    selector: '#flight-strips-container',
  },
  {
    title: 'HANDOFFS',
    body: 'An aircraft is always "on frequency" with exactly one controller: Ground, Tower, or Approach. A CONTACT command formally passes it to the next one — until you do, the receiving station\'s commands are not available for that aircraft. This is why an aircraft climbing out under Tower needs CONTACT DEPARTURE before it truly leaves your sector.',
    selector: '#commands-container',
  },
]

const HANDLING_INCIDENTS_STEPS: readonly TutorialStep[] = [
  {
    title: 'HANDLING INCIDENTS',
    body: 'Four situations you will eventually see, staged here so you know exactly what each one looks like before it matters for real.',
    selector: null,
  },
  {
    title: 'SEPARATION VIOLATION',
    body: 'These two aircraft are 2 NM apart at the same altitude — inside the 3 NM / 1,000 ft minimum. Notice the pulsing red ring around both. Fix it fast: turn one aircraft off the other\'s track, or change one\'s altitude by at least 1,000 ft. The longer it persists, the more it costs you.',
    selector: '#radar-container',
    demo: [
      { id: 'demo-sep-1', callsign: 'DEMO01', x: -1, y: 0, altitude: 6000, speed: 220, heading: 90, isGround: false, inViolation: true },
      { id: 'demo-sep-2', callsign: 'DEMO02', x: 1, y: 0, altitude: 6000, speed: 210, heading: 270, isGround: false, inViolation: true },
    ],
  },
  {
    title: 'NOT CLEARED TO LAND',
    body: 'An aircraft on FINAL that you have not cleared to land turns urgent — shown in amber. You must either issue CLEARED LAND before it reaches the runway, or send it around with GO AROUND. Leaving it undecided is the one thing you must never do on short final.',
    selector: '#radar-container',
    demo: [
      { id: 'demo-urgent-1', callsign: 'DEMO03', x: -0.5, y: -0.2, altitude: 500, speed: 140, heading: 70, isGround: false, urgent: true },
    ],
  },
  {
    title: 'GO-AROUND',
    body: 'When an aircraft breaks off its landing — whether you sent it around or a pilot did on their own — it climbs away on a published missed-approach track instead of continuing to the runway. Treat it like a new arrival: it will need to be re-sequenced back onto an approach.',
    selector: '#radar-container',
    demo: [
      { id: 'demo-missed-1', callsign: 'DEMO04', x: -0.3, y: -0.1, altitude: 1200, speed: 160, heading: 170, isGround: false },
    ],
  },
  {
    title: 'LOW ALTITUDE ALERT (MVA)',
    body: 'If an airborne aircraft drops below the Minimum Vectoring Altitude for this sector while not established on approach or final, the radio log shows a CRITICAL "LOW ALTITUDE ALERT — CHECK MVA" warning. Climb the aircraft immediately — this is a terrain-clearance issue, not a scoring nuance.',
    selector: '#radio-log-container',
    demo: [
      { id: 'demo-mva-1', callsign: 'DEMO05', x: -2, y: 1, altitude: 8200, speed: 200, heading: 200, isGround: false },
    ],
  },
]

const GROUND_STEPS: readonly TutorialStep[] = [
  {
    title: 'GROUND: THE TAXI SEQUENCE',
    body: 'Ground owns every aircraft from engine start to the runway hold-short line, and every arrival from rollout to the gate. This aircraft just requested pushback.',
    selector: '#commands-container',
    demo: [{ id: 'demo-gnd-1', callsign: 'DEMO10', x: 0.1, y: 0.15, altitude: 0, speed: 0, heading: 65, isGround: true }],
  },
  {
    title: 'TAXI',
    body: 'Select the aircraft, switch to the GND tab, and issue TAXI. It will roll toward the assigned runway on its own and stop automatically at the hold-short line — you do not drive it turn by turn.',
    selector: '#commands-container',
    demo: [{ id: 'demo-gnd-1', callsign: 'DEMO10', x: 0.1, y: 0.15, altitude: 0, speed: 20, heading: 65, isGround: true }],
  },
  {
    title: 'HANDING OFF TO TOWER',
    body: 'Once it reaches HOLD_SHORT, issue CONTACT TWR. Tower takes it from there for lineup and takeoff. On arrivals, the reverse happens: Tower hands a landed aircraft to you with CONTACT GND once it clears the runway, and you taxi it to a gate.',
    selector: '#commands-container',
    demo: [{ id: 'demo-gnd-1', callsign: 'DEMO10', x: -0.2, y: 0.05, altitude: 0, speed: 0, heading: 70, isGround: true }],
  },
]

const TOWER_STEPS: readonly TutorialStep[] = [
  {
    title: 'TOWER: THE RUNWAY',
    body: 'Tower owns the runway itself — lineup, takeoff clearance, landing clearance, and anything on short final. This aircraft has just been handed off from Ground at the hold-short line.',
    selector: '#commands-container',
    demo: [{ id: 'demo-twr-1', callsign: 'DEMO11', x: -0.25, y: 0.02, altitude: 0, speed: 0, heading: 70, isGround: true }],
  },
  {
    title: 'LINE UP AND CLEARED FOR TAKEOFF',
    body: 'Issue LINE UP to move it onto the runway centerline, then CLEARED T/OFF once the runway is confirmed clear. It accelerates and climbs on its own — your job is timing, not flying.',
    selector: '#commands-container',
    demo: [{ id: 'demo-twr-1', callsign: 'DEMO11', x: -0.15, y: 0, altitude: 0, speed: 0, heading: 70, isGround: true }],
  },
  {
    title: 'CLEARING ARRIVALS TO LAND',
    body: 'For arrivals, once Approach hands you an aircraft established on final, issue CLEARED LAND before it crosses the threshold. Forget, and it turns urgent — see the Handling Incidents tutorial for what that looks like.',
    selector: '#radar-container',
    demo: [{ id: 'demo-twr-2', callsign: 'DEMO12', x: -0.6, y: -0.2, altitude: 300, speed: 130, heading: 70, isGround: false }],
  },
]

const APPROACH_STEPS: readonly TutorialStep[] = [
  {
    title: 'APPROACH: SEQUENCING ARRIVALS',
    body: 'Approach owns arrivals from sector entry until they are established on final and handed to Tower. This aircraft just entered the sector.',
    selector: '#radar-container',
    demo: [{ id: 'demo-app-1', callsign: 'DEMO13', x: -6, y: 3, altitude: 11000, speed: 230, heading: 210, isGround: false }],
  },
  {
    title: 'CLEARED FOR THE APPROACH',
    body: 'Once it is reasonably aligned with the runway, issue CLEARED APPROACH. It automatically assigns the active runway and starts descending itself to intercept the glideslope — you do not need to work out the altitude by hand.',
    selector: '#commands-container',
    demo: [{ id: 'demo-app-1', callsign: 'DEMO13', x: -3, y: 1.5, altitude: 8000, speed: 200, heading: 245, isGround: false }],
  },
  {
    title: 'HANDING OFF TO TOWER',
    body: 'Once established, issue CONTACT TWR to pass it along before it reaches FINAL. If you forget, it stays on your frequency and Tower cannot clear it to land — a common way to accidentally send someone around.',
    selector: '#commands-container',
    demo: [{ id: 'demo-app-1', callsign: 'DEMO13', x: -1, y: 0.4, altitude: 2000, speed: 160, heading: 70, isGround: false }],
  },
]

export const TUTORIAL_TOPICS: readonly TutorialTopic[] = [
  {
    id: 'ui-basics',
    title: 'UI Basics',
    group: 'getting-started',
    menuDescription: 'Tour of the console — status bar, strips, radar, commands, input, radio log.',
    steps: UI_BASICS_STEPS,
  },
  {
    id: 'atc-fundamentals',
    title: 'ATC Fundamentals',
    group: 'atc-knowledge',
    menuDescription: 'Separation minima, datablocks, phase flow, and handoffs.',
    steps: ATC_FUNDAMENTALS_STEPS,
  },
  {
    id: 'handling-incidents',
    title: 'Handling Incidents',
    group: 'atc-knowledge',
    menuDescription: 'Separation violations, urgent aircraft, go-arounds, and MVA alerts — staged live.',
    steps: HANDLING_INCIDENTS_STEPS,
  },
  {
    id: 'role-ground',
    title: 'Ground',
    group: 'role',
    menuDescription: 'Taxi clearances and handing off to Tower.',
    steps: GROUND_STEPS,
  },
  {
    id: 'role-tower',
    title: 'Tower',
    group: 'role',
    menuDescription: 'Lineup, takeoff, and landing clearances.',
    steps: TOWER_STEPS,
  },
  {
    id: 'role-approach',
    title: 'Approach',
    group: 'role',
    menuDescription: 'Sequencing arrivals onto the approach and handing off to Tower.',
    steps: APPROACH_STEPS,
  },
]
