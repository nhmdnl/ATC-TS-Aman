import { contextBridge, ipcRenderer } from 'electron'

// ponytail: two IPC channels — expand when game state sync or file dialog needed
contextBridge.exposeInMainWorld('electronAPI', {
  platform: process.platform,
  onMenuAction: (callback: (action: string) => void) => {
    ipcRenderer.on('menu-action', (_event, action: string) => callback(action))
  },
  send: (channel: string, data: unknown) => {
    ipcRenderer.send(channel, data)
  },
})
