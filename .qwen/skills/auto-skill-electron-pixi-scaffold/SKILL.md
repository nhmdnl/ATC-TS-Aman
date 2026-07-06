---
name: electron-pixi-scaffold
description: Scaffold an Electron + TypeScript + React + PixiJS desktop app from scratch with dual tsconfig, Vite bundling, and PRD-driven layout
source: auto-skill
extracted_at: '2026-07-03T14:58:46.660Z'
---

# Electron + React + PixiJS Project Scaffold

Scaffold a desktop app with Electron (main process), React (UI), and PixiJS (canvas rendering), all in TypeScript, using Vite for the renderer build.

## When to Use

- Starting a new Electron desktop application that needs:
  - React for UI panels (status bars, lists, inputs, logs)
  - PixiJS for a canvas/game viewport (radar, maps, visualizations)
  - TypeScript throughout, Vite dev server for HMR
- Converting a web-based React + PixiJS app to desktop with Electron
- Starting any Electron project where the renderer should use modern ESM/Vite and the main process uses CommonJS

## Project Structure Outcome

```
project/
├── package.json              # Electron + React + PixiJS + Vite + TS deps
├── tsconfig.json             # Renderer TS config (ESNext/bundler moduleResolution)
├── tsconfig.main.json        # Electron main process (CommonJS module/node resolution)
├── vite.config.ts            # Vite + React plugin + path aliases
├── index.html                # HTML shell with CSP
├── .gitignore
├── electron/
│   ├── main.ts               # BrowserWindow, dev/prod URL loading
│   └── preload.ts            # contextBridge IPC
├── src/
│   ├── main.tsx              # React entry
│   ├── App.tsx               # Layout shell
│   ├── types/                # Type declarations (e.g. window.electronAPI)
│   ├── components/           # React UI components
│   ├── styles/               # CSS
│   └── data/                 # Static data files
└── dist/                     # Vite build output
```

## Common Integration Pitfalls (from practice)

When adding a game simulation engine layer on top of this scaffold, watch for:

### 1. `GameStateSnapshot` Stale Type

The snapshot type used for React rendering often misses fields that UI components need. Add these to the interface when needed:

```ts
// types.ts — add fields the UI reads
export interface GameStateSnapshot {
  readonly sessionEnded: boolean
  readonly airport: Readonly<Airport> | null
  readonly radioMessages: ReadonlyArray<RadioMessage>
  // ...
}
```

Then populate them in `snapshot()`:

```ts
// game-state.ts
snapshot(): GameStateSnapshot {
  return {
    // ...
    sessionEnded: this.sessionEnded,
    airport: this.airport,
    radioMessages: [...this.radioLog],
  }
}
```

### 2. `readonly` On Mutable Fields

The `Aircraft` interface may mark fields like `squawk` as `readonly`, but the command executor needs to mutate them. Remove `readonly` from fields that commands change:

```ts
export interface Aircraft {
  squawk: string  // NOT readonly — mutated by SQUAWK command
  // Position & movement fields are already mutable (no readonly)
}
```

### 3. PixiJS v8 `destroy()` Options

PixiJS v8 removed `baseTexture` from destroy options. Use only valid keys:

```ts
// ✅ correct for v8
app.destroy(true, { children: true, texture: true })
// ❌ removed: baseTexture: true
```

### 4. `require()` In ESM

If `command-validators.ts` uses `require()` to avoid circular deps with constants, mark with a ponytail:

```ts
// ponytail: lazy import to break circular dep — extract to shared lookup when adding more validators
const { PHASE_COMMANDS } = require('../constants')
```

Prefer proper ES imports; use `require()` only as a last resort for circular dependency resolution.

### 5. Layout Deviation From PRD

The 5-panel PRD layout (StatusBar | FlightStrips | Radar | CommandPanel | CommandInput | RadioLog) may be simplified during implementation. Document actual layout in QWEN.md:

```
StatusBar (100vw × 36)
Radar (fills remaining) + AircraftList overlay (220px right)
CommandInput (100vw × 28)
RadioLog (100vw × 120)
```

