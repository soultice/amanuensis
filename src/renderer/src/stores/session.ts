import { defineStore } from 'pinia'
import { useTranscriptStore } from './transcript'
import { useAnnotationStore } from './annotation'
import { useRecordingStore } from './recording'
import { usePlaybackStore } from './playback'
import type { Word, Segment } from './transcript'
import type { Annotation } from './annotation'

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

export const useSessionStore = defineStore('session', {
  state: () => ({
    currentSessionId: null as string | null,
    autoSaveIntervalId: null as ReturnType<typeof setInterval> | null,
    cleanupSaveAndQuit: null as (() => void) | null,
    audioFileMissing: false,
    lastSavedAt: 0 as number,
    autoSavePeriodMs: 30_000 as number,
    sessionName: '' as string,          // display name of the active session; '' when no session open
  }),

  actions: {
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
              recordingStore.audioBlob = new Blob([buffer], { type: 'audio/webm' })
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
     * Save the current session, reset all stores, then create and open a brand-new
     * session — all without transitioning through SessionListView.
     */
    async newSession(): Promise<void> {
      // Stop auto-save to prevent a race: if the timer fires between _resetStores()
      // and createSession(), it would write empty data to the old session and could
      // overwrite the newly-created index entry. We restart after creation.
      this.stopAutoSave()
      try {
        await this.save()
        this._resetStores()
        this.audioFileMissing = false
        const id = await this.createSession()
        // Set currentSessionId directly — no data to restore for an empty session
        this.currentSessionId = id
        const sessions = await window.api.listSessions()
        this.sessionName = sessions.find((session) => session.id === id)?.name ?? ''
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
