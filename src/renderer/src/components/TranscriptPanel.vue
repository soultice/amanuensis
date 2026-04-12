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

    <!-- Complete — Phase 3/4: word spans + floating button + badges + dialog -->
    <div v-else-if="transcriptStore.hasTranscript" class="transcript-panel__content">
      <div class="transcript-panel__meta">
        <span>{{ transcriptStore.words.length }} words</span>
        <span>{{ transcriptStore.language.toUpperCase() }}</span>
        <span>{{ formatDuration(transcriptStore.duration) }}</span>
      </div>

      <!-- Floating "Add annotation" button — CSS-anchored to --selection-end (D-01, D-03) -->
      <button
        v-if="playbackStore.hasSelection"
        class="annotation-float-btn"
        :class="{ 'annotation-float-btn--blocked': selectionOverlaps }"
        :disabled="selectionOverlaps"
        :title="selectionOverlaps ? 'Range already annotated' : 'Add annotation'"
        @click="openCreateDialog"
      >
        {{ selectionOverlaps ? '⊘' : '+' }} Annotate
      </button>

      <!-- Word spans: click-to-seek, shift+click selection, underline, badges, drop targets -->
      <p class="transcript-panel__text">
        <template v-for="word in transcriptStore.words" :key="word.id">
          <span
            class="word-span"
            :class="{
              'word-span--selected': playbackStore.isWordSelected(word.id),
              'word-span--active': word.id === currentWordIndex,
              'word-span--drop-over': dragOverWordIndex === word.id,
            }"
            :style="word.id === playbackStore.selectionMax
              ? { anchorName: '--selection-end' }
              : {}"
            @click="handleWordClick(word.id, word.start, $event)"
            @dragover.prevent="dragOverWordIndex = word.id"
            @dragleave="dragOverWordIndex = null"
            @drop="handleDrop($event, word.id)"
          >{{ word.word }}</span>
          <!-- Superscript badge after the LAST word of an annotated range (D-04) -->
          <sup
            v-if="annotationStore.badgeAtWord(word.id) !== null"
            class="annotation-badge"
          >{{ annotationStore.badgeAtWord(word.id) }}</sup>
        </template>
      </p>

      <!-- Annotation creation/edit dialog (CSS-anchored, ANNOT-09) -->
      <AnnotationDialog
        v-if="showDialog"
        :word-start-idx="playbackStore.selectionMin ?? 0"
        :word-end-idx="playbackStore.selectionMax ?? 0"
        :editing-annotation="editingAnnotation"
        @close="showDialog = false; editingAnnotation = null"
        @saved="onAnnotationSaved"
      />
    </div>

  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import { useTranscriptStore } from '../stores/transcript'
import { usePlaybackStore } from '../stores/playback'
import { useAnnotationStore } from '../stores/annotation'
import type { Annotation } from '../stores/annotation'
import AnnotationDialog from './AnnotationDialog.vue'

const transcriptStore = useTranscriptStore()
const playbackStore = usePlaybackStore()
const annotationStore = useAnnotationStore()

const showDialog = ref(false)
const editingAnnotation = ref<Annotation | null>(null)
const dragOverWordIndex = ref<number | null>(null)

// D-11: check if current selection overlaps any existing annotation
const selectionOverlaps = computed((): boolean => {
  const min = playbackStore.selectionMin
  const max = playbackStore.selectionMax
  if (min === null || max === null) return false
  return annotationStore.overlapsExisting(min, max)
})

// D-07: determine the currently-playing word index from playbackStore.currentTime
const currentWordIndex = computed((): number => {
  if (!transcriptStore.hasTranscript || transcriptStore.words.length === 0) return -1
  const t = playbackStore.currentTime
  return transcriptStore.words.findIndex((w) => t >= w.start && t < w.end)
})

// D-01: open create dialog (only if no overlap)
function openCreateDialog(): void {
  if (selectionOverlaps.value) return
  editingAnnotation.value = null
  showDialog.value = true
}

function onAnnotationSaved(): void {
  showDialog.value = false
  editingAnnotation.value = null
  playbackStore.clearSelection()
}

// D-01: seek only, D-02: 50ms pre-roll, D-03: shift+click extends, D-05: click clears
function handleWordClick(wordId: number, wordStart: number, event: MouseEvent): void {
  if (event.shiftKey && playbackStore.selectionAnchor !== null) {
    playbackStore.extendSelection(wordId)
  } else {
    playbackStore.clearSelection()
    playbackStore.setAnchorOnly(wordId)
    playbackStore.seekToTime(wordStart)
  }
}

// D-06/D-07/D-08: drag annotation from AnnotationPanel → drop on word span
function handleDrop(event: DragEvent, wordIdx: number): void {
  event.preventDefault()
  dragOverWordIndex.value = null
  const annotationId = event.dataTransfer?.getData('text/plain')
  if (!annotationId) return
  // Block drop onto a span already covered by a DIFFERENT annotation (D-08)
  const targetAnnotation = annotationStore.annotationCoveringWord(wordIdx)
  if (targetAnnotation && targetAnnotation.id !== annotationId) return
  annotationStore.moveAnnotation(annotationId, wordIdx)
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

/* ---- Phase 3 word span styles (unchanged) ---- */
.transcript-panel__text {
  font-size: 1rem;
  line-height: 1.75;
  color: #1a1a1a;
}
.word-span {
  cursor: pointer;
  border-radius: 2px;
  display: inline;
  user-select: none;
}
.word-span:hover { background: #f3f4f6; }
.word-span--selected { background: rgba(26, 86, 219, 0.1); border-radius: 2px; }
.word-span--active {
  text-decoration: underline;
  text-decoration-color: #1a56db;
  text-underline-offset: 3px;
  text-decoration-thickness: 2px;
}

/* ---- Phase 4 additions ---- */

/* Floating "Add annotation" button — CSS-anchored (D-01, D-03) */
.annotation-float-btn {
  position: fixed;
  position-anchor: --selection-end;
  inset-area: top span-inline-end;
  position-try-fallbacks: bottom span-inline-end, top span-all, bottom span-all;
  margin: 4px;
  padding: 5px 10px;
  background: #1a56db;
  color: white;
  border: none;
  border-radius: 5px;
  cursor: pointer;
  font-size: 0.78rem;
  font-weight: 500;
  z-index: 100;
}
.annotation-float-btn--blocked { background: #9ca3af; cursor: not-allowed; }
.annotation-float-btn:hover:not(:disabled) { background: #1345b7; }

/* Drop target highlight (D-06) */
.word-span--drop-over {
  background: rgba(26, 86, 219, 0.15);
  border-radius: 2px;
}

/* Superscript badge after last word of annotated range (D-04) */
.annotation-badge {
  font-size: 0.58rem;
  color: #6b7280;
  vertical-align: super;
  cursor: default;
  user-select: none;
  margin-left: 1px;
}
</style>
