import { defineStore } from 'pinia'
import { useSidecarStore } from './sidecar'

export interface Word {
  id: number
  word: string
  start: number
  end: number
  probability: number
}

export type TranscriptState = 'empty' | 'transcribing' | 'complete' | 'error'

export const useTranscriptStore = defineStore('transcript', {
  state: () => ({
    transcriptState: 'empty' as TranscriptState,
    words: [] as Word[],
    language: '',
    duration: 0,
    error: null as string | null,
    _pollInterval: null as ReturnType<typeof setInterval> | null,
  }),

  getters: {
    // Flowing paragraph text — words joined (D-05); Phase 3 replaces with word spans
    fullText: (s): string => s.words.map((w) => w.word).join(''),
    isTranscribing: (s): boolean => s.transcriptState === 'transcribing',
    hasTranscript: (s): boolean => s.transcriptState === 'complete' && s.words.length > 0,
  },

  actions: {
    async transcribe(audioBlob: Blob): Promise<void> {
      const sidecarStore = useSidecarStore()
      if (!sidecarStore.port) {
        this.error = 'Sidecar not ready'
        this.transcriptState = 'error'
        return
      }

      this.transcriptState = 'transcribing'
      this.words = []
      this.language = ''
      this.duration = 0
      this.error = null

      this._startPolling(sidecarStore.port)

      try {
        const formData = new FormData()
        formData.append('audio', audioBlob, 'recording.webm')

        const res = await fetch(`http://localhost:${sidecarStore.port}/transcribe`, {
          method: 'POST',
          body: formData,
        })

        if (!res.ok) {
          const detail = await res.text()
          throw new Error(`Transcription failed (${res.status}): ${detail}`)
        }

        const data = (await res.json()) as {
          words: Word[]
          language: string
          duration: number
        }

        this.words = data.words
        this.language = data.language
        this.duration = data.duration
        this.transcriptState = 'complete'
      } catch (err) {
        this.error = String(err)
        this.transcriptState = 'error'
      } finally {
        this._stopPolling()
      }
    },

    _startPolling(port: number): void {
      this._stopPolling()
      this._pollInterval = setInterval(async () => {
        try {
          await fetch(`http://localhost:${port}/transcribe/status`)
        } catch {
          // sidecar may not be reachable
        }
      }, 1000)
    },

    _stopPolling(): void {
      if (this._pollInterval !== null) {
        clearInterval(this._pollInterval)
        this._pollInterval = null
      }
    },

    reset(): void {
      this._stopPolling()
      this.transcriptState = 'empty'
      this.words = []
      this.language = ''
      this.duration = 0
      this.error = null
    },
  },
})
