import { defineStore } from 'pinia'
import { markRaw } from 'vue'
import { useTranscriptStore } from './transcript'
import livePcmCaptureWorkletUrl from '../audio/live-pcm-capture.worklet.ts?url'

export type RecordingState = 'idle' | 'recording' | 'paused' | 'stopped'

const LIVE_PCM_SAMPLE_RATE = 16000
const LIVE_PCM_CHANNELS = 1
const LIVE_PCM_PACKET_SAMPLES = 2048
const LIVE_PCM_FIRST_SEND_TARGET_MS = 192
const LIVE_PCM_IDLE_SEND_TARGET_MS = 192
const LIVE_PCM_BUSY_SEND_TARGET_MS = 320
const LIVE_PCM_MAX_BUFFER_MS = 640
const LIVE_PCM_MAX_BUFFER_BYTES = 24 * 1024
const LIVE_PCM_FLUSH_ACK_TIMEOUT_MS = 150

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
    _recorder: null as MediaRecorder | null,
    _stream: null as MediaStream | null,
    _chunks: [] as BlobPart[],
    _startTime: 0,
    _pausedMs: 0,
    _pauseStart: 0,
    _audioContext: null as AudioContext | null,
    _mediaSourceNode: null as MediaStreamAudioSourceNode | null,
    _pcmNode: null as AudioWorkletNode | null,
    _silentGainNode: null as GainNode | null,
    _livePendingChunks: [] as ArrayBuffer[],
    _livePendingBytes: 0 as number,
    _livePendingFrames: 0 as number,
    _livePendingEndFrame: 0 as number,
    _liveChunkAccepted: false,
    _pendingWorkletFlushResolve: null as (() => void) | null,
    _liveStopPromise: null as Promise<boolean> | null,
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

    _combinePendingPcm(): ArrayBuffer {
      const combined = new Uint8Array(this._livePendingBytes)
      let offset = 0
      for (const chunk of this._livePendingChunks) {
        combined.set(new Uint8Array(chunk), offset)
        offset += chunk.byteLength
      }
      return combined.buffer
    },

    _appendLivePcmChunk(payload: { frameCount: number; endFrame: number; pcm: ArrayBuffer }): void {
      this._livePendingChunks.push(payload.pcm)
      this._livePendingBytes += payload.pcm.byteLength
      this._livePendingFrames += payload.frameCount
      this._livePendingEndFrame = payload.endFrame
    },

    async _requestLivePcmFlush(): Promise<void> {
      if (!this._pcmNode) return

      await new Promise<void>((resolve) => {
        let settled = false
        const finish = (): void => {
          if (settled) return
          settled = true
          this._pendingWorkletFlushResolve = null
          resolve()
        }

        this._pendingWorkletFlushResolve = finish
        this._pcmNode?.port.postMessage({ type: 'flush' })
        window.setTimeout(finish, LIVE_PCM_FLUSH_ACK_TIMEOUT_MS)
      })
    },

    async _flushAndFinalizeLiveTranscript(stopAtMs: number): Promise<boolean> {
      const transcriptStore = useTranscriptStore()
      await this._requestLivePcmFlush()
      await this._flushLivePcm(true)
      await this._audioContext?.suspend()
      return await transcriptStore.stopLiveSession(stopAtMs)
    },

    async _flushLivePcm(force = false): Promise<void> {
      const transcriptStore = useTranscriptStore()
      if (!transcriptStore.liveSessionId || this._livePendingChunks.length === 0) return

      const captureSampleRate = this._audioContext?.sampleRate || LIVE_PCM_SAMPLE_RATE
      const bufferedMs = (this._livePendingFrames / captureSampleRate) * 1000
      const firstTextSeen = transcriptStore.liveTimeToFirstTokenMs !== null
      const sidecarBusy = transcriptStore.liveWorkerBusy || transcriptStore.liveQueueDepth > 0
      const targetMs = force
        ? 0
        : !firstTextSeen
          ? LIVE_PCM_FIRST_SEND_TARGET_MS
          : sidecarBusy
            ? LIVE_PCM_BUSY_SEND_TARGET_MS
            : LIVE_PCM_IDLE_SEND_TARGET_MS

      const shouldFlush =
        force
        || bufferedMs >= targetMs
        || bufferedMs >= LIVE_PCM_MAX_BUFFER_MS
        || this._livePendingBytes >= LIVE_PCM_MAX_BUFFER_BYTES

      if (!shouldFlush) return

      const pcm = this._combinePendingPcm()
      const frameCount = this._livePendingFrames
      const endFrame = this._livePendingEndFrame

      this._livePendingChunks = []
      this._livePendingBytes = 0
      this._livePendingFrames = 0
      this._livePendingEndFrame = 0

      transcriptStore.sendLivePcmPacket({ pcm, frameCount, endFrame })
      this._liveChunkAccepted = true
    },

    async _teardownLiveCapture(): Promise<void> {
      this._pcmNode?.port.close()
      this._pcmNode?.disconnect()
      this._mediaSourceNode?.disconnect()
      this._silentGainNode?.disconnect()
      if (this._audioContext) {
        await this._audioContext.close().catch(() => undefined)
      }
      this._pcmNode = null
      this._mediaSourceNode = null
      this._silentGainNode = null
      this._audioContext = null
      this._livePendingChunks = []
      this._livePendingBytes = 0
      this._livePendingFrames = 0
      this._livePendingEndFrame = 0
      this._pendingWorkletFlushResolve = null
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
      this._livePendingChunks = []
      this._livePendingBytes = 0
      this._livePendingFrames = 0
      this._livePendingEndFrame = 0
      this._liveChunkAccepted = false
      this._pendingWorkletFlushResolve = null
      this._liveStopPromise = null

      const transcriptStore = useTranscriptStore()
      let stream: MediaStream | null = null
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          audio: {
            deviceId: this.selectedDeviceId ? { exact: this.selectedDeviceId } : undefined,
            sampleRate: LIVE_PCM_SAMPLE_RATE,
            channelCount: LIVE_PCM_CHANNELS,
          },
        })
        this._stream = markRaw(stream)

        const audioContext = new AudioContext({
          latencyHint: 'interactive',
          sampleRate: LIVE_PCM_SAMPLE_RATE,
        })
        this._audioContext = markRaw(audioContext)
        await audioContext.resume()
        await audioContext.audioWorklet.addModule(livePcmCaptureWorkletUrl)

        const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
          ? 'audio/webm;codecs=opus'
          : 'audio/webm'

        await transcriptStore.prepareLiveStream({
          sampleRate: audioContext.sampleRate,
          channels: LIVE_PCM_CHANNELS,
          archiveMimeType: mimeType,
          packetSamples: LIVE_PCM_PACKET_SAMPLES,
        })

        const mediaSource = audioContext.createMediaStreamSource(stream)
        const pcmNode = new AudioWorkletNode(audioContext, 'live-pcm-capture', {
          processorOptions: { packetSamples: LIVE_PCM_PACKET_SAMPLES },
        })
        const silentGain = audioContext.createGain()
        silentGain.gain.value = 0
        mediaSource.connect(pcmNode)
        pcmNode.connect(silentGain)
        silentGain.connect(audioContext.destination)

        pcmNode.port.onmessage = (event: MessageEvent<
          | { type: 'pcm-batch'; frameCount: number; endFrame: number; pcm: ArrayBuffer }
          | { type: 'pcm-flush-complete' }
        >) => {
          const payload = event.data
          if (!payload) return

          if (payload.type === 'pcm-flush-complete') {
            this._pendingWorkletFlushResolve?.()
            return
          }

          if (this.recordingState !== 'recording' && this._pendingWorkletFlushResolve === null) return
          this._appendLivePcmChunk(payload)
          void this._flushLivePcm(false).catch((error) => {
            this.error = String(error)
            void this.stopRecording()
          })
        }

        this._mediaSourceNode = markRaw(mediaSource)
        this._pcmNode = markRaw(pcmNode)
        this._silentGainNode = markRaw(silentGain)

        const recorder = new MediaRecorder(stream, { mimeType })
        this._recorder = markRaw(recorder)
        recorder.ondataavailable = (e: BlobEvent) => {
          if (e.data.size > 0) {
            this._chunks.push(e.data)
          }
        }
        recorder.onstop = () => {
          const blob = new Blob(this._chunks, { type: mimeType })
          this.audioBlob = blob
          this.audioBlobUrl = URL.createObjectURL(blob)
          this.durationMs = this._currentElapsedMs()

          void (async () => {
            try {
              const finalized = this._liveStopPromise
                ? await this._liveStopPromise
                : await transcriptStore.stopLiveSession(this.durationMs)
              if (!finalized) {
                this.error = transcriptStore.error ?? 'Live transcription stopped without a final transcript'
              }
            } catch (error) {
              this.error = String(error)
            }

            await this._teardownLiveCapture()
            this._stream?.getTracks().forEach((t) => t.stop())
            this._stream = null
            this._recorder = null
            this._liveStopPromise = null
            this.recordingState = 'stopped'
          })()
        }

        recorder.start()
        this._startTime = Date.now()
        this.recordingState = 'recording'
      } catch (err) {
        await this._teardownLiveCapture()
        stream?.getTracks().forEach((t) => t.stop())
        this._stream = null
        this.error = `Recording failed: ${String(err)}`
        throw err
      }
    },

    async stopRecording(): Promise<void> {
      if (!this._recorder) return
      const stopAtMs = this._currentElapsedMs()
      const state = this._recorder.state

      if (!this._liveStopPromise) {
        this._liveStopPromise = this._flushAndFinalizeLiveTranscript(stopAtMs)
      }

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
          await this._requestLivePcmFlush()
          await this._flushLivePcm(true)
          await this._audioContext?.suspend()
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
        void this._audioContext?.resume()

        const transcriptStore = useTranscriptStore()
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
      this._chunks = []
      this._recorder = null
      this._stream = null
      this._livePendingChunks = []
      this._livePendingBytes = 0
      this._livePendingFrames = 0
      this._livePendingEndFrame = 0
      this._liveChunkAccepted = false
      this._pendingWorkletFlushResolve = null
      this._liveStopPromise = null
      void this._teardownLiveCapture()
      this.resetLevelBars()
    },
  },
})
