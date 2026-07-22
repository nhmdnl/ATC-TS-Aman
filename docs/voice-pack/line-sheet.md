# T-010 Voice Pack — Line Sheet & Implementation Plan

Concatenative voice pack for ATC Aman. Two voices: **ATC** (tower controller, slightly formal,
crisp) and **PILOT** (airline pilot, relaxed, natural). All tokens are phrase chunks recorded as
WAV, chained at runtime. Digits are shared atoms; instruction text is recorded as complete chunks
to preserve natural prosody.

---

## Recording Guidelines

| Setting | Value |
|---------|-------|
| Format | WAV, 44.1 kHz, 16-bit mono |
| Room | Quiet; no reverb or background noise |
| Silence | ≤ 50 ms before first word, ≤ 100 ms after last word (trim aggressively) |
| Gain | Peaks at −6 dBFS; consistent across all takes |
| Cadence | ATC voice: measured, slightly clipped syllables. Pilot voice: conversational, slightly faster |
| Digits | ATC/ICAO phonetics: 3 = "tree", 5 = "fife", 9 = "niner". Normal English for the pilot voice is fine |

Record each cell in the **"Say"** column verbatim. Natural commas = slight pause, not a full stop.

---

## ATC Voice Tokens (`assets/voice/atc/`)

### Digits & Numeric Atoms

| Filename | Say | Notes |
|----------|-----|-------|
| `atc_d_0.wav` | "zero" | ICAO |
| `atc_d_1.wav` | "one" | |
| `atc_d_2.wav` | "two" | |
| `atc_d_3.wav` | "tree" | ICAO — not "three" |
| `atc_d_4.wav` | "four" | |
| `atc_d_5.wav` | "fife" | ICAO — not "five" |
| `atc_d_6.wav` | "six" | |
| `atc_d_7.wav` | "seven" | |
| `atc_d_8.wav` | "eight" | |
| `atc_d_9.wav` | "niner" | ICAO — not "nine" |
| `atc_w_hundred.wav` | "hundred" | altitude component |
| `atc_w_thousand.wav` | "thousand" | altitude component |
| `atc_w_flight_level.wav` | "flight level" | before FL digits |
| `atc_w_decimal.wav` | "decimal" | frequency: "one two tree decimal fife" |
| `atc_w_at.wav` | "at" | wind: "[dir] at [spd]" |
| `atc_w_knots.wav` | "knots" | after speed digits |
| `atc_w_miles.wav` | "miles" | traffic advisory: "[cs], [N] miles" |
| `atc_w_runway.wav` | "runway" | standalone, before runway ID digits |

### Instruction Phrase Chunks

| Filename | Say | Used In |
|----------|-----|---------|
| `atc_p_pushback_approved.wav` | "pushback approved, expect runway" | PUSHBACK_APPROVED |
| `atc_p_startup_approved.wav` | "startup approved, expect runway" | STARTUP_APPROVED |
| `atc_p_startup_approved_short.wav` | "startup approved" | STARTUP_APPROVED (no runway param) |
| `atc_p_standby.wav` | "standby" | STANDBY |
| `atc_p_taxi_to_runway.wav` | "taxi to runway" | TAXI |
| `atc_p_hold_short_runway.wav` | "hold short runway" | HOLD_SHORT |
| `atc_p_cross_runway.wav` | "cross runway" | CROSS_RUNWAY |
| `atc_p_continue_taxi.wav` | "continue taxi" | CONTINUE_TAXI |
| `atc_p_line_up_and_wait.wav` | "line up and wait" | LINE_UP_WAIT (after runway ID) |
| `atc_p_traffic_on_final.wav` | "traffic on final" | LINE_UP_WAIT advisory |
| `atc_p_cleared_for_takeoff.wav` | "cleared for takeoff" | CLEARED_TAKEOFF (after runway ID) |
| `atc_p_wind.wav` | "wind" | CLEARED_TAKEOFF, WIND |
| `atc_p_passing.wav` | "passing" | CLEARED_TAKEOFF ("passing ten thousand") |
| `atc_p_contact_departure.wav` | "contact departure" | CLEARED_TAKEOFF, CONTACT_DEPARTURE |
| `atc_p_cleared_to_land.wav` | "cleared to land" | CLEARED_LAND (after runway ID) |
| `atc_p_cleared_ils_approach.wav` | "cleared ILS approach runway" | CLEARED_APPROACH (IMC/ILS) |
| `atc_p_cleared_visual_approach.wav` | "cleared visual approach runway" | CLEARED_APPROACH (VMC) |
| `atc_p_fly_heading.wav` | "fly heading" | VECTOR |
| `atc_p_climb_and_maintain.wav` | "climb and maintain" | ALTITUDE |
| `atc_p_maintain.wav` | "maintain" | SPEED (before speed digits) |
| `atc_p_squawk.wav` | "squawk" | SQUAWK |
| `atc_p_contact_tower.wav` | "contact tower" | CONTACT_TOWER |
| `atc_p_contact_ground.wav` | "contact ground" | CONTACT_GROUND |
| `atc_p_go_around.wav` | "go around, I say again, go around" | GO_AROUND |
| `atc_p_exit_runway_when_able.wav` | "exit runway when able" | EXIT_RUNWAY |
| `atc_p_hold_position.wav` | "hold position" | CANCEL_TAXI |
| `atc_p_report_heading.wav` | "report heading" | REPORT heading |
| `atc_p_report_airspeed.wav` | "report airspeed" | REPORT airspeed |
| `atc_p_report_position.wav` | "report position" | REPORT position |

