# Product

## Register

product

## Users

A single player who takes the role of the tower/approach controller at Asmara
International (HHAS) for a self-contained session (briefing → live traffic →
end-of-session grade). They're playing on a desktop, likely with prior
interest in aviation/ATC, and split attention between the radar and the
command panel/flight strips while managing several aircraft in real time.
The job to be done is moment-to-moment traffic management: read the scope,
decide a clearance, issue it, watch it play out — repeated under time
pressure for the length of a session.

## Product Purpose

ATC Aman is a real-time ATC simulation of a single airport (HHAS), covering
the full loop from spawn to handoff/gate arrival, with scoring across five
dimensions and session-based grading. Success looks like a session that
feels like operating real radar/tower equipment: the player trusts the
scope's readings, understands aircraft state at a glance, and never has to
fight the UI to issue a clearance.

## Brand Personality

Modern radar console. Professional, technical, precise — practical UX built
for an aerodrome control operator, not a mobile game. Information density
and instrument-grade legibility carry the feel; decoration does not.
Explicitly not "gamey": no cartoon-rounded buttons, no bright saturated
palette, no drop-shadow-everywhere affordances.

## Anti-references

No specific named references — apply real-world ATC/radar scope conventions
(bearing rings, labeled range rings, leader-line datablocks) as the default
grammar, and avoid generic dashboard/game UI clichés (side-stripe accent
borders, ad hoc per-component color values, ungrounded card grids).

## Design Principles

- **Instrument-grade clarity** — every element on the radar should read like
  it belongs on real radar/tower equipment (bearing, range, aircraft state),
  not like a debug overlay with colored dots.
- **Function drives form** — the "professional" feel comes from precision and
  information density, not decoration; add chrome only where it encodes
  real data (heading ring, range labels, wind).
- **One token source** — visual values (color, spacing) live in the shared
  constants, not duplicated inline hex per component; a re-theme should be a
  one-file change.
- **Purposeful, reduced-motion-safe motion** — animation exists where it
  communicates state change (violation alert, overlay transitions), never as
  decoration, and always has a reduced-motion fallback.
- **Real ATC conventions over game conventions** — when in doubt, match how
  actual radar/tower displays represent information rather than reaching for
  generic app-UI patterns.

## Accessibility & Inclusion

Standard care: maintain solid contrast and avoid relying on hue alone for
critical state (urgent/violation) where practical. No strict WCAG level
target — this is a personal/hobby simulation project, not a public product.
