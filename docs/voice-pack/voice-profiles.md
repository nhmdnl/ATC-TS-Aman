# ATC Aman — Voice Profiles (Voicebox Generation Brief)

Two named voices drive the radio in ATC Aman at Asmara Tower (HHAS). This file is the
**generation brief** for voicebox: each profile gives a plain-language voice description
(what the model should sound like) and a personality (how the character speaks), plus a
one-line synthesis prompt you can paste straight into a voicebox profile.

Recording/loudness spec, token list, and radio-effect chain live in
[`line-sheet.md`](line-sheet.md) — this file only defines the two characters. Keep the
adjectives here consistent with the **Cadence** row of the line-sheet.

---

## TOWER — "Esrom Dawit"

The controller. The player *is* the tower, but Esrom is the voice the AI stations
(GND/TWR/APP/AREA) speak with when the sim reads back its own clearances, and the reference
timbre for all `atc_*` tokens.

### Voice description
- **Gender / age:** Male, early-to-mid 40s.
- **Accent:** Eritrean English — Tigrinya first language, clean international-aviation English.
  Lightly rolled *r*, crisp consonants, even vowels. Not American, not RP; East-African
  professional. Never a caricature.
- **Pitch:** Medium-low, steady. Little pitch movement — authority comes from evenness, not
  volume.
- **Pace:** Measured, slightly clipped syllables. Deliberate word spacing so numbers land
  cleanly through a radio. Commas are short breaths, not full stops.
- **Timbre:** Warm but dry, a little gravel in the low end. Reads well after the 1500 Hz
  bandpass radio effect.
- **Delivery:** Full ICAO phonetics — "tree", "fife", "niner". Flat terminal intonation on
  instructions (a command, not a question). Zero filler, zero hesitation.

### Personality
Unflappable and economical. Esrom has worked this tower for fifteen years and has never once
sounded surprised. He is courteous but never chatty — every transmission is the minimum words
to be unambiguous. Under pressure he gets *slower and quieter*, not faster and louder; a
tight situation is signalled by a fractionally harder edge on the consonants, nothing more.
Quiet dry humour exists but almost never reaches the radio. Trust and calm are the product he
sells. When he repeats himself (`go around, I say again, go around`) the second time is firmer,
not panicked.

### Voicebox synthesis prompt
> Male Eritrean air traffic controller, early 40s, medium-low steady voice, warm but dry with
> slight gravel. Clean East-African aviation English, lightly rolled r, crisp consonants.
> Measured and deliberate, calm authority, flat unhurried terminal intonation. Speaks in short
> radio transmissions with ICAO phonetics; never rushed, never raised.

---

## PILOT — "Amanuel Daniel"

The generic airline flight-crew voice: every aircraft's readbacks and pilot calls
(`pil_*` tokens), across all the airlines in the sim (Eritrean, Ethiopian, Emirates, etc.).
One voice stands in for all of them, so it must read as a competent line pilot rather than any
single nationality.

### Voice description
- **Gender / age:** Male, early 30s.
- **Accent:** Neutral international airline English with a faint East-African colour — enough to
  sit naturally at Asmara, not so much it reads as a specific carrier. Clearer/lighter than
  Esrom.
- **Pitch:** Medium, a touch brighter than the controller. A little natural rise-and-fall — he
  sounds like a person, not a machine.
- **Pace:** Conversational, slightly faster than the tower. Readbacks are fluent and relaxed,
  the confidence of routine — but numbers stay distinct.
- **Timbre:** Lighter, cleaner, a little breathier. Cockpit-mic close, calm.
- **Delivery:** Plain English digits ("three", "five") **except** he keeps "niner" — both sides
  say niner. Slight warmth/lift at the end of a friendly call ("with you on final"); crisp and
  flat on a pure readback.

### Personality
Easygoing and quietly competent. Amanuel has thousands of hours and treats the radio like a
handshake — polite, brief, unbothered. He reads back cleanly the first time so he rarely gets
asked twice. A pushback or startup request has a hint of warmth ("Asmara Ground, good
morning"); an urgent readback (`going around`) is prompt and businesslike with no drama. He
never argues with a clearance and never over-talks. Where Esrom is deliberate authority,
Amanuel is relaxed reliability — the two should be instantly distinguishable on the radio: one
lower/slower/drier, one lighter/quicker/warmer.

### Voicebox synthesis prompt
> Male airline pilot, early 30s, medium bright voice, light and clean with a faint East-African
> lilt over neutral international aviation English. Relaxed and conversational, slightly quick,
> confident and friendly. Fluent radio readbacks with natural intonation; polite, brief,
> never dramatic.

---

## Keeping the two apart

The whole point of two voices is instant separation on a mono radio channel. If a listener
can't tell tower from aircraft in one transmission, the profiles have drifted together.

| Axis | Tower (Esrom) | Pilot (Amanuel) |
|------|---------------|------------------|
| Pitch | lower | higher |
| Pace | slower, clipped | quicker, fluent |
| Tone | dry, authoritative | light, friendly |
| Digits | ICAO (tree/fife/niner) | plain + niner |
| Under pressure | quieter, harder edge | prompt, businesslike |

Existing voicebox profiles carry these names ("Esrom Dawit" = ATC, "Amanuel Daniel" = pilot).
Update those profiles to match this brief rather than creating new ones — and make sure the
language is set to **English** on both.
