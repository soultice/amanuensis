<template>
  <div class="transcript-panel">

    <!-- Empty state -->
    <div v-if="transcriptStore.transcriptState === 'empty'" class="transcript-panel__empty">
      <p>Record audio and click <strong>Transcribe</strong> to see the transcript here.</p>
    </div>

    <!-- Transcribing — inline progress (D-07, D-08) -->
    <div v-else-if="transcriptStore.isTranscribing" class="transcript-panel__progress">
      <div class="transcript-panel__spinner" />
      <p class="transcript-panel__progress-label">Transcribing with Whisper large-v3…</p>
      <p class="transcript-panel__progress-hint">
        This may take a few minutes depending on recording length and hardware.
      </p>
    </div>

    <!-- Error state -->
    <div v-else-if="transcriptStore.transcriptState === 'error'" class="transcript-panel__error">
      <p>Transcription failed: {{ transcriptStore.error }}</p>
      <button class="transcript-panel__btn" @click="transcriptStore.reset()">Dismiss</button>
    </div>

    <!-- Complete — flowing paragraph text (D-05, D-06) -->
    <!-- Phase 3 will replace the <p> with individual <span> elements per word -->
    <div v-else-if="transcriptStore.hasTranscript" class="transcript-panel__content">
      <div class="transcript-panel__meta">
        <span>{{ transcriptStore.words.length }} words</span>
        <span>{{ transcriptStore.language.toUpperCase() }}</span>
        <span>{{ formatDuration(transcriptStore.duration) }}</span>
      </div>
      <p class="transcript-panel__text">{{ transcriptStore.fullText }}</p>
    </div>

  </div>
</template>

<script setup lang="ts">
import { useTranscriptStore } from '../stores/transcript'

const transcriptStore = useTranscriptStore()

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = Math.floor(seconds % 60)
  return `${m}:${s.toString().padStart(2, '0')}`
}
</script>

<style scoped>
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
.transcript-panel__text {
  font-size: 1rem;
  line-height: 1.75;
  color: #1a1a1a;
  white-space: pre-wrap;
}
</style>
