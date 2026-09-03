import type { Airport } from '../engine/types'
import { loadAirport } from '../engine/airport-loader'

export interface AirportEntry {
  /** ICAO code — the selection id */
  readonly id: string
  readonly fileName: string
  readonly airport: Airport
}

// Every .airport / .airport.json file under src/data/airports is bundled and
// parsed once at startup. Files that fail to parse are skipped with a warning
// so one bad file can't take down the menu.
const rawFiles = import.meta.glob(
  ['../data/airports/*.airport', '../data/airports/*.airport.json'],
  { query: '?raw', import: 'default', eager: true },
) as Record<string, string>

/**
 * The id is the ICAO, and it is the selection key — two files declaring the
 * same ICAO (a scratch copy alongside the real field) produced two
 * indistinguishable picker buttons, a duplicate-React-key warning, and a
 * selection that could only ever resolve to one of them. Keep one entry per
 * ICAO, preferring the canonical `.airport.json` export so a hand-saved
 * `.airport` copy can never shadow the shipped field.
 *
 * Exported for tests: the duplicate that triggered this is an untracked local
 * file, so the collision can't be reproduced through `import.meta.glob`.
 */
export function selectCanonicalEntries(parsed: ReadonlyArray<AirportEntry>): AirportEntry[] {
  const canonical = (f: string) => (f.endsWith('.airport.json') ? 0 : 1)
  const byPreference = [...parsed].sort((a, b) =>
    canonical(a.fileName) - canonical(b.fileName) || a.fileName.localeCompare(b.fileName))

  const entries: AirportEntry[] = []
  const seen = new Map<string, string>()
  for (const entry of byPreference) {
    const winner = seen.get(entry.id)
    if (winner !== undefined) {
      console.warn(
        `Airport ${entry.id}: ignoring ${entry.fileName} — ${winner} already claims that ICAO. ` +
        `Give the duplicate a distinct ICAO to list it separately.`,
      )
      continue
    }
    seen.set(entry.id, entry.fileName)
    entries.push(entry)
  }

  // Stable order, HHAS (the original airport) first
  entries.sort((a, b) => (a.id === 'HHAS' ? -1 : b.id === 'HHAS' ? 1 : a.id.localeCompare(b.id)))
  return entries
}

function buildRegistry(): AirportEntry[] {
  const parsed: AirportEntry[] = []
  for (const [path, raw] of Object.entries(rawFiles)) {
    const fileName = path.split('/').pop() ?? path
    try {
      const airport = loadAirport(JSON.parse(raw))
      parsed.push({ id: airport.metadata.icao, fileName, airport })
    } catch (err) {
      console.warn(`Skipping airport file ${fileName}:`, err)
    }
  }
  return selectCanonicalEntries(parsed)
}

export const AIRPORTS: ReadonlyArray<AirportEntry> = buildRegistry()

export function getAirportEntry(id: string): AirportEntry | null {
  return AIRPORTS.find(a => a.id === id) ?? null
}
