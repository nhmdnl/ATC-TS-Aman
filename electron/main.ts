import { app, BrowserWindow, Menu, ipcMain } from 'electron'
import path from 'path'

const DEV_URL = 'http://localhost:5173'

// Linux only: Chromium keeps Web Speech disabled unless speech-dispatcher is
// explicitly enabled — without this, speechSynthesis.getVoices() is always
// empty even with speechd + espeak-ng installed. No-op on Windows/macOS,
// which use their native TTS backends.
app.commandLine.appendSwitch('enable-speech-dispatcher')

// Hybrid-GPU laptops (dev machine: AMD iGPU + runtime-suspended NVIDIA):
// launching while the discrete GPU is asleep crashes Chromium's GPU process
// mid-resume; after 3 crashes Chromium permanently falls back to software
// rendering, WebGL is gone for the whole session, and the radar canvas stays
// blank. Let the GPU process keep retrying instead — it recovers ~2 s in.
// No-op on machines where GPU init never fails.
app.commandLine.appendSwitch('disable-gpu-process-crash-limit')

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

// WebGL takes ~2 s to come up after a cold hybrid-GPU launch (see switch
// above). Creating the window earlier lets PixiJS cache "no WebGL" and the
// radar stays blank anyway — so wait, capped so a truly GPU-less machine
// still gets a window (software UI beats no app).
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
