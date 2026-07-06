# ATC Aman — Product Requirements & Game Design Document

> **Game:** ATC Aman (also ATC AMAN)
> **Tagline:** *You are the Tower — manage Asmara's afternoon rush.*
> **Genre:** Real-time air traffic control simulation
> **Platform:** Local desktop, offline-capable
> **Status:** Production-ready (91 automated tests passing)
> **Date:** 2026-07-02

---

## Part I — Product Requirements

### 1. Product Overview

ATC Aman is a single-player air traffic control simulation that puts the player in the chair of a tower controller at Asmara International Airport (ICAO: HHAS). The player manages arriving and departing aircraft: issue taxi clearances, line-up and takeoff clearances, approach vectors, altitude assignments, speed restrictions, and landing clearances. Aircraft respond with pilot readbacks. The game scores the player's performance and provides feedback through a radio log, score events, and dimension-based metrics (Safety, Efficiency, Communication, Procedure, Awareness).

### 2. Target Audience

- Aspiring or training air traffic controllers
- Aviation enthusiasts interested in ATC procedures
- Simulation gamers who enjoy Euro Scope, ForeFlight, or similar ATC tools
- Single-player, desktop-oriented users

### 3. Core Requirements

| ID | Requirement | Status |
|----|-------------|--------|
| R1 | Player can issue 16 distinct command types (TAXI, HOLD_SHORT, LINE_UP_WAIT, CLEARED_TAKEOFF, CLEARED_LAND, CLEARED_APPROACH, VECTOR, ALTITUDE, SPEED, SQUAWK, CONTACT_DEPARTURE, CONTACT_TOWER, CONTACT_GROUND, GO_AROUND, EXIT_RUNWAY, CANCEL_TAXI) | ✅ |
| R2 | Aircraft execute commands via pilot readback after a configurable delay (1500-2500ms) | ✅ |
| R3 | Commands are validated through a pipeline (controller privilege, parameters, airport validity) | ✅ |
| R4 | Separation violations are detected and penalized (3 NM lateral, 1000 ft vertical) | ✅ |
| R5 | Scoring system tracks performance with dimension breakdowns | ✅ |
| R6 | Airport data is loaded from `.airport` JSON files — configurable via `--airport` CLI arg | ✅ |
| R7 | ATC phraseology is generated for all command types with pilot readback | ✅ |
| R8 | TTS (text-to-speech) reads out ATC and pilot messages | ✅ |
| R9 | Briefing screen before each session with difficulty selection | ✅ |
| R10 | End-mission results screen with grade, score breakdown, dimension bars | ✅ |
| R11 | Configurable difficulty (Easy/Medium/Hard) affects spawn rate, max traffic, wind | ✅ |
| R12 | Pause/resume/reset controls | ✅ |
| R13 | Mouse wheel zoom on radar, centered on cursor | ✅ |
| R14 | Radar pan via click-drag | ✅ |
| R15 | Ruler tool for distance/bearing measurement | ✅ |
| R16 | Mission system with chained objectives | ✅ |
| R17 | Career system with XP and unlocks | ✅ |
| R18 | Tutorial overlay with spotlight guidance | ✅ |
| R19 | Reference guide panel with phraseology, procedures, scoring, controls | ✅ |
| R20 | In-mission status overlay (score, time, traffic, dimensions, recent events) | ✅ |
| R21 | Auto-complete text input for typing commands (predicts callsigns + verbs) | ✅ |
| R22 | Airport selectable via CLI flag — supports any properly formatted `.airport` file | ✅ |

### 4. User Stories

- *As a player, I want to select an aircraft by clicking it on the radar or its flight strip card.*
- *As a player, I want to issue commands by clicking buttons grouped by station (GROUND/TOWER/APPROACH).*
- *As a player, I want to type commands using text input with auto-complete suggestions.*
- *As a player, I want to see aircraft respond with pilot readback after a realistic delay.*
- *As a player, I want the radar to show range rings, bearing lines, compass labels, and a sweep line.*
- *As a player, I want the airport diagram (runways, taxiways, gates, navaids) rendered on the radar.*
- *As a player, I want to see aircraft altitude labels with climb/descent indicators.*
- *As a player, I want separation violations flagged visually on the radar.*
- *As a player, I want my score to increase for successful commands and decrease for violations/missed approaches.*
- *As a player, I want a log of all ATC/pilot communications.*
- *As a player, I want the weather to affect gameplay (wind, visibility).*

### 5. Non-Functional Requirements

