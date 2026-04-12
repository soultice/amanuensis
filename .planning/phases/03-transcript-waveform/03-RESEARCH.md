# Phase 3: Transcript & Waveform - Research

*Researched: 2026-04-12*

## Goal

Replace the plain-text transcript with interactive word spans (click-to-seek, shift+click selection, underline playback animation), and fill WaveformPanel with WaveSurfer displaying the audio waveform + a region highlight for the selected word range.

---

## 1. WaveSurfer Package Installation

```bash
npm install wavesurfer.js @meersagor/wavesurfer-vue
```

Package versions from STACK.md: `wavesurfer.js ^7`, `@meersagor/wavesurfer-vue ^2.0`.

---

## 2. WaveSurfer Integration — `useWaveSurfer` Composable

**Core composable from `@meersagor/wavesurfer-vue`:**

```typescript
import { useWaveSurfer } from '@meersagor/wavesurfer-vue'

const containerRef = ref<HTMLElement | null>(null)

const { waveSurfer, isReady, currentTime, isPlaying, totalDuration } = useWaveSurfer({
  containerRef,
  options: {
    height: 160,
    waveColor: '#d1d5db',
    progressColor: '#1a56db',
    url: audioBlobUrl,     // from useRecordingStore.audioBlobUrl
    interact: true,        // allow click-to-seek on waveform itself
    normalize: true,
    backend: 'WebAudio',
  }
})
```

**`currentTime`** — reactive `Ref<number>` updated as audio plays. Use this to drive the current-word highlight.

**`totalDuration`** — reactive total duration in seconds. Needed for `seekTo()` ratio calculation.

**Seek to a specific time:**
```typescript
// Option A: ratio (0-1)
waveSurfer.value?.seekTo(timeInSeconds / totalDuration.value)

// Option B: setTime() — direct seconds (WaveSurfer v7+, simpler)
waveSurfer.value?.setTime(timeInSeconds)
```
Prefer `setTime()` for simplicity — no need to track duration manually.

**Play/Pause:**
```typescript
waveSurfer.value?.playPause()
waveSurfer.value?.pause()
```

---

## 3. WaveSurfer Regions Plugin

**Import (direct wavesurfer.js, not via @meersagor wrapper for Regions):**
```typescript
import RegionsPlugin from 'wavesurfer.js/dist/plugins/regions.esm.js'
```

**Register as plugin when creating WaveSurfer:**
Since `useWaveSurfer` accepts a `plugins` option array, pass the plugin at init time:
```typescript
const regionsPlugin = RegionsPlugin.create()

const { waveSurfer, isReady } = useWaveSurfer({
  containerRef,
  options: {
    // ... other options
    plugins: [regionsPlugin],
  }
})
```

**Add/update region when selection changes:**
```typescript
function updateRegion(startTime: number, endTime: number): void {
  regionsPlugin.clearRegions()
  regionsPlugin.addRegion({
    start: startTime,
    end: endTime,
    color: 'rgba(26, 86, 219, 0.12)',
    drag: false,
    resize: false,
  })
}

function clearRegion(): void {
  regionsPlugin.clearRegions()
}
```

**Note on Regions bug (WaveSurfer 7.8.2):** Clicking inside a region can block seek on some versions. Workaround: use `drag: false, resize: false` and avoid adding clickable regions that intercept events. Use `color` with low opacity so the region is visual-only.

---

## 4. Pinia Store — `usePlaybackStore`

New store to manage WaveSurfer instance and word selection state — shared between `WaveformPanel` and `TranscriptPanel`.

```typescript
// src/renderer/src/stores/playback.ts
import { defineStore } from 'pinia'
import type WaveSurfer from 'wavesurfer.js'

export const usePlaybackStore = defineStore('playback', {
  state: () => ({
    // WaveSurfer instance — set by WaveformPanel after init
    waveSurferInstance: null as WaveSurfer | null,
    isReady: false,

    // Word selection (indices into transcriptStore.words)
    selectionAnchor: null as number | null,   // first clicked word index
    selectionEnd: null as number | null,       // shift-clicked word index
  }),

  getters: {
    hasSelection: (s): boolean => s.selectionAnchor !== null,
    selectionMin: (s): number | null =>
      s.selectionAnchor !== null && s.selectionEnd !== null
        ? Math.min(s.selectionAnchor, s.selectionEnd)
        : s.selectionAnchor,
    selectionMax: (s): number | null =>
      s.selectionAnchor !== null && s.selectionEnd !== null
        ? Math.max(s.selectionAnchor, s.selectionEnd)
        : s.selectionAnchor,
    isWordSelected: (s) => (wordIndex: number): boolean => {
      const min = s.selectionAnchor !== null && s.selectionEnd !== null
        ? Math.min(s.selectionAnchor, s.selectionEnd) : s.selectionAnchor
      const max = s.selectionAnchor !== null && s.selectionEnd !== null
        ? Math.max(s.selectionAnchor, s.selectionEnd) : s.selectionAnchor
      if (min === null || max === null) return false
      return wordIndex >= min && wordIndex <= max
    }
  },

  actions: {
    setWaveSurfer(ws: WaveSurfer): void {
      this.waveSurferInstance = ws
    },

    seekToTime(timeInSeconds: number): void {
      // 50ms pre-roll per D-02 to avoid clipping the word start
      const t = Math.max(0, timeInSeconds - 0.05)
      this.waveSurferInstance?.setTime(t)
    },

    setSelection(anchorIdx: number, endIdx: number): void {
      this.selectionAnchor = anchorIdx
      this.selectionEnd = endIdx
    },

    setAnchor(idx: number): void {
      this.selectionAnchor = idx
      this.selectionEnd = idx
    },

    clearSelection(): void {
      this.selectionAnchor = null
      this.selectionEnd = null
    },
  },
})
```

