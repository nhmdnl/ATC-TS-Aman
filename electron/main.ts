import { app, BrowserWindow, Menu } from 'electron'
import path from 'path'

const DEV_URL = 'http://localhost:5173'

let mainWindow: BrowserWindow | null = null

function createWindow() {
  // No File/Edit/View/Window/Help — this is a single-purpose kiosk-style
  // game window, not a document app that needs the OS chrome menu.
  Menu.setApplicationMenu(null)

  mainWindow = new BrowserWindow({
    width: 1280,
    height: 720,
    resizable: false,
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

app.whenReady().then(createWindow)

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