- **Performance:** Maintain 60 FPS on typical desktop hardware
- **Offline:** Full functionality without internet connection
- **Persistence:** No external database — session-based only
- **Extensibility:** New airports can be added by creating `.airport` JSON files
- **Testability:** 91 automated tests covering core simulation, controllers, phraseology, and scoring

---

## Part II — Game Design

### 6. Core Loop

```
  ┌──────────────────────────────────────────────────────────────────┐
  │  Briefing → Select Difficulty → START                            │
  └──────────────────────────┬───────────────────────────────────────┘
                             │
                             ▼
  ┌─────────────────────────────────────────────────────────────────────┐
  │  Main Loop (runs at 60 FPS, simulation ticks at 1 Hz)              │
  │                                                                     │
  │  1. Spawn aircraft (departures from gates, arrivals from entry pts) │
  │  2. Update aircraft positions (taxi, approach, landing, climb)      │
  │  3. Auto-transition phases (PARKED→TAXI_OUT→HOLD_SHORT→LINE_UP→   │
  │     TAKEOFF_ROLL→CLIMBING for departures; ENTERING→APPROACH→      │
  │     FINAL→LANDING→ROLLOUT→TAXI_IN→ARRIVED for arrivals)           │
  │  4. Detect separation violations between airborne aircraft         │
  │  5. Update urgency flags (untouched FINAL aircraft flash urgent)   │
  │  6. Detect DME profile deviations (approach altitude check)        │
  │  7. Detect MVA violations (terrain floor check)                    │
  │  8. Remove departed/arrived aircraft that exit the range           │
  │  9. Clamp scores to [0, 2000]                                      │
  │ 10. Process queued events (event bus)                              │
  └──────────────────────────┬───────────────────────────────────────┘
                             │
                             ├──→ [Reset] → back to Briefing
                             └──→ [Exit] → End Mission Results
```

### 7. Simulation Engine

#### 7.1 Aircraft States (Phases)

```
  DEPARTURES                              ARRIVALS
  ──────────                              ────────
  PARKED ──────────────────────────────┐
    │ TAXI command                      │
    ▼                                   │
  TAXI_OUT ─────────────────────────┐   │
    │ auto when d < hold_distance   │   │
    ▼                               │   │
  HOLD_SHORT ───────────────────┐   │   │
    │ LINE_UP_WAIT command       │   │   │
    ▼                           │   │   │
  LINE_UP ─────────────────┐    │   │   │
    │ CLEARED_TAKEOFF      │    │   │   │
    ▼                     │    │   │   │
  TAKEOFF_ROLL ───────────┤    │   │   │
    │ auto when speed ≥   │    │   │   │
    │ rotation_speed       │    │   │   │
    ▼                     ▼    ▼   ▼   ▼
  CLIMBING ← ← ← ← ← ← ← ← ← ← ← ← ←
    │ CONTACT_DEPARTURE command
    ▼
  DEPARTED (auto-removed when out of range)

  ENTERING ── auto when d < trigger_distance (8 NM)
    ▼
  APPROACH ── auto when d < final_distance (1 NM)
    ▼
  FINAL ── auto when d < threshold (100 m)
    │
    ├── if cleared_to_land → LANDING
    │    │ auto when altitude ≤ 0 AND speed ≤ 20
    │    ▼
    │  ROLLOUT → EXIT_RUNWAY → TAXI_IN → ARRIVED (auto-removed)
    │
    └── if NOT cleared_to_land → MISSED
         │ climbs to missed altitude, turns to missed heading
         │ auto-removed when out of range
```

#### 7.2 Spawning Logic

- One departure and one arrival spawn at game start (initialization)
- Subsequent spawns occur at configurable intervals (SPAWN_INTERVAL_MS: 12s/25s/45s based on difficulty)
- Departures allocate from available gates (random selection)
- Arrivals spawn at entry points defined in the `.airport` file (x, y, heading, altitude)
- Aircraft type randomized from 9 types (B738, A320, CRJ9, E175, B772, B744, A388, C172, BE20)
- Each type has: icao code, name, category (L/M/H/J), cruise speed, approach speed, rotation speed, taxi speed, climb rate, descent rate, service ceiling
- Callsign generated from airline prefix + flight number (e.g., "UAL123", "SWA1044")
- Category class (C/D) assigned per type — smaller types → C, heavy types → D

#### 7.3 Movement Physics