### Airline Callsign Names (ATC voice)

| Filename | Say | ICAO prefix |
|----------|-----|-------------|
| `atc_airline_ere.wav` | "Eritrean" | ERE |
| `atc_airline_eth.wav` | "Ethiopian" | ETH |
| `atc_airline_uae.wav` | "Emirates" | UAE |
| `atc_airline_msr.wav` | "Egypt Air" | MSR |
| `atc_airline_kqa.wav` | "Kenya" | KQA |
| `atc_airline_fdb.wav` | "flydubai" | FDB |
| `atc_airline_thy.wav` | "Turkish" | THY |
| `atc_airline_sdv.wav` | "Israir" | SDV |

**ATC voice total: 56 tokens**

---

## Pilot Voice Tokens (`assets/voice/pilot/`)

### Digits & Numeric Atoms

| Filename | Say | Notes |
|----------|-----|-------|
| `pil_d_0.wav` | "zero" | standard English fine for pilot |
| `pil_d_1.wav` | "one" | |
| `pil_d_2.wav` | "two" | |
| `pil_d_3.wav` | "three" | pilot can say "three" (not "tree") |
| `pil_d_4.wav` | "four" | |
| `pil_d_5.wav` | "five" | |
| `pil_d_6.wav` | "six" | |
| `pil_d_7.wav` | "seven" | |
| `pil_d_8.wav` | "eight" | |
| `pil_d_9.wav` | "niner" | keep "niner" — both sides use it |
| `pil_w_hundred.wav` | "hundred" | |
| `pil_w_thousand.wav` | "thousand" | |
| `pil_w_flight_level.wav` | "flight level" | |
| `pil_w_decimal.wav` | "decimal" | |
| `pil_w_at.wav` | "at" | |
| `pil_w_knots.wav` | "knots" | |
| `pil_w_miles.wav` | "miles" | |
| `pil_w_runway.wav` | "runway" | |

### Readback Phrase Chunks

| Filename | Say | Readback for |
|----------|-----|--------------|
| `pil_p_pushback_approved_expecting_runway.wav` | "pushback approved, expecting runway" | PUSHBACK_APPROVED |
| `pil_p_startup_approved.wav` | "startup approved" | STARTUP_APPROVED |
| `pil_p_standby.wav` | "standby" | STANDBY |
| `pil_p_taxi_to_runway.wav` | "taxi to runway" | TAXI |
| `pil_p_hold_short_runway.wav` | "hold short runway" | HOLD_SHORT |
| `pil_p_crossing_runway.wav` | "crossing runway" | CROSS_RUNWAY |
| `pil_p_continue_taxi.wav` | "continue taxi" | CONTINUE_TAXI |
| `pil_p_line_up_and_wait_runway.wav` | "line up and wait runway" | LINE_UP_WAIT |
| `pil_p_cleared_for_takeoff_runway.wav` | "cleared for takeoff runway" | CLEARED_TAKEOFF |
| `pil_p_cleared_to_land_runway.wav` | "cleared to land runway" | CLEARED_LAND |
| `pil_p_cleared_ils_approach_runway.wav` | "cleared ILS approach runway" | CLEARED_APPROACH ILS |
| `pil_p_cleared_visual_approach_runway.wav` | "cleared visual approach runway" | CLEARED_APPROACH visual |
| `pil_p_heading.wav` | "heading" | VECTOR readback (before heading digits) |
| `pil_p_climb_and_maintain.wav` | "climb and maintain" | ALTITUDE |
| `pil_p_maintain.wav` | "maintain" | SPEED |
| `pil_p_squawk.wav` | "squawk" | SQUAWK |
| `pil_p_contact_departure.wav` | "contact departure" | CONTACT_DEPARTURE |
| `pil_p_contact_tower.wav` | "contact tower" | CONTACT_TOWER |
| `pil_p_contact_ground.wav` | "contact ground" | CONTACT_GROUND |
| `pil_p_going_around.wav` | "going around" | GO_AROUND |
| `pil_p_exit_runway_when_able.wav` | "exit runway when able" | EXIT_RUNWAY |
| `pil_p_holding_position.wav` | "holding position" | CANCEL_TAXI |
| `pil_p_airspeed.wav` | "airspeed" | REPORT airspeed (before speed digits) |
| `pil_p_is.wav` | "is" | REPORT position: "[cs] is [N] miles…" |
| `pil_p_miles_from_the_field.wav` | "miles from the field" | REPORT position (after dist digits) |
| `pil_p_wind.wav` | "wind" | WIND readback |

