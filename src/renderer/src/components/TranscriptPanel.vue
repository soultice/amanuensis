<template>
  <div ref="panelEl" class="transcript-panel">

    <!-- Editable session title (Phase 13) -->
    <div v-if="sessionStore.currentSessionId" class="session-title">
      <input
        v-if="editingTitle"
        class="session-title__input"
        v-model="titleDraft"
        @blur="commitTitleEdit"
        @keydown.enter.prevent="commitTitleEdit"
        @keydown.escape.prevent="cancelTitleEdit"
        maxlength="100"
        aria-label="Session title"
      />
      <h2
        v-else
        class="session-title__display"
        @click="startTitleEdit"
        title="Click to rename session"
      >{{ sessionStore.sessionName || 'Untitled session' }}</h2>
    </div>

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
          >{{ word.word.trimEnd() }}</span>
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
import { ref, computed, nextTick } from 'vue'
import { useTranscriptStore } from '../stores/transcript'
import { usePlaybackStore } from '../stores/playback'
import { useAnnotationStore } from '../stores/annotation'
import { useSessionStore } from '../stores/session'
import type { Annotation } from '../stores/annotation'
import AnnotationDialog from './AnnotationDialog.vue'

const transcriptStore = useTranscriptStore()
const playbackStore = usePlaybackStore()
const sessionStore = useSessionStore()
const annotationStore = useAnnotationStore()

const showDialog = ref(false)
const editingAnnotation = ref<Annotation | null>(null)
const dragOverWordIndex = ref<number | null>(null)

// Editable session title (Phase 13)
const editingTitle = ref(false)
const titleDraft = ref('')

function startTitleEdit(): void {
  titleDraft.value = sessionStore.sessionName
  editingTitle.value = true
  nextTick(() => {
    const input = document.querySelector<HTMLInputElement>('.session-title__input')
    input?.select()
  })
}

async function commitTitleEdit(): Promise<void> {
  if (!editingTitle.value) return
  editingTitle.value = false
  const name = titleDraft.value.trim() || 'Untitled session'
  if (name !== sessionStore.sessionName) {
    await sessionStore.renameSession(name)
  }
}

function cancelTitleEdit(): void {
  editingTitle.value = false
  titleDraft.value = ''
}

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

// Expose so AppShellView can observe natural content height for waveform sync
const panelEl = ref<HTMLElement | null>(null)
defineExpose({ panelEl })
</script>

<style scoped>
/* ---- Layout shell ---- */
.transcript-panel {
  display: flex;
  flex-direction: column;
  /* No height:100% — let content grow naturally so .app-shell__transcript
     can scroll the full text. Outer overflow-y:auto on .app-shell__transcript
     is the scroll container. */
  background: var(--bg);
  color: var(--text);
}

/* Session title sticks to top while transcript content scrolls beneath it */
.session-title {
  position: sticky;
  top: 0;
  z-index: 1;
  background: var(--bg);
  padding: 8px 16px 4px;
  border-bottom: 1px solid var(--border);
}
.session-title__display {
  font-family: 'Georgia', 'Times New Roman', serif;
  font-size: 1rem;
  font-weight: 600;
  color: var(--text-em);
  margin: 0;
  cursor: text;
  border-radius: 3px;
  padding: 2px 4px;
  display: inline-block;
}
.session-title__display:hover {
  background: rgba(var(--accent-rgb), 0.06);
}
.session-title__input {
  font-family: 'Georgia', 'Times New Roman', serif;
  font-size: 1rem;
  font-weight: 600;
  color: var(--text-em);
  background: var(--bg-raised);
  border: 1px solid var(--accent);
  border-radius: 3px;
  padding: 2px 4px;
  width: 100%;
  box-sizing: border-box;
  outline: none;
}

/* ---- Reading column (D-06) ---- */
.transcript-panel__content,
.transcript-panel__empty,
.transcript-panel__progress,
.transcript-panel__error {
  max-width: 68ch;
  margin: 0 auto;
  /* Scrolling is handled by .app-shell__transcript (the outer container);
     these elements flow at their natural height. */
}

/* ---- Empty state ---- */
.transcript-panel__empty {
  color: var(--text-de);
  font-size: 0.9rem;
  line-height: 1.6;
  padding-top: 24px;
}

/* ---- Progress / transcribing ---- */
.transcript-panel__progress {
  display: flex;
  flex-direction: column;
  gap: 12px;
  align-items: flex-start;
  padding-top: 24px;
}
.transcript-panel__spinner {
  width: 22px;
  height: 22px;
  border: 3px solid var(--border);
  border-top-color: var(--accent);
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
  flex-shrink: 0;
}
@keyframes spin { to { transform: rotate(360deg); } }

.transcript-panel__progress-label {
  font-size: 0.9rem;
  color: var(--text-em);
  font-weight: 500;
}
.transcript-panel__progress-hint {
  font-size: 0.82rem;
  color: var(--text-de);
}

/* ---- Error state ---- */
.transcript-panel__error {
  color: var(--danger);
  font-size: 0.875rem;
  line-height: 1.6;
  padding-top: 24px;
}
.transcript-panel__btn {
  margin-top: 10px;
  padding: 5px 14px;
  background: var(--bg-hl);
  border: 1px solid var(--border);
  border-radius: 4px;
  cursor: pointer;
  font-size: 0.82rem;
  color: var(--text);
}
.transcript-panel__btn:hover { background: var(--bg-raised); }

/* ---- Meta bar (D-09) ---- */
.transcript-panel__meta {
  display: flex;
  gap: 20px;
  margin-bottom: 24px;
  font-size: 0.75rem;
  color: var(--text-de);
  letter-spacing: 0.02em;
  text-transform: uppercase;
  border-bottom: 1px solid var(--border);
  padding-bottom: 12px;
}

/* ---- Prose (D-07, D-08) ---- */
.transcript-panel__text {
  font-family: 'Georgia', 'Times New Roman', serif;
  font-size: 1.0625rem;     /* 17px at 16px root */
  line-height: 1.85;
  color: var(--text-em);
}

/* ---- Word spans ---- */
.word-span {
  cursor: pointer;
  border-radius: 2px;
  display: inline;
  user-select: none;
}
.word-span:hover {
  background: rgba(var(--accent-rgb), 0.08);
}
.word-span--selected {
  background: rgba(var(--accent-rgb), 0.12);
  border-radius: 2px;
}
.word-span--active {
  text-decoration: underline;
  text-decoration-color: var(--accent);
  text-underline-offset: 3px;
  text-decoration-thickness: 2px;
}
.word-span--drop-over {
  background: rgba(var(--accent-rgb), 0.18);
  border-radius: 2px;
}

/* ---- Annotation badge ---- */
.annotation-badge {
  font-size: 0.58rem;
  color: var(--accent);
  vertical-align: super;
  cursor: default;
  user-select: none;
  margin-left: 1px;
}

/* ---- Floating annotate button ---- */
.annotation-float-btn {
  position: fixed;
  position-anchor: --selection-end;
  top: anchor(--selection-end bottom);
  left: anchor(--selection-end right);
  margin: 4px;
  padding: 5px 12px;
  background: var(--accent);
  color: #fdf6e3;
  border: none;
  border-radius: 5px;
  cursor: pointer;
  font-size: 0.8rem;
  font-weight: 500;
  z-index: 100;
}
.annotation-float-btn--blocked {
  background: var(--text-de);
  cursor: not-allowed;
}
.annotation-float-btn:hover:not(:disabled) {
  background: var(--accent-2);
}
</style>
