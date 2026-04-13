import { defineStore } from 'pinia'
import { markRaw } from 'vue'

export const usePlaybackStore = defineStore('playback', {
  state: () => ({
    isWaveSurferReady: false,
    isPlaying: false,
    currentTime: 0,    // updated by WaveSurfer 'timeupdate' event
    duration: 0,       // set on WaveSurfer 'ready'

    // Word index selection (indices into transcriptStore.words[])
    // selectionAnchor: first clicked word index
    // selectionEnd: shift-clicked word index (null = same as anchor)
    selectionAnchor: null as number | null,
    selectionEnd: null as number | null,

    // WaveSurfer instance stored non-reactively (markRaw equivalent via any)
    _ws: null as any,
  }),

  getters: {
    hasSelection: (s): boolean => s.selectionAnchor !== null,

    selectionMin: (s): number | null => {
      if (s.selectionAnchor === null) return null
      if (s.selectionEnd === null) return s.selectionAnchor
      return Math.min(s.selectionAnchor, s.selectionEnd)
    },

    selectionMax: (s): number | null => {
      if (s.selectionAnchor === null) return null
      if (s.selectionEnd === null) return s.selectionAnchor
      return Math.max(s.selectionAnchor, s.selectionEnd)
    },

    // Returns a function so it can be called per-word in v-for
    isWordSelected(): (wordIndex: number) => boolean {
      return (wordIndex: number): boolean => {
        const min = this.selectionMin
        const max = this.selectionMax
        if (min === null || max === null) return false
        return wordIndex >= min && wordIndex <= max
      }
    },
  },

  actions: {
    registerWaveSurfer(ws: any): void {
      this._ws = markRaw(ws)
      this.isWaveSurferReady = false
    },

    onWaveSurferReady(dur: number): void {
      this.isWaveSurferReady = true
      this.duration = dur
    },

    onTimeUpdate(time: number): void {
      this.currentTime = time
    },

    onPlayPause(playing: boolean): void {
      this.isPlaying = playing
    },

    // D-01: seek only (audio stays paused), D-02: 50ms pre-roll
    seekToTime(timeInSeconds: number): void {
      const ws = this._ws
      if (!ws || !this.isWaveSurferReady) return
      const t = Math.max(0, timeInSeconds - 0.05)
      if (typeof ws.setTime === 'function') {
        ws.setTime(t)
      } else if (this.duration > 0) {
        ws.seekTo(t / this.duration)
      }
    },

    // D-03: shift+click extends selection from anchor
    extendSelection(wordIndex: number): void {
      if (this.selectionAnchor === null) {
        this.selectionAnchor = wordIndex
        this.selectionEnd = wordIndex
      } else {
        this.selectionEnd = wordIndex
      }
    },

    // D-05: regular click clears and re-anchors
    setAnchorOnly(wordIndex: number): void {
      this.selectionAnchor = wordIndex
      this.selectionEnd = wordIndex
    },

    clearSelection(): void {
      this.selectionAnchor = null
      this.selectionEnd = null
    },

    togglePlayPause(): void {
      this._ws?.playPause()
    },
  },
})
