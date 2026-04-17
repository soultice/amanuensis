import { defineStore } from 'pinia'
import { markRaw } from 'vue'
import { useTranscriptStore } from './transcript'

export type RecordingState = 'idle' | 'recording' | 'paused' | 'stopped'

const LIVE_FLUSH_WINDOW_MS_INITIAL = 250
const LIVE_FLUSH_WINDOW_MS_MIN = 150
const LIVE_FLUSH_WINDOW_MS_MAX = 700
const LIVE_FLUSH_BACKPRESSURE_QUEUE_DEPTH = 2
const LIVE_FLUSH_MIN_BYTES = 4 * 1024

function computeAdaptiveFlushWindowMs(
  serverLatencyMs: number | null,
  queueDepth: number,
  speedMode: 'safe_auto' | 'aggressive_internal',
  firstTokenSeen: boolean,
): number {
  if (!firstTokenSeen) {
    return LIVE_FLUSH_WINDOW_MS_INITIAL
  }

  let nextWindow = LIVE_FLUSH_WINDOW_MS_INITIAL

  if (speedMode === 'safe_auto') {
    if (queueDepth >= LIVE_FLUSH_BACKPRESSURE_QUEUE_DEPTH || (serverLatencyMs !== null && serverLatencyMs > 900)) {
      nextWindow = 650
    } else if (queueDepth <= 1 && serverLatencyMs !== null && serverLatencyMs <= 600) {
      nextWindow = 200
    } else {
      nextWindow = 400
    }
  } else {
    if (queueDepth === 0 && serverLatencyMs !== null && serverLatencyMs <= 700) {
      nextWindow = 150
    } else {
      nextWindow = 500
    }
  }

  return Math.max(LIVE_FLUSH_WINDOW_MS_MIN, Math.min(nextWindow, LIVE_FLUSH_WINDOW_MS_MAX))
}

