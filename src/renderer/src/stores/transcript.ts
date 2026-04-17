import { defineStore } from 'pinia'
import { useSidecarStore } from './sidecar'
import type {
  LiveChunkResponse,
  LiveStartResponse,
  LiveStatusResponse,
  LiveStopResponse,
} from '../types/live-transcript'

export interface Word {
  id: number
  word: string
  start: number
  end: number
  probability: number
  segmentId: number
}

export interface Segment {
  id: number
  start: number
  end: number
  text: string
}

export type TranscriptState = 'empty' | 'transcribing' | 'live' | 'finalizing' | 'complete' | 'error'

export const useTranscriptStore = defineStore('transcript', {
  state: () => ({
    transcriptState: 'empty' as TranscriptState,
    words: [] as Word[],
    segments: [] as Segment[],
    language: '',
    duration: 0,
    interimText: '',
    liveSessionId: null as string | null,
    liveWarning: null as string | null,
    liveFeatureAvailable: null as boolean | null,
    liveTimeToFirstTokenMs: null as number | null,
    liveServerLatencyMs: null as number | null,
    liveQueueDepth: 0,
    liveWorkerBusy: false as boolean,
    liveWaitingRequests: 0 as number,
    liveUpdateGapMs: null as number | null,
    liveSpeedMode: 'safe_auto' as 'safe_auto' | 'aggressive_internal',
    boundaryMarkers: [] as Array<{ type: 'pause-start' | 'pause-end'; atMs: number }>,
    error: null as string | null,
    _seq: 0,
    _pollInterval: null as ReturnType<typeof setInterval> | null,
    _livePollInterval: null as ReturnType<typeof setInterval> | null,
    _liveStartPromise: null as Promise<boolean> | null,
    _recoveryAttempted: false,
    _runId: 0,
  }),

  getters: {
    fullText: (s): string => s.words.map((w) => String(w.word ?? '')).join(''),
    isTranscribing: (s): boolean => s.transcriptState === 'transcribing' || s.transcriptState === 'finalizing',
    hasTranscript: (s): boolean => s.transcriptState === 'complete' && s.words.length > 0,
    isLive: (s): boolean => s.transcriptState === 'live' || s.transcriptState === 'finalizing',
  },

  actions: {
    _isCurrentRun(runId: number): boolean {
      return this._runId === runId
    },

    invalidatePendingWork(): void {
      this._runId += 1
      this._stopPolling()
      this._stopLiveStatusPolling()
      this.liveSessionId = null
      this._liveStartPromise = null
    },

    _resetForNewTranscript(options?: { preserveDiagnostics?: boolean; preserveFeatureAvailability?: boolean }): void {
      this.words = []
      this.segments = []
      this.language = ''
      this.duration = 0
      this.interimText = ''
      if (!options?.preserveDiagnostics) {
        this.liveWarning = null
        this.error = null
      }
      if (!options?.preserveFeatureAvailability) {
        this.liveFeatureAvailable = null
      }
      this.liveSessionId = null
      this._liveStartPromise = null
      this.liveTimeToFirstTokenMs = null
      this.liveServerLatencyMs = null
      this.liveQueueDepth = 0
      this.liveWorkerBusy = false
      this.liveWaitingRequests = 0
      this.liveUpdateGapMs = null
      this.liveSpeedMode = 'safe_auto'
      this.boundaryMarkers = []
      this._seq = 0
      this._recoveryAttempted = false
    },

    async recoverTranscriptFromAudio(audioBlob: Blob): Promise<void> {
      if (this._recoveryAttempted) return

      const sidecarStore = useSidecarStore()
      if (!sidecarStore.port) {
        this.error = 'Sidecar not ready'
        this.transcriptState = 'error'
        return
      }

      const runId = this._runId + 1
      this._runId = runId
      this._recoveryAttempted = true
      this.transcriptState = 'transcribing'
      this._resetForNewTranscript({ preserveDiagnostics: true, preserveFeatureAvailability: true })
      this._recoveryAttempted = true
      this.transcriptState = 'transcribing'
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
          throw new Error(`Transcription recovery failed (${res.status}): ${detail}`)
        }

        const data = (await res.json()) as {
          words: Word[]
          segments: Segment[]
          language: string
          duration: number
        }

        if (!this._isCurrentRun(runId)) return

        this.words = data.words
        this.segments = data.segments ?? []
        this.language = data.language
        this.duration = data.duration
        this.error = null
        this.transcriptState = 'complete'
      } catch (err) {
        if (!this._isCurrentRun(runId)) return
        this.error = String(err)
        this.transcriptState = 'error'
      } finally {
        if (this._isCurrentRun(runId)) {
          this._stopPolling()
        }
      }
    },

    async startLiveSession(): Promise<void> {
      const sidecarStore = useSidecarStore()
      if (!sidecarStore.port) {
        this.liveWarning = 'Sidecar not ready for live transcription'
        return
      }

      if (this.liveFeatureAvailable === false) {
        this.liveWarning = 'Live transcription unavailable in running sidecar build (restart app or rebuild sidecar). Falling back to full transcript recovery from recorded audio.'
        return
      }

      if (this._liveStartPromise) {
        await this._liveStartPromise
        return
      }

      const runId = this._runId + 1
      this._runId = runId
      this._resetForNewTranscript()
      this.transcriptState = 'live'

      const startPromise = (async (): Promise<boolean> => {
        try {
          const res = await fetch(`http://localhost:${sidecarStore.port}/transcribe/live/start`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              sampleRate: 44100,
              channels: 1,
              mimeType: 'audio/webm;codecs=opus',
            }),
          })

          if (!res.ok) {
            const detail = await res.text()
            if (!this._isCurrentRun(runId)) return false
            if (res.status === 404) {
              this.liveFeatureAvailable = false
              this.liveWarning = 'Live transcription unavailable in running sidecar build (restart app or rebuild sidecar). Falling back to full transcript recovery from recorded audio.'
              return false
            }
            throw new Error(`Live start failed (${res.status}): ${detail}`)
          }

          const data = (await res.json()) as LiveStartResponse
          if (!this._isCurrentRun(runId)) return false
          this.liveSessionId = data.sessionId
          this.liveFeatureAvailable = true
          this.liveSpeedMode = data.speedMode ?? 'safe_auto'
          if (data.warning) this.liveWarning = data.warning
          this._seq = 0
          return true
        } catch (err) {
          if (!this._isCurrentRun(runId)) return false
          this.liveWarning = `Live transcription failed — recording continues (${String(err)}). Falling back to full transcript recovery from recorded audio.`
          return false
        }
      })()

      this._liveStartPromise = startPromise

      try {
        await startPromise
      } finally {
        if (this._isCurrentRun(runId) && this._liveStartPromise === startPromise) {
          this._liveStartPromise = null
        }
      }
    },

    async pushLiveChunk(audioChunk: Blob, chunkStartMs: number, chunkEndMs: number, isLast = false): Promise<boolean> {
      const sidecarStore = useSidecarStore()
      if (!sidecarStore.port || !this.liveSessionId) return false

      const runId = this._runId
      const liveSessionId = this.liveSessionId
      this._seq += 1

      const formData = new FormData()
      formData.append('sessionId', liveSessionId)
      formData.append('seq', String(this._seq))
      formData.append('chunkStartMs', String(Math.max(0, Math.floor(chunkStartMs))))
      formData.append('chunkEndMs', String(Math.max(0, Math.floor(chunkEndMs))))
      formData.append('isLast', isLast ? 'true' : 'false')
      formData.append('audio', audioChunk, `chunk-${this._seq}.webm`)

      try {
        const res = await fetch(`http://localhost:${sidecarStore.port}/transcribe/live/chunk`, {
          method: 'POST',
          body: formData,
        })

        if (!res.ok) {
          const detail = await res.text()
          throw new Error(`Live chunk failed (${res.status}): ${detail}`)
        }

        const data = (await res.json()) as LiveChunkResponse
        if (!this._isCurrentRun(runId) || this.liveSessionId !== liveSessionId) return false

        // Live chunk responses provide a full committed snapshot (not append-only delta).
        if (data.finalized.words.length > 0 || data.finalized.segments.length > 0) {
          this.words = data.finalized.words
          this.segments = data.finalized.segments
          const last = this.words[this.words.length - 1]
          if (last) this.duration = Math.max(this.duration, last.end)
        }

        this.liveServerLatencyMs = data.metrics?.serverLatencyMs ?? this.liveServerLatencyMs
        this.liveTimeToFirstTokenMs = data.metrics?.timeToFirstTokenMs ?? this.liveTimeToFirstTokenMs
        this.liveQueueDepth = data.metrics?.queueDepth ?? this.liveQueueDepth
        this.liveWorkerBusy = data.metrics?.workerBusy ?? this.liveWorkerBusy
        this.liveWaitingRequests = data.metrics?.waitingRequests ?? this.liveWaitingRequests
        this.liveUpdateGapMs = data.metrics?.updateGapMs ?? this.liveUpdateGapMs
        this.liveSpeedMode = data.metrics?.speedMode ?? this.liveSpeedMode

        this.interimText = data.interimText ?? ''
        return true
      } catch (err) {
        if (!this._isCurrentRun(runId) || this.liveSessionId !== liveSessionId) return false
        this.liveWarning = `Live transcription failed — recording continues (${String(err)})`
        return false
      }
    },

    async pauseLiveSession(atMs: number): Promise<void> {
      const sidecarStore = useSidecarStore()
      if (!sidecarStore.port || !this.liveSessionId) return

      const runId = this._runId
      const liveSessionId = this.liveSessionId

      try {
        const res = await fetch(`http://localhost:${sidecarStore.port}/transcribe/live/pause`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sessionId: liveSessionId, atMs: Math.max(0, Math.floor(atMs)) }),
        })
        if (!res.ok) throw new Error(await res.text())
        if (!this._isCurrentRun(runId) || this.liveSessionId !== liveSessionId) return
        this.boundaryMarkers.push({ type: 'pause-start', atMs })
      } catch (err) {
        if (!this._isCurrentRun(runId) || this.liveSessionId !== liveSessionId) return
        this.liveWarning = `Live transcription failed — recording continues (${String(err)})`
      }
    },

    async resumeLiveSession(atMs: number): Promise<void> {
      const sidecarStore = useSidecarStore()
      if (!sidecarStore.port || !this.liveSessionId) return

      const runId = this._runId
      const liveSessionId = this.liveSessionId

      try {
        const res = await fetch(`http://localhost:${sidecarStore.port}/transcribe/live/resume`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sessionId: liveSessionId, atMs: Math.max(0, Math.floor(atMs)) }),
        })
        if (!res.ok) throw new Error(await res.text())
        if (!this._isCurrentRun(runId) || this.liveSessionId !== liveSessionId) return
        this.boundaryMarkers.push({ type: 'pause-end', atMs })
      } catch (err) {
        if (!this._isCurrentRun(runId) || this.liveSessionId !== liveSessionId) return
        this.liveWarning = `Live transcription failed — recording continues (${String(err)})`
      }
    },

    async stopLiveSession(atMs: number): Promise<boolean> {
      const sidecarStore = useSidecarStore()
      if (!sidecarStore.port) return false

      const runId = this._runId
      if (!this.liveSessionId && this._liveStartPromise) {
        await this._liveStartPromise
      }
      if (!this._isCurrentRun(runId) || !this.liveSessionId) return false

      const liveSessionId = this.liveSessionId
      this.transcriptState = 'finalizing'

      try {
        const res = await fetch(`http://localhost:${sidecarStore.port}/transcribe/live/stop`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sessionId: liveSessionId, atMs: Math.max(0, Math.floor(atMs)) }),
        })

        if (!res.ok) {
          const detail = await res.text()
          throw new Error(`Live stop failed (${res.status}): ${detail}`)
        }

        const data = (await res.json()) as LiveStopResponse
        if (!this._isCurrentRun(runId) || this.liveSessionId !== liveSessionId) return false
        this.words = data.words ?? []
        this.segments = data.segments ?? []
        this.language = data.language ?? ''
        this.duration = data.duration ?? atMs / 1000
        this.interimText = ''
        this.error = null
        this.transcriptState = this.words.length > 0 ? 'complete' : 'empty'
        return true
      } catch (err) {
        if (!this._isCurrentRun(runId) || this.liveSessionId !== liveSessionId) return false
        this.liveWarning = `Live transcription failed — recording continues (${String(err)}). Falling back to full transcript recovery from recorded audio.`
        this.transcriptState = this.words.length > 0 ? 'complete' : 'error'
        this.error = String(err)
        return false
      } finally {
        if (this._isCurrentRun(runId) && this.liveSessionId === liveSessionId) {
          this.liveSessionId = null
          this._stopLiveStatusPolling()
        }
      }
    },

    _startLiveStatusPolling(port: number): void {
      this._stopLiveStatusPolling()
      const runId = this._runId
      this._livePollInterval = setInterval(async () => {
        if (!this._isCurrentRun(runId) || !this.liveSessionId) return
        const liveSessionId = this.liveSessionId
        try {
          const res = await fetch(`http://localhost:${port}/transcribe/live/status?sessionId=${encodeURIComponent(liveSessionId)}`)
          if (!res.ok || !this._isCurrentRun(runId) || this.liveSessionId !== liveSessionId) return
          const data = (await res.json()) as LiveStatusResponse
          if (!this._isCurrentRun(runId) || this.liveSessionId !== liveSessionId) return
          if (data.warning) this.liveWarning = data.warning
          if (data.error) this.error = data.error
          this.liveQueueDepth = data.queueDepth ?? this.liveQueueDepth
          this.liveWorkerBusy = data.metrics?.observed?.workerBusy ?? this.liveWorkerBusy
          this.liveWaitingRequests = data.metrics?.observed?.waitingRequests ?? this.liveWaitingRequests
          this.liveTimeToFirstTokenMs = data.metrics?.observed?.ttftMs ?? this.liveTimeToFirstTokenMs
          this.liveServerLatencyMs = data.metrics?.observed?.lastChunkLatencyMs ?? this.liveServerLatencyMs
        } catch {
          // sidecar may not be reachable
        }
      }, 250)
    },

    _stopLiveStatusPolling(): void {
      if (this._livePollInterval !== null) {
        clearInterval(this._livePollInterval)
        this._livePollInterval = null
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
      this._runId += 1
      this._stopPolling()
      this._stopLiveStatusPolling()
      this.transcriptState = 'empty'
      this.words = []
      this.segments = []
      this.language = ''
      this.duration = 0
      this.interimText = ''
      this.liveSessionId = null
      this.liveWarning = null
      this.liveFeatureAvailable = null
      this.liveTimeToFirstTokenMs = null
      this.liveServerLatencyMs = null
      this.liveQueueDepth = 0
      this.liveWorkerBusy = false
      this.liveWaitingRequests = 0
      this.liveUpdateGapMs = null
      this.liveSpeedMode = 'safe_auto'
      this.boundaryMarkers = []
      this.error = null
      this._seq = 0
      this._liveStartPromise = null
      this._recoveryAttempted = false
    },
  },
})
