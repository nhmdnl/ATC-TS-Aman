# Changelog

All notable changes to ATC Aman are documented here.
Format loosely follows [Keep a Changelog](https://keepachangelog.com/); the
project adheres to [Semantic Versioning](https://semver.org/).

## [Unreleased]

### Added

- **Sim-rate controls** — run the simulation at 1× / 2× / 4× via status-bar
  RATE buttons or the `1` / `2` / `3` keys. The fixed 1 Hz tick runs N times
  per gate, so physics and phase logic stay fixed-step while sim time (fuel
  clocks, session duration, schedule) advances N×.
- **Low-fuel arrivals** — some arrivals spawn fuel-critical. The pilot calls
  **PAN PAN minimum fuel** when the clock runs low (amber urgent handling);
  landing them safely earns the new `fuel_priority_landed` score reason
  (+60, awareness/efficiency weighted). Letting the clock hit zero airborne
  triggers **MAYDAY** and the `fuel_emergency` penalty (−120).
- **Radio failures (NORDO)** — an airborne aircraft under player control may
  squawk 7600 and go off the frequency for ~75 s: commands are rejected with
  a NORDO notice, the aircraft continues on its last clearance, and the pilot
  calls back when contact is restored. Never assigned to AI-controlled
  aircraft; datablock shows a `NORDO` tag and the strip a gray status dot.
- **Conflict prediction probe** — the scope now dead-reckons airborne traffic
  up to 3 minutes ahead and flags pairs that will lose wake-matrix separation
  if nothing changes: soft amber ring on the blip, `PC {s}s` datablock tag,
  both aircraft involved. Advisory only — no scoring coupling, and pairs
  already in violation are left to the red halo.

### Changed

- **constants.ts merged with GLM-web branch** — added `SIM_RATES`,
  emergency fuel/radio-failure constants (`LOW_FUEL_ARRIVAL_CHANCE`,
  `LOW_FUEL_TOTAL_MS`, `LOW_FUEL_DECLARE_MS`, `RADIO_FAILURE_CHANCE_PER_TICK`,
  `RADIO_FAILURE_DURATION_MS`), conflict-probe constants
  (`CONFLICT_PROBE_HORIZON_S`, `CONFLICT_PROBE_STEP_S`), and
  `fuel_priority_landed` / `fuel_emergency` entries to `SCORE_DELTAS`,
  `DIMENSION_DELTAS`, and `XP_PER_REASON`. All five rotorcraft entries
  (H125, H135, AW139, H60, EC35) with `rotorcraft: true` preserved.
- Radar datablocks grow an optional 4th advisory line (`NORDO` / `MIN FUEL` /
  `PC 45s`) that also forces Full Data Block display for flagged traffic.
- AI controllers now work declared low-fuel aircraft immediately (bypassing
  the human-like decision interval) and skip NORDO aircraft entirely.
- Test suite grew from 235 to 256 tests (sim-rate, conflict-probe, and
  emergencies suites added).

## [0.2.0] — 2026-07-22

### Added

- **Recorded ATC radio voice pack** — the tower/ground/approach voice now plays
  real recorded clips (55 tokens, concatenative clip-chain with a WebAudio radio
  effect) instead of Web Speech TTS. Falls back to TTS for any missing token, so
  the pilot voice still uses TTS until those clips are recorded. See
  `docs/voice-pack/`.
- **Live weather (visibility / ceiling → VMC/IMC)** — difficulty presets now
  carry visibility and cloud ceiling; hard is IMC, which forces ILS approaches
  and exercises the missed-approach path. The status bar shows `VIS` / `VMC` / `IMC`.
- **UI/UX pass** — command-button press feedback + real hover state; selected
  aircraft shows readable phase and owning station (GND/TWR/APP); selecting a
  blip scrolls its flight strip into view; clickable pilot-call rows; `M`
  mutes; radio-log empty state; larger radar hit targets; keybind hint in the
  status bar; consistent speaker colors; assorted label/color fixes.
- **Pilot-calls-first (TS3 sim model)** — pilots now initiate every contact;
  the player/AI must respond before state advances. Unacknowledged calls
  repeat after 30 s. Calls are shown in the Flight Strips alert panel.
- **Departure lifecycle** — `AT_GATE → AWAITING_PUSHBACK → PUSHING_BACK →
  READY_TO_TAXI → TAXI_OUT → HOLD_SHORT → LINE_UP → TAKEOFF_ROLL →
  CLIMBING → DEPARTED`. Pushback phase animates the aircraft rearward on
  a controller-set heading.
- **Arrival lifecycle** — `ENTERING → INBOUND_UNCONTROLLED → APPROACH →
  FINAL → LANDING → ROLLOUT → VACATED → TAXI_IN → ARRIVED`. Aircraft now
  taxi from the rollout point to their gate under player/AI instruction
  instead of teleporting immediately on touchdown.
- **Wake turbulence separation matrix** — four categories
  (SUPER_HEAVY / HEAVY / MEDIUM / LIGHT) with per-pair required separation
  (3–8 NM), replacing the old flat 5 NM constant.
- **Golden Rule — runway occupancy** — a runway is marked occupied from
  landing clearance to vacating; `CLEARED_TO_LAND` is blocked while hot;
  arriving aircraft that reach the threshold on a hot runway automatically
  go around even if already cleared.
- **VMC / IMC conditions** — `Wind` now carries optional `visibilityNM` and
  `ceiling`; `CLEARED_APPROACH` in IMC requires ILS on the assigned runway;
  status bar shows live VMC/IMC badge.
- **Schedule-based traffic** — 22 real-schedule HHAS flights
  (ERE/ETH/UAE/MSR/KQA/FDB/THY/SDV) spawn by elapsed session time via
  `hhas.schedule.json`; random spawning only as a fallback.
- **New commands**: `PUSHBACK_APPROVED`, `STARTUP_APPROVED`, `STANDBY`,
  `CROSS_RUNWAY`, `CONTINUE_TAXI`, `WIND`, `REPORT`.
- **WIND command** — broadcasts active runway wind to the pilot;
  phraseology uses live `gameState.wind`.
- **REPORT command** — pilot reads back heading, position, and airspeed.
- **Missed-handoff penalty** — departures that leave the sector without a
  handoff deduct 100 pts and log the `missed_handoff` scoring dimension.
- **Airport picker** — main menu now shows a selectable airport list with
  a radar-map preview before entering the briefing screen.
- **LINE_UP taxis to threshold** — aircraft in LINE_UP phase now follow
  the taxiway graph to the actual runway threshold instead of snapping.

### Fixed

- Score floor clamped at −500; violations keep costing past a bad streak.
- Linux cold-launch GPU crash — renderer pinned to X11 + ANGLE-Vulkan
  (bundled ANGLE-GL segfaults on Mesa).
- Radar blank on cold launch — Electron GPU process raced a suspended
  dGPU; the blank-canvas guard now retries the PixiJS init.
- MVA low-altitude alert fires once per aircraft per incursion, not every
  10 s.
- Out-of-area aircraft despawn at 20 NM (4th radar ring) rather than
  drifting off-screen indefinitely.

### Changed

- Resizable game window (minimum 1280 × 720).
- Briefing/main-menu screen has an opaque backdrop and adds Sound and Quit
  buttons.
- Good landings teleport the arrival to its assigned gate at rollout end
  (superseded by full VACATED → TAXI_IN taxi-in in this release, but
  retained as a ponytail fallback when no taxi path is available).

## [0.1.0] — 2026-07-07

First public release. 🎉

### Added

- **Core simulation** — 1 Hz tick engine for Asmara International (HHAS):
  aircraft spawning, per-phase movement physics, automatic phase
  transitions, separation checking (lateral/vertical), MVA enforcement,
  and session lifecycle with end-of-shift grading
- **Command system** — 16 command types across Ground/Tower/Approach
  stations, issued via command buttons or text input (with autocomplete);
  validation pipeline, ICAO phraseology, and delayed pilot readbacks
- **Radar scope (PixiJS)** — airport diagram, range rings, rotating sweep,
  aircraft data blocks/trails/vectors, cursor-centered zoom, pan, and a
  ruler tool for distance/bearing
- **Controller station selection** — choose which of Ground/Tower/Approach
  you control; unselected stations are worked by a deterministic AI
  controller, and AI-handled aircraft are excluded from your score
- **Scoring & career** — five dimensions (Safety, Efficiency,
  Communication, Procedure, Awareness), S–D grades, persistent XP/levels
  (stored locally only)
- **Tutorials** — topic menu (UI Basics, ATC Fundamentals, Handling
  Incidents, Ground/Tower/Approach) plus an 8-step spotlight walkthrough
- **Audio** — offline text-to-speech for ATC/pilot exchanges with distinct
  voices, radio-log captions independent of TTS availability
  (`TTS: CAPTIONS ONLY` indicator), and Web Audio cues for commands,
  alerts, and successes
- **UX** — briefing screen (difficulty + stations), pause menu
  (resume/restart/mute/main menu/quit), flight strips, mission tracker,
  guide panel, keyboard shortcuts
- **Windows installer** — NSIS x64 package built with electron-builder