---

## 5. Word Span Interaction Logic

**Click handler on each `<span data-word-index="N">`:**

```typescript
function handleWordClick(wordIndex: number, wordStart: number, event: MouseEvent): void {
  if (event.shiftKey && playbackStore.selectionAnchor !== null) {
    // Shift+click: extend selection from anchor to clicked word (D-03)
    playbackStore.setSelection(playbackStore.selectionAnchor, wordIndex)
  } else {
    // Regular click: seek to word start, clear selection (D-01, D-05)
    playbackStore.clearSelection()
    playbackStore.setAnchor(wordIndex)
    playbackStore.seekToTime(wordStart)
  }
}
```

**Template for word spans (replacing the `<p>` in TranscriptPanel):**

```vue
<p class="transcript-panel__text">
  <span
    v-for="word in transcriptStore.words"
    :key="word.id"
    class="word-span"
    :class="{
      'word-span--selected': playbackStore.isWordSelected(word.id),
      'word-span--active': word.id === currentWordIndex,
    }"
    @click="handleWordClick(word.id, word.start, $event)"
  >{{ word.word }}</span>
</p>
```

---

## 6. Current Word Tracking (Underline Animation)

```typescript
// In TranscriptPanel.vue or via playbackStore
import { useWaveSurfer } from '@meersagor/wavesurfer-vue'
// currentTime comes from the WaveSurfer composable (reactive Ref<number>)

const currentWordIndex = computed((): number => {
  if (!transcriptStore.hasTranscript) return -1
  const t = currentTime.value  // from WaveSurfer composable
  // Binary search would be more efficient but linear is fine for typical transcript lengths
  return transcriptStore.words.findIndex(w => t >= w.start && t < w.end)
})
```

**CSS for underline animation (D-06):**
```css
.word-span {
  cursor: pointer;
  border-radius: 2px;
  display: inline;
}
.word-span:hover {
  background: #f3f4f6;
}
.word-span--selected {
  background: rgba(26, 86, 219, 0.1);
  border-radius: 2px;
}
.word-span--active {
  text-decoration: underline;
  text-decoration-color: #1a56db;
  text-underline-offset: 3px;
  text-decoration-thickness: 2px;
}
```

No transition on the active class — instant switch between words feels more natural than fading.

---

## 7. Region Sync — WaveSurfer ↔ Word Selection

When selection changes in `playbackStore`, update the WaveSurfer region in `WaveformPanel.vue`:

```typescript
watch(
  () => [playbackStore.selectionMin, playbackStore.selectionMax],
  ([min, max]) => {
    regionsPlugin.clearRegions()
    if (min !== null && max !== null && isReady.value) {
      const startTime = transcriptStore.words[min]?.start ?? 0
      const endTime = transcriptStore.words[max]?.end ?? startTime + 0.1
      regionsPlugin.addRegion({
        start: startTime,
        end: endTime,
        color: 'rgba(26, 86, 219, 0.12)',
        drag: false,
        resize: false,
      })
    }
  }
)
```

---

## 8. currentTime Sharing Between Components

`currentTime` is a reactive ref returned by `useWaveSurfer` in `WaveformPanel`. `TranscriptPanel` needs it to determine the active word.

**Approach:** Store `currentTime` in `usePlaybackStore` by watching the WaveSurfer `timeupdate` event:

```typescript
// In WaveformPanel, after waveSurfer is ready:
waveSurfer.value?.on('timeupdate', (t: number) => {
  playbackStore.currentTime = t
})
```

And add `currentTime` to the playback store state:
```typescript
state: () => ({
  ...
  currentTime: 0,
})
```

Then `TranscriptPanel` reads `playbackStore.currentTime` to compute the active word — no prop drilling needed.

---

## 9. Key Pitfall: `setTime()` availability

`waveSurfer.setTime()` is available in WaveSurfer 7.4+. Since we're installing `^7`, verify it's available. If not, fall back to `seekTo(t / totalDuration.value)`.

```typescript
// Safe seek that works across WaveSurfer v7 versions:
function safeSeekTo(timeInSeconds: number): void {
  const ws = waveSurfer.value
  if (!ws) return
  if (typeof (ws as any).setTime === 'function') {
    ;(ws as any).setTime(Math.max(0, timeInSeconds))
  } else {
    const dur = totalDuration.value
    if (dur > 0) ws.seekTo(Math.max(0, timeInSeconds) / dur)
  }
}
```

## RESEARCH COMPLETE