| Mode | Method | Speed Source |
|------|--------|-------------|
| Taxi (TAXI_OUT, TAXI_IN) | Ratio-interpolate toward target | `cleared_speed or taxi_speed` |
| Line-up (LINE_UP) | Move along runway heading at taxi speed | `taxi_speed` |
| Takeoff roll (TAKEOFF_ROLL) | Accelerate along runway heading | `min(rotation_speed × factor, speed + accel)` |
| Climb (CLIMBING) | Move along heading at increasing speed | `min(cruise_speed × factor, speed + 3)` |
| Approach (APPROACH, FINAL) | Steer toward runway centerline + threshold | `approach_speed or 200 kt` |
| Landing (LANDING) | Descend along glideslope, decelerate | `approach_speed × 0.6` |
| Rollout (ROLLOUT) | Decelerate along runway heading | `speed - 3` |
| Missed (MISSED) | Climb at missed heading, speed constant | current speed |

#### 7.4 Centerline Alignment

On approach, aircraft calculate cross-track error (XTE) from the extended runway centerline:
- XTE > 20m: steer toward a point on the centerline 500m ahead of the aircraft
- XTE ≤ 20m: lock heading to runway heading — aircraft flies straight down the runway
- This ensures aircraft land ON the runway strip, not converging on a point

#### 7.5 Glideslope

- 3° glideslope (318 ft per NM)
- Descent profile computed from DME distance to threshold
- Aircraft adjust vertical rate to follow the glideslope
- DME step-down table (minimum altitudes per DME fix) checked during approach

### 8. Controller Chain

Four controllers form a hierarchy, each responsible for specific aircraft phases:

| Controller | Phases | Frequency | Commands |
|------------|--------|-----------|----------|
| GROUND | PARKED, TAXI_OUT, TAXI_IN | 121.9 | TAXI, HOLD_SHORT, CANCEL_TAXI, SQUAWK |
| TOWER | HOLD_SHORT, LINE_UP, TAKEOFF_ROLL, CLIMBING, FINAL, LANDING, ROLLOUT | 118.1 | LINE_UP_WAIT, CLEARED_TAKEOFF, CLEARED_LAND, GO_AROUND, CONTACT_DEPARTURE, CONTACT_GROUND, EXIT_RUNWAY, SQUAWK, ALTITUDE, SPEED |
| APPROACH | ENTERING, APPROACH, MISSED | 120.7 | CLEARED_APPROACH, VECTOR, ALTITUDE, SPEED, CONTACT_TOWER |
| AREA | DEPARTED | — | (handoff only) |

The controller chain is composed per-aircraft based on current phase via `PHASE_CONTROLLER` mapping. Commands are validated by `ControllerPrivilegeValidator` before execution.

### 9. Command Input Methods

#### 9.1 Command Buttons (Right Panel)

- 16 command buttons grouped by station (GROUND 121.9, TOWER 118.1, APPROACH 124.7)
- Buttons enable/disable based on current aircraft's allowed commands for its phase
- Clicking a button immediately issues the command with default parameters
- Buttons scroll when the panel overflows (mouse wheel)

#### 9.2 Text Input (Below Radar)

- Toggle with `/` key, or click the input field
- Type callsign → auto-complete shows matching aircraft (prefix match)
- After callsign + space → auto-complete shows available command verbs
- Navigate suggestions with ↑/↓, accept with Tab or Enter
- Parse: splits text → resolves callsign → resolves verb → issues command

#### 9.3 Keyboard Shortcuts

| Key | Action |
|-----|--------|
| `/` | Toggle text input |
| Tab | Cycle selected aircraft |
| Enter | Issue selected command |
| Space | Pause/resume |
| Escape | Quit game |
| `0` | Reset viewport zoom/pan |
| `C` | Center viewport on airport |
| `+`/`-` | Zoom in/out |
| `G` | Toggle guide panel |
| `O` | Toggle mission tracker |
| `R` | Toggle ruler tool |
| `T` | Start tutorial |
| `M` | Toggle TTS mute |

### 10. Scoring System

#### 10.1 Score Events

| Event | Delta | Reason Code |
|-------|-------|-------------|
| Command issued | +5 | `command_issued` |
| Takeoff | +20 | `takeoff` |
| Landing | +30 | `landing` |
| Departure handoff | +25 | `departure_handoff` |
| Arrived at gate | +20 | `arrived_gate` |
| Missed approach | -100 | `missed_approach` |
| Separation violation | -150 | `separation_violation` |

- Starting score: 1000
- Minimum score: 0
- Maximum score: 2000
- Events stored in `score_events: list[ScoreEvent]` (max 50 entries, FIFO)
- Aircraft handled counter: incremented on takeoff + handoff

