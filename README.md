# ATC Aman

**A single-player, real-time air traffic control simulation for Asmara
International Airport (HHAS), Eritrea.**

ATC Aman is a hobby project, developed for my only brother. You sit in the
tower at Asmara and work arrivals and departures across three controller
stations — Ground, Tower, and Approach — by clicking aircraft on the radar
and issuing commands, exactly the way a real shift never quite goes.

---

## ⚠️ Simulation only

ATC Aman is a game. It is **not** suitable for real-world aviation,
navigation, flight planning, or ATC training. Procedures, frequencies, and
airport data are simplified and may be inaccurate or out of date.

## 🔒 Privacy

> ## **NO COLLECTION OF DATA. NO NETWORK CALLS.**
>
> **This application collects no personal data, contains no telemetry or
> analytics, and makes no network connections — ever. All progress (scores,
> career XP) is stored locally on your machine and never leaves it.**

---

## Features

- **Real-time simulation** of arrivals and departures at HHAS: full flight
  lifecycle from spawn through approach, landing, taxi, gate — or taxi-out,
  takeoff, and departure handoff. Includes helicopter support (five types,
  vertical liftoff/land at helipads) and authored ground paths (runway exits,
  rollout turn-off, visible taxi-in to gate)
- **Three controller stations** (Ground / Tower / Approach) with
  station-scoped command sets and ICAO phraseology, spoken ATC + pilot
  readbacks (offline text-to-speech, captions always available)
- **Play the stations you want** — hand any station to a deterministic AI
  controller and keep the ones you enjoy; only your own aircraft are scored
- **PixiJS radar scope** with the real airport diagram, range rings, data
  blocks (auto-positioned to avoid overlap), trails, velocity vectors, zoom/pan,
  and a ruler tool. Includes conflict-prediction advisory (amber ring and
  `PC {s}s` tag) for aircraft that will lose separation within 3 minutes
- **Scoring across five dimensions** (Safety, Efficiency, Communication,
  Procedure, Awareness) with S–D grades and a persistent career (XP, levels)
- **Tutorials** covering UI basics, ATC fundamentals, incident handling, and
  each station, plus an in-game spotlight walkthrough
- **Difficulty presets**, pause menu, sim-rate controls (1× / 2× / 4× via
  RATE buttons or `1` / `2` / `3` keys), keyboard shortcuts, and a command
  text input for purists
- **Procedural emergencies** — low-fuel arrivals, where the pilot calls PAN PAN
  as the fuel clock runs down and MAYDAY at zero, and NORDO radio failures,
  where an aircraft stops accepting clearances and flies its last one until
  contact returns

## Controls (essentials)

| Input | Action |
|-------|--------|
| Click aircraft | Select |
| Escape | Deselect aircraft |
| Tab | Cycle aircraft |
| Command buttons (GND/TWR/APP tabs) | Issue clearances |
| `/` | Focus text command input |
| Space | Pause / pause menu |
| M | Mute audio |
| C | Center radar viewport |
| R | Ruler tool |
| G / O / T | Guide / mission tracker / tutorial |
| Wheel / `+` / `-` | Radar zoom in / out |
| `0` | Reset viewport |
| `1` / `2` / `3` | Sim rate 1× / 2× / 4× |

## Running from source

```bash
npm install
npm run dev        # development (Vite HMR + Electron)
npm test           # test suite (Vitest)
npm run package    # build a distributable into release/
```

Windows installer from Linux: `npm run build && npx electron-builder --win --x64`

## Tech

Electron 43 · TypeScript · React 19 · PixiJS 8 · Vite 6 · Vitest

## License

[MIT](LICENSE) © 2026 Nahom Daniel Negash.
Bundled open-source components are listed in
[THIRD-PARTY-NOTICES.txt](THIRD-PARTY-NOTICES.txt).

## Authors

- **Nahom Daniel Negash**
- **Claude (Anthropic)** — AI pair programmer
