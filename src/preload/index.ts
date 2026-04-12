import { contextBridge, ipcRenderer } from 'electron'

export type ModelState = 'present' | 'downloading' | 'missing' | 'error' | 'checking'

export interface ModelStatus {
  state: ModelState
  progress?: number
  error?: string | null
}

contextBridge.exposeInMainWorld('api', {
  // Sidecar
  getSidecarPort: (): Promise<number | null> =>
    ipcRenderer.invoke('sidecar:get-port'),
  getSidecarStatus: (): Promise<'starting' | 'ready' | 'error'> =>
    ipcRenderer.invoke('sidecar:get-status'),

  // Model
  getModelStatus: (): Promise<ModelStatus> =>
    ipcRenderer.invoke('model:get-status'),
  downloadModel: (): Promise<void> =>
    ipcRenderer.invoke('model:download'),

  // App
  restartApp: (): Promise<void> =>
    ipcRenderer.invoke('app:restart'),

  // Events
  onModelProgress: (cb: (progress: number) => void): (() => void) => {
    const handler = (_e: Electron.IpcRendererEvent, p: number): void => cb(p)
    ipcRenderer.on('model:progress', handler)
    return () => ipcRenderer.removeListener('model:progress', handler)
  },

  onSidecarError: (cb: (err: string) => void): (() => void) => {
    const handler = (_e: Electron.IpcRendererEvent, e: string): void => cb(e)
    ipcRenderer.on('sidecar:error', handler)
    return () => ipcRenderer.removeListener('sidecar:error', handler)
  }
})
