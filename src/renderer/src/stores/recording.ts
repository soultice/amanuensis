import { defineStore } from 'pinia'
import { markRaw } from 'vue'

export type RecordingState = 'idle' | 'recording' | 'paused' | 'stopped'

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
    _pausedMs: 0,       // total milliseconds spent paused
    _pauseStart: 0,     // timestamp when current pause began; 0 if not paused
  }),

  getters: {
    hasRecording: (s): boolean => s.audioBlob !== null,
    isRecording: (s): boolean => s.recordingState === 'recording',
    isPaused:    (s): boolean => s.recordingState === 'paused',
    isActive:    (s): boolean => s.recordingState === 'recording' || s.recordingState === 'paused',
    isStopped: (s): boolean => s.recordingState === 'stopped',
  },

  actions: {
    async loadDevices(): Promise<void> {
      this.error = null
      try {
        // Request permission first so device labels are populated
        const permStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false })
        permStream.getTracks().forEach(t => t.stop())

        const all = await navigator.mediaDevices.enumerateDevices()
        this.devices = all.filter(d => d.kind === 'audioinput')
        if (this.devices.length > 0 && !this.selectedDeviceId) {
          this.selectedDeviceId = this.devices[0].deviceId
        }
      } catch (err) {
        this.error = `Microphone access denied: ${String(err)}`
      }
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
          if (e.data.size > 0) this._chunks.push(e.data)
        }

        recorder.onstop = () => {
          const blob = new Blob(this._chunks, { type: 'audio/webm' })
          this.audioBlob = blob
          this.audioBlobUrl = URL.createObjectURL(blob)
          this.durationMs = Date.now() - this._startTime - this._pausedMs
          this.recordingState = 'stopped'
          this._stream?.getTracks().forEach(t => t.stop())
          this._stream = null
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
        // Accumulate current pause segment before stopping
        if (this._pauseStart > 0) {
          this._pausedMs += Date.now() - this._pauseStart
          this._pauseStart = 0
        }
        this._recorder.resume()
        setTimeout(() => this._recorder?.stop(), 0)
      } else if (state === 'recording') {
        this._recorder.stop()
      }
      // recordingState → 'stopped' set in onstop handler
    },

    pauseRecording(): void {
      if (this._recorder && this._recorder.state === 'recording') {
        this._recorder.pause()
        this._pauseStart = Date.now()
        this.recordingState = 'paused'
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
      this.resetLevelBars()
    },
  },
})
