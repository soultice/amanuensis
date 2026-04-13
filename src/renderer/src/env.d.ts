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
      onSidecarReady(cb: (port: number) => void): () => void
      onSidecarError(cb: (err: string) => void): () => void
      exportMarkdown(payload: {
        markdown: string
        assetsToCopy: Array<{ src: string; dest: string }>
      }): Promise<{ canceled: boolean; filePath?: string }>
      // Phase 4 — File picker & assets (updated for Phase 8 sessionId)
      openFile(filters: Array<{ name: string; extensions: string[] }>): Promise<string | null>
      copyAsset(sessionId: string, srcPath: string): Promise<string>
      saveBlobAsset(sessionId: string, buffer: ArrayBuffer, ext: string): Promise<string>
      getAssetsDir(sessionId: string): Promise<string>
      // Phase 8 — Session management
      listSessions(): Promise<Array<{ id: string; name: string; createdAt: string; updatedAt: string; wordCount: number }>>
      createSession(): Promise<string>
      openSession(id: string): Promise<string | null>
      deleteSession(id: string): Promise<void>
      saveSession(id: string, data: string): Promise<void>
      fileExists(filePath: string): Promise<boolean>
      saveAndQuit(): Promise<void>
      onSaveAndQuit(cb: () => void): () => void
    }
  }
}
