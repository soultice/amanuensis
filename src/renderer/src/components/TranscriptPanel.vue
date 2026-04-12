<template>
  <div class="transcript-panel">

    <!-- Empty state — unchanged from Phase 2 -->
    <div v-if="transcriptStore.transcriptState === 'empty'" class="transcript-panel__empty">
      <p>Record audio and click <strong>Transcribe</strong> to see the transcript here.</p>
    </div>

    <!-- Transcribing — unchanged from Phase 2 -->
    <div v-else-if="transcriptStore.isTranscribing" class="transcript-panel__progress">
      <div class="transcript-panel__spinner" />
      <p class="transcript-panel__progress-label">Transcribing with Whisper large-v3…</p>
      <p class="transcript-panel__progress-hint">
        This may take a few minutes depending on recording length and hardware.
      </p>
    </div>

    <!-- Error state — unchanged from Phase 2 -->
    <div v-else-if="transcriptStore.transcriptState === 'error'" class="transcript-panel__error">
      <p>Transcription failed: {{ transcriptStore.error }}</p>
      <button class="transcript-panel__btn" @click="transcriptStore.reset()">Dismiss</button>
    </div>

    <!-- Complete — Phase 3: individual word spans replacing plain text paragraph -->
    <div v-else-if="transcriptStore.hasTranscript" class="transcript-panel__content">
      <div class="transcript-panel__meta">
        <span>{{ transcriptStore.words.length }} words</span>
        <span>{{ transcriptStore.language.toUpperCase() }}</span>
        <span>{{ formatDuration(transcriptStore.duration) }}</span>
      </div>

      <!-- Word spans: click-to-seek (D-01), shift+click selection (D-03),
           underline animation on active word (D-06) -->
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
    </div>

  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useTranscriptStore } from '../stores/transcript'
import { usePlaybackStore } from '../stores/playback'

const transcriptStore = useTranscriptStore()
const playbackStore = usePlaybackStore()

// D-07: find current word by comparing playbackStore.currentTime against word timestamps
// playbackStore.currentTime is updated by WaveSurfer 'timeupdate' event (via WaveformPanel)
const currentWordIndex = computed((): number => {
  if (!transcriptStore.hasTranscript || transcriptStore.words.length === 0) return -1
  const t = playbackStore.currentTime
  return transcriptStore.words.findIndex((w) => t >= w.start && t < w.end)
})

// D-01: seek only — audio stays paused after click
// D-02: 50ms pre-roll handled inside playbackStore.seekToTime()
// D-03: shift+click extends selection from anchor
// D-05: regular click clears selection and re-anchors
function handleWordClick(wordId: number, wordStart: number, event: MouseEvent): void {
  if (event.shiftKey && playbackStore.selectionAnchor !== null) {
    // Extend selection from anchor to this word — D-03
    playbackStore.extendSelection(wordId)
  } else {
    // Seek + clear selection + set new anchor — D-01, D-05
    playbackStore.clearSelection()
    playbackStore.setAnchorOnly(wordId)
    playbackStore.seekToTime(wordStart)
  }
}

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = Math.floor(seconds % 60)
  return `${m}:${s.toString().padStart(2, '0')}`
}
</script>

<style scoped>
/* ---- Phase 2 styles (unchanged) ---- */
.transcript-panel {
  padding: 24px;
  height: 100%;
  overflow-y: auto;
}
.transcript-panel__empty {
  color: #9ca3af;
  font-size: 0.875rem;
  line-height: 1.6;
}
.transcript-panel__progress {
  display: flex;
  flex-direction: column;
  gap: 12px;
  align-items: flex-start;
}
.transcript-panel__spinner {
  width: 24px;
  height: 24px;
  border: 3px solid #e5e7eb;
  border-top-color: #1a56db;
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
  flex-shrink: 0;
}
@keyframes spin {
  to { transform: rotate(360deg); }
}
.transcript-panel__progress-label {
  font-size: 0.9rem;
  color: #374151;
  font-weight: 500;
}
.transcript-panel__progress-hint {
  font-size: 0.8rem;
  color: #9ca3af;
}
.transcript-panel__error {
  color: #dc2626;
  font-size: 0.875rem;
  line-height: 1.6;
}
.transcript-panel__btn {
  margin-top: 8px;
  padding: 4px 12px;
  background: #f3f4f6;
  border: 1px solid #d1d5db;
  border-radius: 4px;
  cursor: pointer;
  font-size: 0.8rem;
}
.transcript-panel__meta {
  display: flex;
  gap: 16px;
  margin-bottom: 16px;
  font-size: 0.75rem;
  color: #6b7280;
}

/* ---- Phase 3: word span styles ---- */
.transcript-panel__text {
  font-size: 1rem;
  line-height: 1.75;
  color: #1a1a1a;
}
.word-span {
  cursor: pointer;
  border-radius: 2px;
  display: inline;
  /* Prevent browser native text selection competing with shift+click */
  user-select: none;
}
.word-span:hover {
  background: #f3f4f6;
}
/* D-04: selected words get a blue tint */
.word-span--selected {
  background: rgba(26, 86, 219, 0.1);
  border-radius: 2px;
}
/* D-06: underline animation on currently-playing word — no background, no layout shift */
.word-span--active {
  text-decoration: underline;
  text-decoration-color: #1a56db;
  text-underline-offset: 3px;
  text-decoration-thickness: 2px;
}
</style>