#### 10.2 Score Dimensions

| Dimension | Weight | Affected By |
|-----------|--------|-------------|
| Safety | +1/command, -40/missed, -80/separation | Commands, violations |
| Efficiency | +10/takeoff, +15/landing, +10/gate, -30/missed | Traffic flow |
| Communication | +2/command, +10/handoff | Radio work |
| Procedure | +2/command, +15/handoff | Proper clearances |
| Awareness | +1/command | Overall SA |

#### 10.3 Grade System

| Score Range | Grade |
|-------------|-------|
| ≥ 1500 | S |
| ≥ 1200 | A |
| ≥ 900 | B |
| ≥ 600 | C |
| < 600 | D |

### 11. Separation Standards

- **Lateral:** 3 NM (SEPARATION_NM = 3)
- **Vertical:** 1000 ft (SEPARATION_FT = 1000)
- Detection runs every tick on airborne aircraft (CLIMBING, ENTERING, APPROACH, FINAL, LANDING phases)
- Violations scored at -150 each with cooldown (5000ms per aircraft pair)
- Aircraft in violation shown with red circle on radar
- Urgent flag set on FINAL aircraft not cleared to land

### 12. Airport Data Structure

Airport data is loaded from `.airport` JSON files (configurable via `--airport` CLI arg, defaults to `hhas.airport`):

```json
{
  "version": 1,
  "metadata": { "icao", "iata", "name", "country", "elevation_ft", "magnetic_variation" },
  "runways": [{ "id", "true_heading", "magnetic_heading", "length", "width",
                "surface", "elevation_ft", "threshold_x/y", "end_x/y",
                "displaced_threshold_ft", "ils", "pattern", "stepdowns" }],
  "taxiways": [{ "id", "width", "surface", "nodes", "edges" }],
  "gates": [{ "id", "x", "y", "taxiway_id" }],
  "parking": [{ "id", "x", "y", "type" }],
  "frequencies": [{ "name", "frequency", "callsign" }],
  "navaids": [{ "id", "type", "frequency", "x", "y", "name" }],
  "spawn_points": [{ "id", "type", "gate_id", "x", "y", "heading", "altitude" }]
}
```

#### 12.1 Data Connectivity

| Field | Used By | Status |
|-------|---------|--------|
| Runway id, true_heading, threshold_x/y | Taxi routing, approach targeting | ✅ Connected |
| Runway ils | Rendering color (green vs gray) | ✅ Connected |
| Taxiway nodes/edges | Navigation graph | ✅ Connected |
| Gate id, x/y | Departure spawn position, taxi targets | ✅ Connected |
| Spawn point type/gate_id/coords | Departure/arrival initialization | ✅ Connected |
| Runway stepdowns | DME profile checker (<5 NM) | ✅ Connected |
| Frequencies | Phraseology (airport-driven) | ✅ Connected |
| Navaids | Radar rendering (VOR hexagon, NDB circle, ILS triangle) | ✅ Connected |
| Runway width, length, surface, pattern | Loaded but not queried by simulation | 🔌 Hook-only |
| Metadata elevation_ft | No density-altitude model | 🔌 Hook-only |
| Parking | Loaded but not used | 🔌 Hook-only |
| Runway displaced_threshold | Loaded but not used | 🔌 Hook-only |

### 13. Difficulty Presets

| Property | Easy | Medium | Hard |
|----------|------|--------|------|
| Spawn interval | 45s | 25s | 12s |
| Max aircraft | 5 | 8 | 12 |
| Wind direction | 340° | 070° | 090° |
| Wind speed | 4 kt | 8 kt | 15 kt |

### 14. Aircraft Categories & Speed Limits

| Category | Types | Max Speed (Approach) |
|----------|-------|---------------------|
| C | B738, A320, CRJ9, E175, C172, BE20 | No cap |
| D | B772, B744, A388 | 210 kt |

Category D aircraft are subject to speed limits per HHAS approach plates (210 kt outbound, 185 kt procedure turn on VOR approach).

### 15. Terrain & MVA

- Terrain MVA floor: 8800 ft MSL (from HHAS circling minima for Cat C, 1139 ft AGL)
- 4 quadrants centered on airport reference point (0, 0):
  - N (0–90°): 8800 ft
  - E (90–180°): 8800 ft
  - S (180–270°): 8800 ft
  - W (270–360°): 8800 ft
- Aircraft below MVA flagged with red "MVA!" label and radio log warning
- Ground aircraft (altitude < 100 ft) excluded from MVA check

