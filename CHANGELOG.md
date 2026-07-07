# Changelog

All notable changes to ATC Aman are documented here.
Format loosely follows [Keep a Changelog](https://keepachangelog.com/); the
project adheres to [Semantic Versioning](https://semver.org/).

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
