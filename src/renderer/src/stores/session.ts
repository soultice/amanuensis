import { defineStore } from 'pinia'
import { useTranscriptStore } from './transcript'
import { useAnnotationStore } from './annotation'
import { useRecordingStore } from './recording'
import type { Word } from './transcript'
import type { Annotation } from './annotation'

interface SessionData {
  version: 1
  savedAt: string
  audioPath: string | null
  transcript: {
    language: string
    duration: number
    words: Word[]
  } | null
  annotations: Annotation[]
}

export const useSessionStore = defineStore('session', {
  state: () => ({
    autoSaveIntervalId: null as ReturnType<typeof setInterval> | null,
    cleanupSaveAndQuit: null as (() => void) | null,
    audioFileMissing: false,  // D-14: audio not found on restore
  }),

  actions: {
    /** Serialize all current state to JSON */
    buildSessionData(): string {
      const transcriptStore = useTranscriptStore()
      const annotationStore = useAnnotationStore()
      const recordingStore = useRecordingStore()

      const data: SessionData = {
        version: 1,
        savedAt: new Date().toISOString(),
        audioPath: recordingStore.audioBlobUrl
          ? recordingStore.audioBlobUrl.replace(/^file:\/\//, '')
          : null,
        transcript: transcriptStore.hasTranscript
          ? {
              language: transcriptStore.language,
              duration: transcriptStore.duration,
              words: transcriptStore.words,
            }
          : null,
        annotations: annotationStore.annotations,
      }
      return JSON.stringify(data)
    },

    /** Atomic JSON save — completely silent (D-09, SESSION-01) */
    async save(): Promise<void> {
      try {
        await window.api.saveSession(this.buildSessionData())
      } catch (err) {
        // Silent — never surface auto-save errors to user
        console.error('[session] Auto-save failed:', err)
      }
    },

    /** Restore full session from disk (SESSION-03) */
    async restore(): Promise<void> {
      const raw = await window.api.loadSession()
      if (!raw) return

      try {
        const data: SessionData = JSON.parse(raw)
        const transcriptStore = useTranscriptStore()
        const annotationStore = useAnnotationStore()
        const recordingStore = useRecordingStore()

        // Restore transcript
        if (data.transcript) {
          transcriptStore.words = data.transcript.words
          transcriptStore.language = data.transcript.language
          transcriptStore.duration = data.transcript.duration
          transcriptStore.transcriptState = 'complete'
        }

        // Restore annotations
        annotationStore.annotations = data.annotations ?? []

        // Restore audio (D-14: warn if audio file no longer exists)
        if (data.audioPath) {
          const exists = await window.api.fileExists(data.audioPath)
          if (exists) {
            recordingStore.audioBlobUrl = `file://${data.audioPath}`
            recordingStore.recordingState = 'stopped'
          } else {
            this.audioFileMissing = true
          }
        }
      } catch (err) {
        console.error('[session] Restore failed:', err)
      }
    },

    /** Start auto-save interval — every 30s (SESSION-01) */
    startAutoSave(): void {
      this.stopAutoSave()
      this.autoSaveIntervalId = setInterval(() => {
        this.save()
      }, 30_000)
    },

    stopAutoSave(): void {
      if (this.autoSaveIntervalId !== null) {
        clearInterval(this.autoSaveIntervalId)
        this.autoSaveIntervalId = null
      }
    },

    /** Register save-on-close handler (SESSION-02) */
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
  },
})