### 16. HHAS — Asmara International Airport Data

Derived from Navigraph approach plate package (document: `docs/HHAS.pdf`).

#### Runways

| Designator | True Heading | Length | Width | ILS | Elevation |
|------------|-------------|--------|-------|-----|-----------|
| 07 | 072° | 3000 m | 45 m | Yes (110.3) | 7661 ft |
| 25 | 252° | 3000 m | 45 m | No | 7661 ft |
| 12 | 120° | 1800 m | 30 m | No | 7654 ft |
| 30 | 300° | 1800 m | 30 m | No | 7654 ft |

#### Navaids

| ID | Type | Frequency | Position |
|----|------|-----------|----------|
| IAS | ILS/DME | 110.3 | RWY 07 threshold |
| ASM | VOR/DME | 113.7 | Near field centre |
| AS | NDB | 305 kHz | Near RWY 07 |

#### Missed Approach Procedures

| Approach | Procedure |
|----------|-----------|
| ILS RWY 07 | Turn right, climb R170 D113.7 ASM to 11500 ft |
| VOR RWY 07 | Climb 076°/R256 D113.7 to ASM, turn right (max 185 kt), climb R170 to 11500 ft |
| NDB RWY 07 | At 305 AS, turn right, climb HDG 170° to 11500 ft |

#### Frequencies

| Station | Frequency | Callsign |
|---------|-----------|----------|
| ATIS | 126.4 | HHAS ATIS |
| GROUND | 121.9 | Asmara Ground |
| TOWER | 118.1 | Asmara Tower |
| APPROACH | 120.7 | Asmara Approach |
| Director | 129.5 | Asmara Director |

#### Approach Step-downs (ILS RWY 07)

| DME (IAS) | Altitude (MSL) |
|-----------|----------------|
| D12.0 | 9800 ft |
| D7.0 | 9210 ft |
| D5.0 | 8910 ft |
| D2.0 | 8310 ft |
| MAPt | 8170 ft |

### 17. Phraseology Engine

Generates ATC and pilot phraseology for all 16 command types. Each generator function produces `{"atc": str, "pilot": str, "station": str}`.

Example outputs:
- `TAXI`: "UNITED 123, taxi to runway 07 via A, wind 340 at 4, squawk 4521" / "UNITED 123, wilco"
- `CLEARED_LAND`: "SPEEDBIRD 117, runway 25, cleared to land, wind 070 at 8"
- `VECTOR`: "DELTA 504, turn left heading TWO SEVEN ZERO, traffic"
- `ALTITUDE`: "AMERICAN 900, climb and maintain ONE ZERO THOUSAND"

Frequencies in CONTACT_TOWER and CONTACT_GROUND commands are read from the airport's frequency data (falls back to hardcoded 118.7 / 121.9 if airport data unavailable).

### 18. UI Layout

```
  ┌─────────────────────────────────────────────────────────────────────┐
  │ 0,0                   STATUS BAR (1280×36)                   1280,0 │
  ├────────────┬───────────────────────────────────┬────────────────────┤
  │  FLIGHT    │          RADAR                     │   COMMAND          │
  │  STRIPS    │     (range rings, aircraft,        │   PANEL            │
  │  (200×436) │      runways, navaids)             │   (280×436)        │
  │            │     (800×436)                      │   + ZOOM BTNS      │
  │            │                                    │                    │
  ├────────────┴────────────────────────────────────┴────────────────────┤
  │            COMMAND INPUT (800×28)                                    │
  ├──────────────────────────────────────────────────────────────────────┤
  │  0,500                  RADIO LOG (1280×220)                  1280,720 │
  └──────────────────────────────────────────────────────────────────────┘
```

#### 18.1 Interactive Zones

| Zone | Interaction |
|------|-------------|
| Status bar | Pause/resume/reset buttons, status display |
| Flight strips | Click to select aircraft, scroll |
| Radar | Click aircraft to select, drag to pan, wheel to zoom |
| Command panel | Click command buttons, wheel to scroll |
| Command input | Click to focus, type commands, auto-complete dropdown |
| Radio log | Scrollable event log |
| Zoom buttons | +/−/0/C click to zoom/center |

#### 18.2 Overlay Screens

