/// <reference types="vite/client" />

export type ModelState = 'present' | 'downloading' | 'missing' | 'error' | 'checking'

export interface ModelStatus {
  state: ModelState
  progress?: number
  error?: string | null
}

declare global {
  interface Window {
    api: {
      getSidecarPort(): Promise<number | null>
      getSidecarStatus(): Promise<'starting' | 'ready' | 'error'>
      getModelStatus(): Promise<ModelStatus>
      downloadModel(): Promise<void>
      restartApp(): Promise<void>
      onModelProgress(cb: (progress: number) => void): () => void
      onSidecarError(cb: (err: string) => void): () => void
      // Phase 4 — File picker & assets
      openFile(filters: Array<{ name: string; extensions: string[] }>): Promise<string | null>
      copyAsset(srcPath: string): Promise<string>
      saveBlobAsset(buffer: ArrayBuffer, ext: string): Promise<string>
      getAssetsDir(): Promise<string>
      // Phase 4 — Session persistence
      saveSession(data: string): Promise<void>
      loadSession(): Promise<string | null>
      fileExists(filePath: string): Promise<boolean>
      saveAndQuit(): Promise<void>
      onSaveAndQuit(cb: () => void): () => void
    }
  }
}
