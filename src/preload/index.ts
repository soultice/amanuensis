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

  onSidecarReady: (cb: (port: number) => void): (() => void) => {
    const handler = (_e: Electron.IpcRendererEvent, port: number): void => cb(port)
    ipcRenderer.on('sidecar:ready', handler)
    return () => ipcRenderer.removeListener('sidecar:ready', handler)
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

  // Phase 4 — File picker & assets (updated for Phase 8 sessionId)
  openFile: (filters: Array<{ name: string; extensions: string[] }>): Promise<string | null> =>
    ipcRenderer.invoke('dialog:openFile', filters),
  copyAsset: (sessionId: string, srcPath: string): Promise<string> =>
    ipcRenderer.invoke('session:copyAsset', sessionId, srcPath),
  saveBlobAsset: (sessionId: string, buffer: ArrayBuffer, ext: string): Promise<string> =>
    ipcRenderer.invoke('session:saveBlobAsset', sessionId, Buffer.from(buffer), ext),
  getAssetsDir: (sessionId: string): Promise<string> =>
    ipcRenderer.invoke('session:getAssetsDir', sessionId),

  // Phase 8 — Session management
  listSessions: (): Promise<Array<{ id: string; name: string; createdAt: string; updatedAt: string; wordCount: number }>> =>
    ipcRenderer.invoke('session:list'),
  createSession: (): Promise<string> =>
    ipcRenderer.invoke('session:create'),
  openSession: (id: string): Promise<string | null> =>
    ipcRenderer.invoke('session:open', id),
  deleteSession: (id: string): Promise<void> =>
    ipcRenderer.invoke('session:delete', id),
  saveSession: (id: string, data: string): Promise<void> =>
    ipcRenderer.invoke('session:save', { id, data }),
  fileExists: (filePath: string): Promise<boolean> =>
    ipcRenderer.invoke('fs:exists', filePath),
  saveAndQuit: (): Promise<void> =>
    ipcRenderer.invoke('session:save-complete'),

  onSaveAndQuit: (cb: () => void): (() => void) => {
    const handler = (): void => cb()
    ipcRenderer.on('app:save-and-quit', handler)
    return () => ipcRenderer.removeListener('app:save-and-quit', handler)
  },

  // Phase 13 — Session rename
  renameSession: (id: string, name: string): Promise<void> =>
    ipcRenderer.invoke('session:rename', id, name),
})
