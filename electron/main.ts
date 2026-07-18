import { app, BrowserWindow, Menu, ipcMain } from 'electron'
import path from 'path'

const DEV_URL = 'http://localhost:5173'

// Linux only: Chromium keeps Web Speech disabled unless speech-dispatcher is
// explicitly enabled — without this, speechSynthesis.getVoices() is always
// empty even with speechd + espeak-ng installed. No-op on Windows/macOS,
// which use their native TTS backends.
app.commandLine.appendSwitch('enable-speech-dispatcher')

// Linux only: Electron 35's bundled ANGLE segfaults in EGL_CreateWindowSurface
// on its default OpenGL backend against current mesa (coredump verified,
// 2026-07-18) — three GPU-process crashes, then Chromium permanently falls
// back to software rendering and WebGL (the whole radar) is gone for the
// session. ANGLE's Vulkan backend is stable, pinned to X11 (native Wayland
// additionally fails scanout buffer allocation). Windows keeps default D3D11.
if (process.platform === 'linux') {
  app.commandLine.appendSwitch('ozone-platform', 'x11')
  app.commandLine.appendSwitch('use-angle', 'vulkan')
}

let mainWindow: BrowserWindow | null = null

function createWindow() {
  // No File/Edit/View/Window/Help — this is a single-purpose kiosk-style
  // game window, not a document app that needs the OS chrome menu.
  Menu.setApplicationMenu(null)

  mainWindow = new BrowserWindow({
    width: 1280,
    height: 720,
    // Fully resizable, but never below the design size — the side panels are
    // fixed-width, so anything smaller crushes the radar
    minWidth: 1280,
    minHeight: 720,
    title: 'ATC Aman',
    backgroundColor: '#0E1116',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  })

  // ponytail: hardcoded dev/prod switch — config when adding staging env
  if (process.env.NODE_ENV === 'development' || process.argv.includes('--dev')) {
    mainWindow.loadURL(DEV_URL)
    mainWindow.webContents.openDevTools()
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'))
  }

  mainWindow.on('closed', () => {
    mainWindow = null
  })
}

// GPU init can lag a cold launch (hybrid-GPU laptops resume the discrete
// card first). Creating the window before WebGL is up lets PixiJS cache
// "no WebGL" and the radar stays blank — so wait, capped so a truly
// GPU-less machine still gets a window (software UI beats no app).
async function whenGpuReady(): Promise<void> {
  for (let i = 0; i < 20 && app.getGPUFeatureStatus().webgl !== 'enabled'; i++) {
    await new Promise((resolve) => setTimeout(resolve, 500))
  }
}

app.whenReady().then(whenGpuReady).then(createWindow)

ipcMain.on('app-quit', () => app.quit())

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

app.on('activate', () => {
  if (mainWindow === null) {
    createWindow()
  }
})
