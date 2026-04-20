import { defineStore } from 'pinia'
import { useTranscriptStore } from './transcript'
import { useAnnotationStore } from './annotation'
import { useRecordingStore } from './recording'
import { usePlaybackStore } from './playback'
import type { Word, Segment } from './transcript'
import type { Annotation } from './annotation'
import { validateImportMediaPath } from '../lib/import-media'
import { getMediaMimeType } from '../lib/media-mime'

export interface SessionMeta {
  id: string
  name: string
  createdAt: string
  updatedAt: string
  wordCount: number
}

interface SessionData {
  version: 1
  savedAt: string
  audioPath: string | null
  transcript: {
    language: string
    duration: number
    words: Word[]
    segments: Segment[]
  } | null
  annotations: Annotation[]
}

export type ImportEntrypoint = 'session-list' | 'toolbar-open-session'
export type ImportPhase = 'idle' | 'picking' | 'rejected' | 'accepted'
export type ImportRejectionReason = 'unsupported' | 'cancelled' | 'error'

export interface ImportIntent {
  sourcePath: string
  entrypoint: ImportEntrypoint
  createNewSession: true
}

export interface ImportErrorState {
  reason: ImportRejectionReason
  entrypoint: ImportEntrypoint
  message: string
  validationReason?: 'empty-path' | 'missing-extension' | 'unsupported-extension'
  diagnostics?: string
}

export type ImportIntentResult =
  | {
      status: 'accepted'
      intent: ImportIntent
    }
  | {
      status: 'rejected'
      reason: ImportRejectionReason
      message: string
      entrypoint: ImportEntrypoint
    }

const IMPORT_FILE_FILTERS = [
  {
    name: 'Supported media',
    extensions: ['mp3', 'mp4', 'm4a', 'wav'],
  },
]
const IMPORT_PICKER_TIMEOUT_MS = 15_000
const IMPORT_CANCELLED_MESSAGE = 'Import cancelled.'
const IMPORT_ORCHESTRATION_ERROR_MESSAGE = 'Unable to start import right now. Please try again.'