Keep stub components (FlightStrips, CommandPanel) with ponytail comments — they document intended future work.

## When to Add Ponytail Comments

Mark every deliberate simplification with a `ponytail:` comment naming:
1. **The ceiling** — what you skipped (hardcoded config, no pathfinding, flat random)
2. **The upgrade condition** — when to add it (multi-airport, wind-based runway, user request)

Key ponytail locations in a simulation engine:
- `aircraft-factory.ts` — flat random callsign → sequential when flight schedule added
- `movement.ts` — instant taxi heading snap → pathfinding when taxiway graph connected
- `phase-transitions.ts` — hardcoded missed approach → load from airport data
- `simulation-tick.ts` — hardcoded MVA floor → per-quadrant terrain data
- `simulation-tick.ts` — first-runway-always → wind-based active runway selection
- `RadarCanvas.tsx` — hardcoded zoom → dynamic zoom with scroll

## Step-by-Step Procedure

### 1. Create `package.json`

Include all deps in one shot:

- **dependencies:** `pixi.js` (^8), `react` (^19), `react-dom` (^19)
- **devDependencies:** `@types/react`, `@types/react-dom`, `@vitejs/plugin-react`, `concurrently`, `electron`, `electron-builder`, `typescript`, `vite`, `wait-on`

Set `"main": "dist-electron/main.js"` as the Electron entry point.

Scripts:
- `"dev": "concurrently -k \"vite\" \"wait-on http://localhost:5173 && electron .\""`
- `"build": "vite build && tsc -p tsconfig.main.json"`
- `"lint": "tsc --noEmit"`
- `"package": "npm run build && electron-builder"`

### 2. Create Dual `tsconfig` Files

**tsconfig.json** (renderer — Vite uses this):
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "moduleResolution": "bundler",
    "jsx": "react-jsx",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "noEmit": true,
    "baseUrl": ".",
    "paths": { "@/*": ["src/*"] }
  },
  "include": ["src"]
}
```

**tsconfig.main.json** (Electron main process — CommonJS output):
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "CommonJS",
    "moduleResolution": "node",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "outDir": "dist-electron",
    "rootDir": "electron"
  },
  "include": ["electron"]
}
```

### 3. Create `vite.config.ts`

```ts
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  plugins: [react()],
  base: './',
  resolve: {
    alias: { '@': path.resolve(__dirname, 'src') },
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
  server: {
    port: 5173,
    strictPort: true,
  },
})
```

### 4. Create `index.html`

```html
<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <meta http-equiv="Content-Security-Policy" content="default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'" />
    <title>Your App</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

### 5. Create Electron Main Process (`electron/main.ts`)

Pattern: check `NODE_ENV` or `--dev` flag to decide dev URL vs built file:

```ts
import { app, BrowserWindow } from 'electron'
import path from 'path'

const DEV_URL = 'http://localhost:5173'
let mainWindow: BrowserWindow | null = null

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280, height: 720,
    resizable: false,
    backgroundColor: '#0E1116',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  })

  if (process.env.NODE_ENV === 'development' || process.argv.includes('--dev')) {
    mainWindow.loadURL(DEV_URL)
    mainWindow.webContents.openDevTools()
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'))
  }

  mainWindow.on('closed', () => { mainWindow = null })
}

app.whenReady().then(createWindow)
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit() })
app.on('activate', () => { if (mainWindow === null) createWindow() })
```

### 6. Create Preload (`electron/preload.ts`)

Minimal contextBridge exposing IPC channels:

```ts
import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('electronAPI', {
  platform: process.platform,
  onMenuAction: (callback: (action: string) => void) => {
    ipcRenderer.on('menu-action', (_event, action) => callback(action))
  },
  send: (channel: string, data: unknown) => {
    ipcRenderer.send(channel, data)
  },
})
```

Create a corresponding type declaration `src/types/electron.d.ts`:

```ts
interface ElectronAPI {
  platform: string
  onMenuAction: (callback: (action: string) => void) => void
  send: (channel: string, data: unknown) => void
}
interface Window { electronAPI: ElectronAPI }
```

### 7. Create React Entry + PixiJS Component

**React entry** (`src/main.tsx`):
```tsx
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import './styles/index.css'

