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
    }
  }
}