export const useSessionStore = defineStore('session', {
  state: () => ({
    currentSessionId: null as string | null,
    autoSaveIntervalId: null as ReturnType<typeof setInterval> | null,
    cleanupSaveAndQuit: null as (() => void) | null,
    audioFileMissing: false,
    lastSavedAt: 0 as number,
    autoSavePeriodMs: 30_000 as number,
    sessionName: '' as string,          // display name of the active session; '' when no session open
    importPhase: 'idle' as ImportPhase,
    pendingImportIntent: null as ImportIntent | null,
    lastImportError: null as ImportErrorState | null,
    consumingImportIntent: false,
  }),

  actions: {
    _rejectImport(
      entrypoint: ImportEntrypoint,
      reason: ImportRejectionReason,
      message: string,
      details?: Pick<ImportErrorState, 'validationReason' | 'diagnostics'>
    ): ImportIntentResult {
      this.importPhase = 'rejected'
      this.pendingImportIntent = null
      this.lastImportError = {
        reason,
        entrypoint,
        message,
        ...(details?.validationReason ? { validationReason: details.validationReason } : {}),
        ...(details?.diagnostics ? { diagnostics: details.diagnostics } : {}),
      }

      return {
        status: 'rejected',
        reason,
        message,
        entrypoint,
      }
    },

    async _pickImportPath(entrypoint: ImportEntrypoint): Promise<string | ImportIntentResult> {
      const timeoutSentinel = Symbol('import-picker-timeout')
      const timeoutPromise = new Promise<symbol>((resolve) => {
        setTimeout(() => resolve(timeoutSentinel), IMPORT_PICKER_TIMEOUT_MS)
      })

      let picked: unknown
      try {
        picked = await Promise.race([window.api.openFile(IMPORT_FILE_FILTERS), timeoutPromise])
      } catch (error) {
        return this._rejectImport(entrypoint, 'error', IMPORT_ORCHESTRATION_ERROR_MESSAGE, {
          diagnostics: String(error),
        })
      }

      if (picked === timeoutSentinel) {
        return this._rejectImport(entrypoint, 'cancelled', IMPORT_CANCELLED_MESSAGE, {
          diagnostics: `picker-timeout-${IMPORT_PICKER_TIMEOUT_MS}ms`,
        })
      }

      if (picked === null) {
        return this._rejectImport(entrypoint, 'cancelled', IMPORT_CANCELLED_MESSAGE)
      }

      if (typeof picked !== 'string') {
        return this._rejectImport(entrypoint, 'error', IMPORT_ORCHESTRATION_ERROR_MESSAGE, {
          diagnostics: `picker-malformed-${typeof picked}`,
        })
      }

      return picked
    },

    async startImportIntent(entrypoint: ImportEntrypoint): Promise<ImportIntentResult> {
      this.importPhase = 'picking'
      this.pendingImportIntent = null
      this.lastImportError = null

      const pickedPath = await this._pickImportPath(entrypoint)
      if (typeof pickedPath !== 'string') {
        return pickedPath
      }

      const validation = validateImportMediaPath(pickedPath)
      if (!validation.ok) {
        return this._rejectImport(entrypoint, 'unsupported', validation.message, {
          validationReason: validation.reason,
        })
      }

      const previousSessionId = this.currentSessionId
      if (entrypoint === 'toolbar-open-session') {
        try {
          await this.newSession()
        } catch (error) {
          this.currentSessionId = previousSessionId
          return this._rejectImport(entrypoint, 'error', IMPORT_ORCHESTRATION_ERROR_MESSAGE, {
            diagnostics: String(error),
          })
        }
      }

      const intent: ImportIntent = {
        sourcePath: pickedPath,
        entrypoint,
        createNewSession: true,
      }

      this.pendingImportIntent = intent
      this.importPhase = 'accepted'
      this.lastImportError = null

      return {
        status: 'accepted',
        intent,
      }
    },

    clearImportIntentState(): void {
      this.pendingImportIntent = null
      this.lastImportError = null
      this.importPhase = 'idle'
    },

    async consumePendingImportIntent(): Promise<void> {
      if (this.consumingImportIntent) return
      if (this.importPhase !== 'accepted' || !this.pendingImportIntent) return

      const intent = this.pendingImportIntent
      const sourcePath = intent.sourcePath
      if (typeof sourcePath !== 'string' || sourcePath.trim().length === 0) {
        this._rejectImport(intent.entrypoint, 'error', IMPORT_ORCHESTRATION_ERROR_MESSAGE, {
          diagnostics: 'consume-malformed-source-path',
        })
        return
      }

      this.consumingImportIntent = true
      try {
        if (!this.currentSessionId) {
          const createdId = await this.createSession()
          await this.openSession(createdId)
        }

        if (!this.currentSessionId) {
          throw new Error('consume-missing-session-id-after-create')
        }

        const copiedAsset = await window.api.copyAsset(this.currentSessionId, sourcePath)
        if (typeof copiedAsset !== 'string' || copiedAsset.trim().length === 0) {
          throw new Error(`copyAsset malformed response: ${String(copiedAsset)}`)
        }

        const recordingStore = useRecordingStore()
        if (recordingStore.audioBlobUrl?.startsWith('blob:')) {
          URL.revokeObjectURL(recordingStore.audioBlobUrl)
        }

        recordingStore.audioBlob = null
        recordingStore.audioBlobUrl = `asset://localhost/${copiedAsset}`
        recordingStore.recordingState = 'stopped'
        this.audioFileMissing = false
        this.clearImportIntentState()

        const transcriptStore = useTranscriptStore()
        try {
          const buffer = await window.api.readSessionAsset(this.currentSessionId, copiedAsset)
          const importedAudioBlob = new Blob([buffer], { type: getMediaMimeType(copiedAsset) })
          await transcriptStore.transcribeBatchAudio(importedAudioBlob, copiedAsset)
        } catch {
          transcriptStore.error = '[decode-failure] Audio decode failed before transcription. (canonical-asset-read-failed)'
          transcriptStore.transcriptState = 'error'
        }
      } catch (error) {
        this._rejectImport(intent.entrypoint, 'error', IMPORT_ORCHESTRATION_ERROR_MESSAGE, {
          diagnostics: String(error),
        })
      } finally {
        this.consumingImportIntent = false
      }
    },

    /** List all sessions from disk */
    async listSessions(): Promise<SessionMeta[]> {
      return await window.api.listSessions()
    },

    /** Create a new session on disk, return its id (does NOT open it) */
    async createSession(): Promise<string> {
      return await window.api.createSession()
    },

    /** Open a session by id: load from disk, restore all stores */
    async openSession(id: string): Promise<void> {
      const raw = await window.api.openSession(id)
      this.currentSessionId = id
      this.audioFileMissing = false

      // Load session name from index
      try {
        const sessions = await window.api.listSessions()
        const meta = sessions.find(s => s.id === id)
        this.sessionName = meta?.name ?? ''
      } catch {
        this.sessionName = ''
      }

      if (!raw) return
      try {
        const data: SessionData = JSON.parse(raw)
        const transcriptStore = useTranscriptStore()
        const annotationStore = useAnnotationStore()
        const recordingStore = useRecordingStore()

        // Clear stale diagnostics before hydrating persisted transcript/audio state.
        transcriptStore.error = null

        if (data.transcript) {
          const words = data.transcript.words.map((w) =>
            typeof (w as any).segmentId === 'number' ? w : { ...w, segmentId: 0 }
          )
          transcriptStore.words = words
          if (data.transcript.segments && data.transcript.segments.length > 0) {
            transcriptStore.segments = data.transcript.segments
          } else if (words.length > 0) {
            transcriptStore.segments = [{
              id: 0,
              start: words[0].start,
              end: words[words.length - 1].end,
              text: words.map((w) => w.word).join('').trim(),
            }]
          }
          transcriptStore.language = data.transcript.language
          transcriptStore.duration = data.transcript.duration
          transcriptStore.transcriptState = 'complete'
        }

        annotationStore.annotations = data.annotations ?? []

        if (data.audioPath) {
          const p = data.audioPath
          if (p.startsWith('blob:')) {
            // Old ephemeral blob URL — unrestorable across sessions
            this.audioFileMissing = true
            if (!data.transcript) {
              transcriptStore.error = 'Transcript missing for saved recording and audio could not be recovered automatically.'
              transcriptStore.transcriptState = 'error'
            }
          } else if (p.startsWith('/')) {
            // Legacy absolute file path (audio was saved outside session assets)
            const exists = await window.api.fileExists(p)
            if (exists) {
              const filename = p.split('/').pop() ?? ''
              recordingStore.audioBlobUrl = `asset://localhost/${filename}`
              recordingStore.recordingState = 'stopped'
              if (!data.transcript) {
                this.audioFileMissing = true
                transcriptStore.error = 'Transcript missing for saved recording and audio could not be recovered automatically.'
                transcriptStore.transcriptState = 'error'
              }
            } else {
              this.audioFileMissing = true
              if (!data.transcript) {
                transcriptStore.error = 'Transcript missing for saved recording and audio could not be recovered automatically.'
                transcriptStore.transcriptState = 'error'
              }
            }
          } else {
            // New format: just the asset filename (e.g. "uuid.webm")
            recordingStore.audioBlobUrl = `asset://localhost/${p}`
            recordingStore.recordingState = 'stopped'
            try {
              const buffer = await window.api.readSessionAsset(id, data.audioPath)
              recordingStore.audioBlob = new Blob([buffer], { type: getMediaMimeType(data.audioPath) })
              if (data.transcript === null) {
                await transcriptStore.recoverTranscriptFromAudio(recordingStore.audioBlob)
              }
            } catch {
              this.audioFileMissing = true
              if (!data.transcript) {
                transcriptStore.error = 'Transcript missing for saved recording and audio could not be recovered automatically.'
                transcriptStore.transcriptState = 'error'
              }
            }
          }
        }
      } catch (err) {
        console.error('[session] openSession restore failed:', err)
      }
    },

    /** Serialize all current state to JSON */
    buildSessionData(): string {
      const transcriptStore = useTranscriptStore()
      const annotationStore = useAnnotationStore()
      const recordingStore = useRecordingStore()

      // Normalise audioBlobUrl to a storable path:
      //   asset://localhost/uuid.webm  → "uuid.webm"   (new format)
      //   file:///abs/path            → "/abs/path"    (legacy)
      //   blob:...                    → null           (not persisted yet — save() handles this before calling us)
      let audioPath: string | null = null
      const url = recordingStore.audioBlobUrl
      if (url) {
        if (url.startsWith('asset://localhost/')) {
          audioPath = url.slice('asset://localhost/'.length)
        } else if (url.startsWith('file://')) {
          audioPath = url.slice('file://'.length)
        } else if (!url.startsWith('blob:')) {
          audioPath = url
        }
        // blob: URLs are ephemeral — don’t persist them (save() should have converted first)
      }

      const data: SessionData = {
        version: 1,
        savedAt: new Date().toISOString(),
        audioPath,
        transcript: transcriptStore.hasTranscript
          ? {
              language: transcriptStore.language,
              duration: transcriptStore.duration,
              words: transcriptStore.words,
              segments: transcriptStore.segments,
            }
          : null,
        annotations: annotationStore.annotations,
      }
      return JSON.stringify(data)
    },

    /** Save current session to disk (no-op if no active session) */
    async save(): Promise<void> {
      if (!this.currentSessionId) return
      try {
        // Persist ephemeral blob audio to the session assets dir before serialising.
        // blob: URLs are tied to the current browser session and can’t survive a reopen.
        const recordingStore = useRecordingStore()
        if (recordingStore.audioBlobUrl?.startsWith('blob:') && recordingStore.audioBlob) {
          const buffer = await recordingStore.audioBlob.arrayBuffer()
          const filename = await window.api.saveBlobAsset(this.currentSessionId, buffer, 'webm')
          // Switch to asset:// URL so CSP allows playback and the path survives reopens
          recordingStore.audioBlobUrl = `asset://localhost/${filename}`
        }
        await window.api.saveSession(this.currentSessionId, this.buildSessionData())
        this.lastSavedAt = Date.now()
      } catch (err) {
        console.error('[session] Auto-save failed:', err)
      }
    },

    /**
     * Save the current session, then create and switch into a brand-new empty
     * session — all without transitioning through SessionListView.
     */
    async newSession(): Promise<void> {
      // Stop auto-save to prevent races while save + create run back-to-back.
      this.stopAutoSave()
      try {
        await this.save()

        // Create the next session before resetting in-memory state so creation
        // failures do not mutate the currently-open session.
        const id = await this.createSession()

        this._resetStores()
        this.audioFileMissing = false
        this.currentSessionId = id

        try {
          const sessions = await window.api.listSessions()
          this.sessionName = sessions.find((session) => session.id === id)?.name ?? ''
        } catch {
          this.sessionName = ''
        }
      } finally {
        this.startAutoSave()
      }
    },

    /** Close the active session: save, reset all stores, clear currentSessionId */
    async closeSession(): Promise<void> {
      await this.save()
      this._resetStores()
      this.currentSessionId = null
      this.sessionName = ''
      this.audioFileMissing = false
    },

    _resetStores(): void {
      const transcriptStore = useTranscriptStore()
      const annotationStore = useAnnotationStore()
      const recordingStore = useRecordingStore()
      const playbackStore = usePlaybackStore()
      transcriptStore.invalidatePendingWork()
      transcriptStore.reset()
      annotationStore.$reset()
      recordingStore.$reset()
      playbackStore.$reset()
    },

    startAutoSave(): void {
      this.stopAutoSave()
      this.lastSavedAt = Date.now()  // treat session open as a save baseline
      this.autoSaveIntervalId = setInterval(() => { this.save() }, 30_000)
    },

    stopAutoSave(): void {
      if (this.autoSaveIntervalId !== null) {
        clearInterval(this.autoSaveIntervalId)
        this.autoSaveIntervalId = null
      }
    },

    registerSaveOnClose(): void {
      this.cleanupSaveAndQuit = window.api.onSaveAndQuit(async () => {
        await this.save()
        await window.api.saveAndQuit()
      })
    },

    unregisterSaveOnClose(): void {
      this.cleanupSaveAndQuit?.()
      this.cleanupSaveAndQuit = null
    },

    async renameSession(name: string): Promise<void> {
      if (!this.currentSessionId) return
      const trimmed = name.trim() || this.sessionName
      if (!trimmed) return
      await window.api.renameSession(this.currentSessionId, trimmed)
      this.sessionName = trimmed
    },
  },
})
