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
  takeoff, and departure handoff
- **Three controller stations** (Ground / Tower / Approach) with
  station-scoped command sets and ICAO phraseology, spoken ATC + pilot
  readbacks (offline text-to-speech, captions always available)
- **Play the stations you want** — hand any station to a deterministic AI
  controller and keep the ones you enjoy; only your own aircraft are scored
- **PixiJS radar scope** with the real airport diagram, range rings, data
  blocks, trails, zoom/pan, and a ruler tool
- **Scoring across five dimensions** (Safety, Efficiency, Communication,
  Procedure, Awareness) with S–D grades and a persistent career (XP, levels)
- **Tutorials** covering UI basics, ATC fundamentals, incident handling, and
  each station, plus an in-game spotlight walkthrough
- **Difficulty presets**, pause menu, keyboard shortcuts, and a command
  text input for purists

## Controls (essentials)

| Input | Action |
|-------|--------|
| Click aircraft | Select |
| Command buttons (GND/TWR/APP tabs) | Issue clearances |
| `/` | Focus text command input |
| Space | Pause / pause menu |
| Tab | Cycle aircraft |
| M | Mute audio |
| R | Ruler tool |
| G / O / T | Guide / mission tracker / tutorial |
| Wheel / +/- | Radar zoom |

## Running from source

```bash
npm install
npm run dev        # development (Vite HMR + Electron)
npm test           # test suite (Vitest)
npm run package    # build a distributable into release/
```

Windows installer from Linux: `npm run build && npx electron-builder --win --x64`

## Tech

Electron 35 · TypeScript · React 19 · PixiJS 8 · Vite 6 · Vitest

## License

[MIT](LICENSE) © 2026 Nahom Daniel Negash.
Bundled open-source components are listed in
[THIRD-PARTY-NOTICES.txt](THIRD-PARTY-NOTICES.txt).

## Authors

- **Nahom Daniel Negash**
- **Claude (Anthropic)** — AI pair programmer