createRoot(document.getElementById('root')!).render(
  <StrictMode><App /></StrictMode>,
)
```

**PixiJS canvas component** (`src/components/RadarCanvas.tsx`):
- Use `useRef<HTMLDivElement>` for the container
- Use `useEffect` to initialize PixiJS `Application` on mount and destroy on unmount
- `app.canvas` is typed as `HTMLCanvasElement` — cast with `as HTMLCanvasElement`
- Draw range rings, runway graphics, compass labels, navaids as PIXI.Graphics + Text objects

Key pattern:
```tsx
useEffect(() => {
  const app = new Application()
  ;(async () => {
    await app.init({ width: el.clientWidth, height: el.clientHeight, backgroundColor: 0x0e1116 })
    el.appendChild(app.canvas as HTMLCanvasElement)
    // ... draw graphics on app.stage ...
  })()
  return () => { app.destroy(true) }
}, [])
```

### 8. PRD-Driven Layout

When you have a layout spec (sections with pixel dimensions), define layout constants as a `const` frozen object:

```ts
const LAYOUT = {
  STATUS_BAR_H: 36,
  FLIGHT_STRIPS_W: 200,
  RADAR_W: 800,
  COMMAND_PANEL_W: 280,
  COMMAND_INPUT_H: 28,
  RADIO_LOG_H: 220,
} as const
```

Compose the layout with flexbox — each panel gets fixed width/height and `flexShrink: 0`, except the radar which gets `flex: 1`. Keep the React tree flat (no nested layout wrappers beyond flex containers).

### 9. Verify

After scaffolding:

```bash
npm install
npx tsc --noEmit                    # renderer typecheck
npx tsc -p tsconfig.main.json --noEmit  # main process typecheck
npx vite build                      # renderer build
```

## Ponytail Convention

Mark deliberate stubs with a `ponytail:` comment naming the ceiling + upgrade path:

```tsx
// ponytail: static status bar — expand with score/time/traffic when game state connected
export default function StatusBar() { ... }
```

Apply to:
- Stub components that will be wired later
- Hardcoded values that will become configurable
- Missing error handling that will be added when the first consumer appears
- Simplified data flows that will be replaced with proper state management

Do NOT ponytail: security, correctness, data-loss prevention, accessibility shortcuts, or what code already expresses clearly.

## Headless Setup & Smoke Test (Dev Containers / CI)

When running in a headless environment (no physical display):

### Xvfb + Electron

```bash
# Start virtual framebuffer
Xvfb :99 -screen 0 1280x720x24 -ac &
sleep 1

# Compile main process then launch Electron with GPU disabled
npx tsc -p tsconfig.main.json
DISPLAY=:99 npx electron . --disable-gpu
```

**Key flags:** `--disable-gpu` avoids GPU crash in Xvfb. Xvfb must start **before** Electron.

### Verify Window Rendered

```bash
# Find window by title
DISPLAY=:99 xdotool search --name "ATC Aman"  # or your app's title

# Screenshot specific window
DISPLAY=:99 import -window $(DISPLAY=:99 xdotool search --name "ATC Aman") /tmp/screenshot.png
```

### Common Headless Issues

| Problem | Fix |
|---------|-----|
| `Electron failed to install correctly` | `rm -rf node_modules/electron && npm install electron` |
| Fontconfig warnings (`48-guessfamily.conf`) | Cosmetic — safe to ignore |
| `GPU process launch failed` / `SharedImage failed` | Add `--disable-gpu` flag |
| Port 5173 in use after cancelled dev run | `fuser -k 5173/tcp` |

### Dev Workflow Tips

- Vite HMR hot-reloads renderer without restarting Electron
- After changing `electron/main.ts` or `electron/preload.ts`: recompile with `npx tsc -p tsconfig.main.json`, then restart Electron
- For rapid iteration: run `npx vite` permanently, only restart Electron on main-process changes
