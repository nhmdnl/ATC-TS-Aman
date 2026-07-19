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

function buildRegistry(): AirportEntry[] {
  const entries: AirportEntry[] = []
  for (const [path, raw] of Object.entries(rawFiles)) {
    const fileName = path.split('/').pop() ?? path
    try {
      const airport = loadAirport(JSON.parse(raw))
      entries.push({ id: airport.metadata.icao, fileName, airport })
    } catch (err) {
      console.warn(`Skipping airport file ${fileName}:`, err)
    }
  }
  // Stable order, HHAS (the original airport) first
  entries.sort((a, b) => (a.id === 'HHAS' ? -1 : b.id === 'HHAS' ? 1 : a.id.localeCompare(b.id)))
  return entries
}

export const AIRPORTS: ReadonlyArray<AirportEntry> = buildRegistry()

export function getAirportEntry(id: string): AirportEntry | null {
  return AIRPORTS.find(a => a.id === id) ?? null
}
