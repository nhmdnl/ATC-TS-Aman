interface ElectronAPI {
  platform: string
  onMenuAction: (callback: (action: string) => void) => void
  send: (channel: string, data: unknown) => void
}

interface Window {
  electronAPI: ElectronAPI
}