### Pilot Call Phrase Chunks

| Filename | Say | Used In |
|----------|-----|---------|
| `pil_pc_asmara.wav` | "Asmara" | all pilot calls (airport name) |
| `pil_pc_ground.wav` | "Ground" | calling GND station |
| `pil_pc_tower.wav` | "Tower" | calling TWR station |
| `pil_pc_with_you_on_final_runway.wav` | "with you on final, runway" | WITH_YOU_FINAL call |
| `pil_pc_at_gate.wav` | "at gate" | REQUEST_PUSHBACK |
| `pil_pc_request_pushback_expecting_runway.wav` | "request pushback, expecting runway" | REQUEST_PUSHBACK |
| `pil_pc_request_startup_expecting_runway.wav` | "request startup, expecting runway" | REQUEST_STARTUP |
| `pil_pc_holding_short_runway.wav` | "holding short runway" | REQUEST_CROSSING |
| `pil_pc_request_crossing.wav` | "request crossing" | REQUEST_CROSSING |
| `pil_pc_vacated_request_taxi_to_terminal.wav` | "vacated, request taxi to terminal" | VACATED_REQUEST_TAXI |

### Gate Identifiers (pilot voice)

| Filename | Say | Gate |
|----------|-----|------|
| `pil_gate_g1.wav` | "Golf one" | G1 |
| `pil_gate_g2.wav` | "Golf two" | G2 |
| `pil_gate_g3.wav` | "Golf three" | G3 |
| `pil_gate_g4.wav` | "Golf four" | G4 |
| `pil_gate_g5.wav` | "Golf five" | G5 |

### Airline Callsign Names (Pilot voice)

| Filename | Say | ICAO prefix |
|----------|-----|-------------|
| `pil_airline_ere.wav` | "Eritrean" | ERE |
| `pil_airline_eth.wav` | "Ethiopian" | ETH |
| `pil_airline_uae.wav` | "Emirates" | UAE |
| `pil_airline_msr.wav` | "Egypt Air" | MSR |
| `pil_airline_kqa.wav` | "Kenya" | KQA |
| `pil_airline_fdb.wav` | "flydubai" | FDB |
| `pil_airline_thy.wav` | "Turkish" | THY |
| `pil_airline_sdv.wav` | "Israir" | SDV |

**Pilot voice total: 67 tokens**

**Grand total: 123 tokens across both voices**

---

## Assembly Rules (Runtime Token Sequences)

The playback engine chains these tokens in order. `[comma]` = 80 ms gap inserted by the engine.

### ATC Phrases

**Callsign prefix** (all commands):
```
[atc_airline_XXX] [atc_d_N] [atc_d_N] [atc_d_N] [comma]
```

**PUSHBACK_APPROVED:**
```
[callsign] [atc_p_pushback_approved] [atc_w_runway] [atc_d_N] [atc_d_N]
```

**TAXI:**
```
[callsign] [atc_p_taxi_to_runway] [atc_d_N] [atc_d_N]
```

**LINE_UP_WAIT** (no traffic):
```
[callsign] [atc_w_runway] [atc_d_N] [atc_d_N] [comma] [atc_p_line_up_and_wait]
```

**LINE_UP_WAIT** (with traffic on final):
```
[callsign] [atc_w_runway] [atc_d_N] [atc_d_N] [comma] [atc_p_line_up_and_wait] [comma]
[atc_p_traffic_on_final] [comma] [atc_airline_XXX] [atc_d_N]... [comma] [atc_d_N] [atc_w_miles]
```

