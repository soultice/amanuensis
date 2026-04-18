import { defineStore } from 'pinia'
import { markRaw } from 'vue'
import { useTranscriptStore } from './transcript'
import livePcmCaptureWorkletUrl from '../audio/live-pcm-capture.worklet.ts?url'

export type RecordingState = 'idle' | 'recording' | 'paused' | 'stopped'

const LIVE_PCM_SAMPLE_RATE = 16000
const LIVE_PCM_CHANNELS = 1
const LIVE_PCM_PACKET_SAMPLES = 2048

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
      this._liveChunkAccepted = false

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

        pcmNode.port.onmessage = (event: MessageEvent<{ type: string; frameCount: number; endFrame: number; pcm: ArrayBuffer }>) => {
          if (this.recordingState !== 'recording') return
          const payload = event.data
          if (!payload || payload.type !== 'pcm-batch') return
          this._livePendingChunks.push(payload.pcm)
          this._livePendingBytes += payload.pcm.byteLength
          try {
            transcriptStore.sendLivePcmPacket({
              pcm: payload.pcm,
              frameCount: payload.frameCount,
              endFrame: payload.endFrame,
            })
            this._liveChunkAccepted = true
          } catch (error) {
            this.error = String(error)
            void this.stopRecording()
          } finally {
            this._livePendingChunks.shift()
            this._livePendingBytes = Math.max(0, this._livePendingBytes - payload.pcm.byteLength)
          }
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
          this.recordingState = 'stopped'
          void this._teardownLiveCapture()
          this._stream?.getTracks().forEach((t) => t.stop())
          this._stream = null

          void (async () => {
            const finalized = await transcriptStore.stopLiveSession(this.durationMs)
            if (!finalized) {
              this.error = transcriptStore.error ?? 'Live transcription stopped without a final transcript'
            }
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
        void this._audioContext?.suspend()

        const transcriptStore = useTranscriptStore()
        void transcriptStore.pauseLiveSession(this._currentElapsedMs())
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
      this._livePendingChunks = []
      this._livePendingBytes = 0
      this._liveChunkAccepted = false
      void this._teardownLiveCapture()
      this.resetLevelBars()
    },
  },
})
