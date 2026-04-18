import { defineStore } from 'pinia'
import { useSidecarStore } from './sidecar'
import { LiveTranscriptionStream } from '../lib/live-transcription-stream'
import type {
  LiveOutputEvent,
  LivePatchEvent,
  LivePcmPacketMetadata,
  LivePrepareRequest,
  LiveTelemetryEvent,
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
    liveRuntimeProvider: null as string | null,
    liveRuntimeQuantization: null as string | null,
    liveRuntimeFallbackUsed: false as boolean,
    liveTimeToFirstTokenMs: null as number | null,
    liveServerLatencyMs: null as number | null,
    liveQueueDepth: 0,
    liveWorkerBusy: false as boolean,
    liveWaitingRequests: 0 as number,
    liveUpdateGapMs: null as number | null,
    livePendingLatest: false as boolean,
    liveLatestSeqAccepted: 0 as number,
    liveLatestSeqProcessed: 0 as number,
    liveSupersededResultsDropped: 0 as number,
    liveSpeedMode: 'safe_auto' as 'safe_auto' | 'aggressive_internal',
    boundaryMarkers: [] as Array<{ type: 'pause-start' | 'pause-end'; atMs: number }>,
    error: null as string | null,
    _pollInterval: null as ReturnType<typeof setInterval> | null,
    _recoveryAttempted: false,
    _runId: 0,
    _liveStream: null as LiveTranscriptionStream | null,
    _liveCaptureSampleRate: 16000 as number,
    _livePacketSamples: 2048 as number,
    _liveSeq: 0 as number,
    _liveCompletePromise: null as Promise<boolean> | null,
    _resolveLiveComplete: null as ((value: boolean) => void) | null,
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

    _createLiveCompletionPromise(): void {
      this._liveCompletePromise = new Promise<boolean>((resolve) => {
        this._resolveLiveComplete = resolve
      })
    },

    _resolveLiveCompletion(value: boolean): void {
      this._resolveLiveComplete?.(value)
      this._resolveLiveComplete = null
      this._liveCompletePromise = null
    },

    _applyPatch(event: LivePatchEvent): void {
      const replaceFromWordIndex = Math.max(0, event.finalized.replaceFromWordIndex ?? 0)
      this.words = [...this.words.slice(0, replaceFromWordIndex), ...event.finalized.words]
      this.segments = event.finalized.segments
      const last = this.words[this.words.length - 1]
      if (last) this.duration = Math.max(this.duration, last.end)
      this.interimText = event.interimText ?? ''
      this._applyTelemetry(event.metrics)
    },

    _applyTelemetry(metrics?: Partial<LiveTelemetryEvent> | null): void {
      if (!metrics) return
      this.liveServerLatencyMs = (metrics.serverLatencyMs as number | undefined) ?? this.liveServerLatencyMs
      this.liveTimeToFirstTokenMs = (metrics.timeToFirstTokenMs as number | undefined) ?? this.liveTimeToFirstTokenMs
      this.liveQueueDepth = (metrics.queueDepth as number | undefined) ?? this.liveQueueDepth
      this.liveWorkerBusy = (metrics.workerBusy as boolean | undefined) ?? this.liveWorkerBusy
      this.liveWaitingRequests = (metrics.waitingRequests as number | undefined) ?? this.liveWaitingRequests
      this.liveUpdateGapMs = (metrics.updateGapMs as number | undefined) ?? this.liveUpdateGapMs
      this.livePendingLatest = (metrics.pendingLatest as boolean | undefined) ?? this.livePendingLatest
      this.liveLatestSeqAccepted = (metrics.latestSeqAccepted as number | undefined) ?? this.liveLatestSeqAccepted
      this.liveLatestSeqProcessed = (metrics.latestSeqProcessed as number | undefined) ?? this.liveLatestSeqProcessed
      this.liveSupersededResultsDropped =
        (metrics.supersededResultsDropped as number | undefined) ?? this.liveSupersededResultsDropped
      this.liveSpeedMode =
        ((metrics.speedMode as 'safe_auto' | 'aggressive_internal' | undefined) ?? this.liveSpeedMode)
    },

    _handleLiveEvent(event: LiveOutputEvent, runId: number): void {
      if (!this._isCurrentRun(runId)) return

      switch (event.type) {
        case 'ready':
          this.liveQueueDepth = event.queueDepth
          this.liveWorkerBusy = event.workerBusy
          this.liveWaitingRequests = event.waitingRequests
          this.transcriptState = 'live'
          break
        case 'patch':
          this.transcriptState = 'live'
          this._applyPatch(event)
          break
        case 'telemetry':
          this._applyTelemetry(event)
          break
        case 'state':
          if (event.state === 'finalizing') {
            this.transcriptState = 'finalizing'
          }
          break
        case 'complete':
          this.words = event.words ?? []
          this.segments = event.segments ?? []
          this.language = event.language ?? ''
          this.duration = event.duration ?? this.duration
          this.interimText = ''
          this.error = null
          this.transcriptState = this.words.length > 0 ? 'complete' : 'empty'
          this._resolveLiveCompletion(true)
          this._closeLiveStream()
          break
        case 'error':
          this.error = event.message
          this.liveWarning = event.message
          this.transcriptState = 'error'
          this._resolveLiveCompletion(false)
          this._closeLiveStream()
          break
      }
    },

    _handleLiveFatal(message: string, runId: number): void {
      if (!this._isCurrentRun(runId)) return
      this.error = message
      this.liveWarning = message
      this.transcriptState = 'error'
      this._resolveLiveCompletion(false)
      this._closeLiveStream()
    },

    _closeLiveStream(): void {
      this._liveStream?.close()
      this._liveStream = null
      this.liveSessionId = null
    },

    invalidatePendingWork(): void {
      this._runId += 1
      this._stopPolling()
      this._closeLiveStream()
      this._resolveLiveComplete = null
      this._liveCompletePromise = null
      this.liveSessionId = null
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
      this.liveRuntimeProvider = null
      this.liveRuntimeQuantization = null
      this.liveRuntimeFallbackUsed = false
      this.liveTimeToFirstTokenMs = null
      this.liveServerLatencyMs = null
      this.liveQueueDepth = 0
      this.liveWorkerBusy = false
      this.liveWaitingRequests = 0
      this.liveUpdateGapMs = null
      this.livePendingLatest = false
      this.liveLatestSeqAccepted = 0
      this.liveLatestSeqProcessed = 0
      this.liveSupersededResultsDropped = 0
      this.liveSpeedMode = 'safe_auto'
      this.boundaryMarkers = []
      this._liveSeq = 0
      this._recoveryAttempted = false
      this._closeLiveStream()
      this._resolveLiveComplete = null
      this._liveCompletePromise = null
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

    async prepareLiveStream(params: {
      sampleRate: number
      channels: number
      archiveMimeType: string | null
      packetSamples?: number
    }): Promise<void> {
      const sidecarStore = useSidecarStore()
      if (!sidecarStore.port) {
        throw new Error('Sidecar not ready for live transcription')
      }

      const runId = this._runId + 1
      this._runId = runId
      this._resetForNewTranscript()
      this.transcriptState = 'transcribing'
      this._createLiveCompletionPromise()
      this._liveCaptureSampleRate = params.sampleRate
      this._livePacketSamples = params.packetSamples ?? 2048

      const stream = new LiveTranscriptionStream()
      this._liveStream = stream

      try {
        const request: LivePrepareRequest = {
          sampleRate: params.sampleRate,
          channels: params.channels,
          pcmEncoding: 'pcm_s16le',
          packetSamples: params.packetSamples ?? 2048,
          archiveMimeType: params.archiveMimeType,
        }
        const prepared = await stream.prepare(sidecarStore.port, request)
        if (!this._isCurrentRun(runId)) return

        this.liveSessionId = prepared.sessionId
        this.liveFeatureAvailable = true
        this.liveRuntimeProvider = prepared.runtimeProvider ?? null
        this.liveRuntimeQuantization = prepared.runtimeQuantization ?? null
        this.liveRuntimeFallbackUsed = prepared.runtimeFallbackUsed ?? false
        this.liveSpeedMode = prepared.speedMode ?? 'safe_auto'
        this.liveWarning = prepared.warning ?? null

        await stream.connect(sidecarStore.port, prepared, {
          onEvent: (event) => this._handleLiveEvent(event, runId),
          onFatal: (message) => this._handleLiveFatal(message, runId),
        })

        if (!this._isCurrentRun(runId)) return
        stream.sendControl({ type: 'start', sessionId: prepared.sessionId })
        this.transcriptState = 'live'
      } catch (error) {
        this._handleLiveFatal(String(error), runId)
        throw error
      }
    },

    sendLivePcmPacket(packet: { pcm: ArrayBuffer; frameCount: number; endFrame: number }): void {
      if (!this._liveStream || !this.liveSessionId) {
        throw new Error('Live stream is not prepared')
      }
      this._liveSeq += 1
      const metadata: LivePcmPacketMetadata = {
        type: 'pcm',
        sessionId: this.liveSessionId,
        seq: this._liveSeq,
        captureStartSample: packet.endFrame - packet.frameCount,
        captureEndSample: packet.endFrame,
        captureStartMs: ((packet.endFrame - packet.frameCount) / this._liveCaptureSampleRate) * 1000,
        captureEndMs: (packet.endFrame / this._liveCaptureSampleRate) * 1000,
        sampleRate: this._liveCaptureSampleRate,
        channels: 1,
        bytes: packet.pcm.byteLength,
        pcmEncoding: 'pcm_s16le',
      }
      this._liveStream.sendPcm(metadata, packet.pcm)
    },

    async pauseLiveSession(atMs: number): Promise<void> {
      if (!this._liveStream || !this.liveSessionId) return
      this.boundaryMarkers.push({ type: 'pause-start', atMs })
      this._liveStream.sendControl({ type: 'pause', sessionId: this.liveSessionId, atMs: Math.max(0, Math.floor(atMs)) })
    },

    async resumeLiveSession(atMs: number): Promise<void> {
      if (!this._liveStream || !this.liveSessionId) return
      this.boundaryMarkers.push({ type: 'pause-end', atMs })
      this._liveStream.sendControl({ type: 'resume', sessionId: this.liveSessionId, atMs: Math.max(0, Math.floor(atMs)) })
    },

    async stopLiveSession(atMs: number): Promise<boolean> {
      if (!this._liveStream || !this.liveSessionId) return false
      this.transcriptState = 'finalizing'
      if (!this._liveCompletePromise) {
        this._createLiveCompletionPromise()
      }
      this._liveStream.sendControl({ type: 'stop', sessionId: this.liveSessionId, atMs: Math.max(0, Math.floor(atMs)) })
      const complete = await this._liveCompletePromise!
      if (!complete) {
        this._closeLiveStream()
      }
      return complete
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
      this.transcriptState = 'empty'
      this.words = []
      this.segments = []
      this.language = ''
      this.duration = 0
      this.interimText = ''
      this.liveSessionId = null
      this.liveWarning = null
      this.liveFeatureAvailable = null
      this.liveRuntimeProvider = null
      this.liveRuntimeQuantization = null
      this.liveRuntimeFallbackUsed = false
      this.liveTimeToFirstTokenMs = null
      this.liveServerLatencyMs = null
      this.liveQueueDepth = 0
      this.liveWorkerBusy = false
      this.liveWaitingRequests = 0
      this.liveUpdateGapMs = null
      this.livePendingLatest = false
      this.liveLatestSeqAccepted = 0
      this.liveLatestSeqProcessed = 0
      this.liveSupersededResultsDropped = 0
      this.liveSpeedMode = 'safe_auto'
      this.boundaryMarkers = []
      this.error = null
      this._recoveryAttempted = false
      this._liveCaptureSampleRate = 16000
      this._livePacketSamples = 2048
      this._liveSeq = 0
      this._closeLiveStream()
      this._resolveLiveComplete = null
      this._liveCompletePromise = null
    },
  },
})