| Screen | Trigger | Description |
|--------|---------|-------------|
| Briefing | Game start | Difficulty selection, airport info, controls reference |
| End Mission | Game end / reset | Letter grade, score breakdown, dimension bars, REPLAY/EXIT |
| Tutorial | 'T' key | Spotlight-guided interactive walkthrough (9 steps) |
| Guide Panel | 'G' key | Collapsible reference (phraseology, procedures, scoring, controls) |
| Mission Tracker | 'O' key | Score, time, traffic, dimensions, recent events |

#### 18.3 Color System

```
  Theme: dark (#0E1116 background)
  
  Backgrounds:    bg_primary #0E1116, bg_surface #161B22, bg_card #1D2430
  Accents:        primary #34D399, blue #60A5FA, amber #FBBF24, red #F87171
  Aircraft:       departure #39D98A, arrival #5CBFFF, urgent #FFAA33, violation #FF3232
  Text:           primary #F3F4F6, secondary #94A3B8, muted #64748B, disabled #646464
  Log speakers:   ATC #39D98A, PILOT #5CBFFF, SYSTEM #B4B4B4, CRITICAL #FF4646
```

### 19. Event System

| Event Type | Trigger |
|------------|---------|
| COMMAND_ISSUED | Any command executed |
| COMMAND_REJECTED | Validation failure |
| PHASE_CHANGED | Aircraft phase transition |
| TAKEOFF | Aircraft rotates |
| LANDING | Aircraft touches down |
| MISSED_APPROACH | Go-around triggered |
| ARRIVED_GATE | Aircraft reaches gate |
| HANDOFF | Controller handoff |
| SEPARATION_VIOLATION | Loss of separation |
| AIRCRAFT_SPAWNED | New aircraft enters |
| AIRCRAFT_REMOVED | Aircraft exits airspace |
| SCORE_CHANGED | Score event recorded |
| SIM_PAUSED / SIM_RESUMED | Pause toggle |
| SIM_RESET | Game reset |

Events are emitted via `EventBus` with optional queuing (`immediate=False`). Queued events are flushed at the end of each simulation tick by `EventSystem(order=999)`.

### 20. Mission & Career System

#### 20.1 Missions

- Missions are chains of objectives (e.g., "Issue 3 commands", "Land 2 arrivals")
- Objectives check against `GameState` each tick
- When all objectives met → mission completed → next mission in chain triggered
- Mission state: INACTIVE → ACTIVE → COMPLETED

#### 20.2 Career

- Tracks XP across sessions (persisted in `CareerState`)
- XP earned from score events via `xp_for_score_event(reason)` mapping
- Levels unlocked at XP thresholds (computed from `xp / 100`)
- Currently no gameplay impact from career level (hook for future unlocks)

### 21. Audio

| Feature | Implementation |
|---------|---------------|
| TTS | Speech synthesis via `gTTS` + `pygame.mixer` playback |
| Queue | Max 20 messages in TTS queue |
| Beeps | Roger beep (1000 Hz, 90ms), alert (800+600 Hz, 150ms), success (523+659 Hz) |
| Mute | 'M' key toggles mute |

### 22. Audio Cue Reference

| Cue | Trigger | Sound |
|-----|---------|-------|
| Roger beep | Command issued | 1000 Hz, 90 ms |
| Alert | Separation violation | 800+600 Hz, 150 ms sweep |
| Success chime | Aircraft handled milestone | 523+659 Hz |

### 23. Difficulty Scaling

Each difficulty preset copies its parameters directly into the `tick` module's constants (monkey-patching pattern):

```python
_tick_mod.SPAWN_INTERVAL_MS = preset.spawn_interval_ms
_tick_mod.MAX_CONCURRENT_AIRCRAFT = preset.max_aircraft
```

This means the active game's spawn timing and traffic cap are set at session start and remain fixed for that session.

---

## Appendix: Verification Checklist

| Check | Command | Expected |
|-------|---------|----------|
| All tests pass | `pytest tests/ -q` | ≥ 91 passed |
| Import works | `python -c "from atc_aman_game.main import main; print('OK')"` | OK |
| Game launches | `atc-aman-game --skip-briefing` | Window opens, no crash |
| Custom airport | `atc-aman-game --airport path/to/file.airport` | Loads specified airport |
| Airborne aircraft | Must appear on radar within 30s | 2+ aircraft present |
| Command buttons | Click an aircraft → buttons enable | Commands issue correctly |
| Text input | Press `/` → type callsign → auto-complete | Command parses and issues |
| Zoom | Scroll on radar | Zoom in/out centered on cursor |
| Select | Click aircraft on radar | Selection halo appears |
| Score | Issue commands | Score increments |

---

*Document generated from codebase analysis — 2026-07-02*
