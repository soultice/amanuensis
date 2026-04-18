<template>
  <div class="status-bar">
    <span class="status-bar__item" :class="`status--${sidecarStore.status}`">
      Sidecar: {{ sidecarStore.status }}
    </span>
    <span class="status-bar__item" :class="`status--${transcriptStore.transcriptState}`">
      Transcript: {{ transcriptStore.transcriptState }}
    </span>
    <span v-if="showLiveTelemetry" class="status-bar__item status-bar__telemetry">
      Latency: TTFT {{ ttftLabel }} · Queue {{ transcriptStore.liveQueueDepth }}
    </span>
    <span v-if="showLiveTelemetry" class="status-bar__item status-bar__telemetry">
      Pipeline: Worker {{ transcriptStore.liveWorkerBusy ? 'Busy' : 'Idle' }} · Waiting {{ transcriptStore.liveWaitingRequests }}
    </span>
    <span v-if="showLiveTelemetry && schedulerLabel" class="status-bar__item status-bar__telemetry">
      Scheduler: {{ schedulerLabel }}
    </span>
    <span v-if="showLiveTelemetry && runtimeLabel" class="status-bar__item status-bar__telemetry">
      Runtime: {{ runtimeLabel }}
    </span>
    <span v-if="showLiveTelemetry" class="status-bar__item status-bar__telemetry">
      Producer: Pending {{ recordingStore._livePendingChunks.length }} chunk(s) · Buffer {{ recordingStore._livePendingBytes }}B
    </span>
    <span v-if="transcriptStore.liveWarning" class="status-bar__warning">
      Live transcription failed — recording continues
    </span>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useSidecarStore } from '../stores/sidecar'
import { useTranscriptStore } from '../stores/transcript'
import { useRecordingStore } from '../stores/recording'
const sidecarStore = useSidecarStore()
const transcriptStore = useTranscriptStore()
const recordingStore = useRecordingStore()

const showLiveTelemetry = computed(
  () => transcriptStore.transcriptState === 'live' || transcriptStore.transcriptState === 'finalizing',
)

const ttftLabel = computed(() => {
  if (transcriptStore.liveTimeToFirstTokenMs === null) return '—'
  return `${Math.round(transcriptStore.liveTimeToFirstTokenMs)}ms`
})

const schedulerLabel = computed(() => {
  const pending = transcriptStore.livePendingLatest ? 'yes' : 'no'
  return `Pending ${pending} · Latest ${transcriptStore.liveLatestSeqProcessed}/${transcriptStore.liveLatestSeqAccepted} · Dropped ${transcriptStore.liveSupersededResultsDropped}`
})

const runtimeLabel = computed(() => {
  if (!transcriptStore.liveRuntimeProvider) return ''
  const quant = transcriptStore.liveRuntimeQuantization ?? 'default'
  const fallback = transcriptStore.liveRuntimeFallbackUsed ? ' · fallback' : ''
  return `${transcriptStore.liveRuntimeProvider} · ${quant}${fallback}`
})
</script>

<style scoped>
.status-bar {
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 0 16px;
  height: 24px;
  background: var(--bg-hl);
  border-top: 1px solid var(--border);
  font-size: 0.72rem;
  color: var(--text-de);
}
.status--ready   { color: var(--success); }
.status--error   { color: var(--danger); }
.status--starting { color: #b58900; }
.status--live { color: var(--accent); }
.status--finalizing { color: #b58900; }
.status--complete { color: var(--success); }
.status--transcribing { color: #b58900; }
.status-bar__warning {
  color: #b58900;
}
</style>
