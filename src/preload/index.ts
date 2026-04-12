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
  },

  // Phase 5 — Markdown export
  exportMarkdown: (payload: {
    markdown: string
    assetsToCopy: Array<{ src: string; dest: string }>
  }): Promise<{ canceled: boolean; filePath?: string }> =>
    ipcRenderer.invoke('export:markdown', payload),

  // Phase 4 — File picker & assets
  openFile: (filters: Array<{ name: string; extensions: string[] }>): Promise<string | null> =>
    ipcRenderer.invoke('dialog:openFile', filters),
  copyAsset: (srcPath: string): Promise<string> =>
    ipcRenderer.invoke('session:copyAsset', srcPath),
  saveBlobAsset: (buffer: ArrayBuffer, ext: string): Promise<string> =>
    ipcRenderer.invoke('session:saveBlobAsset', Buffer.from(buffer), ext),
  getAssetsDir: (): Promise<string> =>
    ipcRenderer.invoke('session:getAssetsDir'),

  // Phase 4 — Session persistence
  saveSession: (data: string): Promise<void> =>
    ipcRenderer.invoke('session:save', data),
  loadSession: (): Promise<string | null> =>
    ipcRenderer.invoke('session:load'),
  fileExists: (filePath: string): Promise<boolean> =>
    ipcRenderer.invoke('fs:exists', filePath),
  saveAndQuit: (): Promise<void> =>
    ipcRenderer.invoke('session:save-complete'),

  onSaveAndQuit: (cb: () => void): (() => void) => {
    const handler = (): void => cb()
    ipcRenderer.on('app:save-and-quit', handler)
    return () => ipcRenderer.removeListener('app:save-and-quit', handler)
  }
})