export const useRecordingStore = defineStore('recording', {
  state: () => ({
    recordingState: 'idle' as RecordingState,
    devices: [] as MediaDeviceInfo[],
    selectedDeviceId: '' as string,
    audioBlob: null as Blob | null,
    audioBlobUrl: null as string | null,
    levelBars: new Array(12).fill(0) as number[],
    durationMs: 0,
    error: null as string | null,
    // Internal — managed directly, not deeply reactive
    _recorder: null as MediaRecorder | null,
    _stream: null as MediaStream | null,
    _chunks: [] as BlobPart[],
    _startTime: 0,
    _pausedMs: 0,
    _pauseStart: 0,
    _lastChunkEndMs: 0,
    _livePendingChunks: [] as Blob[],
    _livePendingBytes: 0,
    _liveBatchStartMs: 0,
    _liveChunkAccepted: false,
  }),

  getters: {
    hasRecording: (s): boolean => s.audioBlob !== null,
    isRecording: (s): boolean => s.recordingState === 'recording',
    isPaused: (s): boolean => s.recordingState === 'paused',
    isActive: (s): boolean => s.recordingState === 'recording' || s.recordingState === 'paused',
    isStopped: (s): boolean => s.recordingState === 'stopped',
  },

  actions: {
    async loadDevices(): Promise<void> {
      this.error = null
      try {
        const permStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false })
        permStream.getTracks().forEach((t) => t.stop())

        const all = await navigator.mediaDevices.enumerateDevices()
        this.devices = all.filter((d) => d.kind === 'audioinput')
        if (this.devices.length > 0 && !this.selectedDeviceId) {
          this.selectedDeviceId = this.devices[0].deviceId
        }
      } catch (err) {
        this.error = `Microphone access denied: ${String(err)}`
      }
    },

    _currentElapsedMs(): number {
      const now = Date.now()
      const pausedNow = this._pauseStart > 0 ? now - this._pauseStart : 0
      return Math.max(0, now - this._startTime - this._pausedMs - pausedNow)
    },

    async _flushLiveChunks(force = false): Promise<void> {
      const transcriptStore = useTranscriptStore()
      if (!transcriptStore.liveSessionId || this._livePendingChunks.length === 0) return

      const nowMs = this._currentElapsedMs()
      const bufferedMs = Math.max(0, nowMs - this._liveBatchStartMs)
      const firstTokenSeen = transcriptStore.liveTimeToFirstTokenMs !== null
      const adaptiveWindowMs = computeAdaptiveFlushWindowMs(
        transcriptStore.liveServerLatencyMs,
        transcriptStore.liveQueueDepth,
        transcriptStore.liveSpeedMode,
        firstTokenSeen,
      )
      const shouldFlush = force || bufferedMs >= adaptiveWindowMs || this._livePendingBytes >= LIVE_FLUSH_MIN_BYTES
      if (!shouldFlush) return

      const chunkStartMs = this._liveBatchStartMs
      const chunkEndMs = nowMs
      const combined = new Blob(this._livePendingChunks, { type: 'audio/webm' })

      this._livePendingChunks = []
      this._livePendingBytes = 0
      this._liveBatchStartMs = chunkEndMs
      this._lastChunkEndMs = chunkEndMs

      const accepted = await transcriptStore.pushLiveChunk(combined, chunkStartMs, chunkEndMs, false)
      this._liveChunkAccepted = this._liveChunkAccepted || accepted
    },

    async startRecording(): Promise<void> {
      if (this.recordingState === 'recording') return
      this.error = null
      this.audioBlob = null
      if (this.audioBlobUrl) {
        URL.revokeObjectURL(this.audioBlobUrl)
        this.audioBlobUrl = null
      }
      this._chunks = []
      this._pausedMs = 0
      this._pauseStart = 0
      this._lastChunkEndMs = 0
      this._livePendingChunks = []
      this._livePendingBytes = 0
      this._liveBatchStartMs = 0
      this._liveChunkAccepted = false

      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: {
            deviceId: this.selectedDeviceId ? { exact: this.selectedDeviceId } : undefined,
            sampleRate: 44100,
            channelCount: 1,
          },
        })
        this._stream = markRaw(stream)

        const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
          ? 'audio/webm;codecs=opus'
          : 'audio/webm'
        const recorder = new MediaRecorder(stream, { mimeType })
        this._recorder = markRaw(recorder)

        recorder.ondataavailable = (e: BlobEvent) => {
          if (e.data.size <= 0) return
          this._chunks.push(e.data)

          const transcriptStore = useTranscriptStore()
          if (!transcriptStore.liveSessionId) return

          if (this._liveBatchStartMs === 0) {
            this._liveBatchStartMs = this._lastChunkEndMs
          }
          this._livePendingChunks.push(e.data)
          this._livePendingBytes += e.data.size
          void this._flushLiveChunks(false)
        }

        recorder.onstop = () => {
          const blob = new Blob(this._chunks, { type: 'audio/webm' })
          this.audioBlob = blob
          this.audioBlobUrl = URL.createObjectURL(blob)
          this.durationMs = this._currentElapsedMs()
          this.recordingState = 'stopped'
          this._stream?.getTracks().forEach((t) => t.stop())
          this._stream = null

          const transcriptStore = useTranscriptStore()
          void (async () => {
            if (transcriptStore.transcriptState === 'live' || transcriptStore.transcriptState === 'finalizing') {
              await this._flushLiveChunks(true)
              const finalized = await transcriptStore.stopLiveSession(this.durationMs)
              if (this.audioBlob && (!finalized || !this._liveChunkAccepted)) {
                await transcriptStore.recoverTranscriptFromAudio(this.audioBlob)
              }
              return
            }

            const shouldRecoverFromAudio =
              !!this.audioBlob &&
              !transcriptStore.hasTranscript &&
              (transcriptStore.liveFeatureAvailable === false || transcriptStore.liveWarning !== null)

            if (shouldRecoverFromAudio && this.audioBlob) {
              await transcriptStore.recoverTranscriptFromAudio(this.audioBlob)
            }
          })()
        }

        recorder.start(100)
        this._startTime = Date.now()
        this.recordingState = 'recording'
      } catch (err) {
        this.error = `Recording failed: ${String(err)}`
      }
    },

    stopRecording(): void {
      if (!this._recorder) return
      const state = this._recorder.state
      if (state === 'paused') {
        if (this._pauseStart > 0) {
          this._pausedMs += Date.now() - this._pauseStart
          this._pauseStart = 0
        }
        this._recorder.resume()
        setTimeout(() => this._recorder?.stop(), 0)
      } else if (state === 'recording') {
        this._recorder.stop()
      }
    },

    pauseRecording(): void {
      if (this._recorder && this._recorder.state === 'recording') {
        this._recorder.pause()
        this._pauseStart = Date.now()
        this.recordingState = 'paused'

        const transcriptStore = useTranscriptStore()
        void (async () => {
          await this._flushLiveChunks(true)
          await transcriptStore.pauseLiveSession(this._currentElapsedMs())
        })()
      }
    },

    resumeRecording(): void {
      if (this._recorder && this._recorder.state === 'paused') {
        if (this._pauseStart > 0) {
          this._pausedMs += Date.now() - this._pauseStart
          this._pauseStart = 0
        }
        this._recorder.resume()
        this.recordingState = 'recording'

        const transcriptStore = useTranscriptStore()
        this._liveBatchStartMs = this._lastChunkEndMs
        void transcriptStore.resumeLiveSession(this._currentElapsedMs())
      }
    },

    setLevelBars(bars: number[]): void {
      this.levelBars = bars
    },

    resetLevelBars(): void {
      this.levelBars = new Array(12).fill(0)
    },

    clearRecording(): void {
      if (this.audioBlobUrl) URL.revokeObjectURL(this.audioBlobUrl)
      this.audioBlob = null
      this.audioBlobUrl = null
      this.durationMs = 0
      this.recordingState = 'idle'
      this._pausedMs = 0
      this._pauseStart = 0
      this._lastChunkEndMs = 0
      this._livePendingChunks = []
      this._livePendingBytes = 0
      this._liveBatchStartMs = 0
      this._liveChunkAccepted = false
      this.resetLevelBars()
    },
  },
})