**CLEARED_TAKEOFF:**
```
[callsign] [atc_w_runway] [atc_d_N] [atc_d_N] [comma]
[atc_p_cleared_for_takeoff] [comma]
[atc_p_wind] [atc_d_N] [atc_d_N] [atc_d_N] [atc_w_at] [atc_d_N] [atc_d_N] [atc_w_knots] [comma]
[atc_p_passing] [altitude_tokens] [atc_p_contact_departure]
```

**VECTOR:**
```
[callsign] [atc_p_fly_heading] [atc_d_N] [atc_d_N] [atc_d_N]
```

**ALTITUDE:**
```
[callsign] [atc_p_climb_and_maintain] [altitude_tokens]
```

### Altitude Token Assembly
```
< 18000 ft: [atc_d_N]... [atc_w_thousand] (e.g. "one thousand" = [atc_d_1] [atc_w_thousand])
            with hundreds: [atc_d_N]... [atc_w_thousand] [atc_d_N] [atc_w_hundred]
≥ FL180:    [atc_w_flight_level] [atc_d_N] [atc_d_N] [atc_d_N]
```

### Pilot Readbacks

**CLEARED_TAKEOFF readback:**
```
[pil_p_cleared_for_takeoff_runway] [pil_d_N] [pil_d_N] [comma] [callsign]
```

**WITH_YOU_FINAL pilot call:**
```
[pil_pc_asmara] [pil_pc_tower] [comma] [pil_airline_XXX] [pil_d_N]... [comma]
[pil_pc_with_you_on_final_runway] [pil_d_N] [pil_d_N]
```

**REQUEST_PUSHBACK pilot call:**
```
[pil_pc_asmara] [pil_pc_ground] [comma] [pil_airline_XXX] [pil_d_N]... [comma]
[pil_pc_at_gate] [pil_gate_gN] [comma]
[pil_pc_request_pushback_expecting_runway] [pil_d_N] [pil_d_N]
```

---

## Implementation Plan

### Phase A — Line sheet (now complete)
Output: this file. Unblocks the user recording session.

### Phase B — User records assets
Deliver: `assets/voice/atc/*.wav` and `assets/voice/pilot/*.wav` (123 files).  
Tip: record in one session per voice for consistent tone. Use Audacity; normalize each file to
−6 dBFS, silence-trim to spec, export as WAV 44.1 kHz/16-bit mono.

### Phase C — Token engine (`src/state/useAudio.ts` + new file `src/engine/voice-tokenizer.ts`)

**`src/engine/voice-tokenizer.ts`** (new):
- `tokenize(text: string, voice: 'atc' | 'pilot'): string[]` — converts a phraseology output
  string to an ordered list of token filenames. Uses the assembly rules above.
- `callsignTokens(callsign: string, voice: 'atc' | 'pilot'): string[]` — splits e.g. `"ETH401"`
  → `['atc_airline_eth', 'atc_d_4', 'atc_d_0', 'atc_d_1']`.
- `altitudeTokens(ft: number, voice: 'atc' | 'pilot'): string[]` — converts altitude integer
  to token sequence per the assembly rules.

**`src/state/useAudio.ts`** changes:
- Load manifest `assets/voice/manifest.json` on init; pre-buffer all found WAV files into an
  `AudioBuffer` map keyed by token filename.
- Replace `speak(text, voice)` TTS calls with `playTokenChain(tokens: string[], voice)` which
  chains `AudioBufferSourceNode`s with an 80 ms gap between tokens.
- Web Speech fallback: if a token filename is not in the buffer map, fall back to `speechSynthesis`
  for that message (one fallback per full utterance, not per token).
- Radio effect: wrap each `AudioBufferSourceNode` output through:
  `BiquadFilter(bandpass, 1500 Hz, Q=0.7)` → `DynamicsCompressor` → `GainNode(-3dB)`.
  Apply a low-level noise `OscillatorNode` (+`WaveShaperNode` for static texture) at −42 dBFS.

**`assets/voice/manifest.json`** (generated by Claude after Phase B):
```json
{
  "version": 1,
  "tokens": {
    "atc_d_0": "voice/atc/atc_d_0.wav",
    ...
  }
}
```

### Phase D — Integration pass
- Audit all `generatePhraseology()` output paths → verify `tokenize()` produces valid chains.
- Smoke-test with a real recording session (even 10 tokens is enough to verify chain + radio effect).
- Merge to main, tag v2.0.0.

---

## File Layout

```
assets/
  voice/
    atc/          ← 56 WAV files
    pilot/        ← 67 WAV files
    manifest.json ← generated after recording
src/
  engine/
    voice-tokenizer.ts   ← new (Phase C)
  state/
    useAudio.ts          ← updated (Phase C)
docs/
  voice-pack/
    line-sheet.md        ← this file
```
