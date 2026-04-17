<template>
  <div class="app-shell">
    <!-- Audio file missing warning after session restore (D-14) -->
    <div v-if="sessionStore.audioFileMissing" class="app-shell__warning">
      ⚠ Audio file not found — transcript and annotations restored without audio.
    </div>
    <AppToolbar
      class="app-shell__toolbar"
      @close-session="handleCloseSession"
    />
    <main class="app-shell__main">
      <section class="app-shell__waveform" ref="waveformRef">
        <WaveformPanel :transcript-scroll-height="transcriptScrollHeight" />
      </section>
      <section class="app-shell__transcript" ref="transcriptRef" @scroll.passive="syncWaveformScroll">
        <TranscriptPanel ref="transcriptPanelRef" />
      </section>
      <section class="app-shell__annotations">
        <AnnotationPanel />
      </section>
    </main>
    <AppStatusBar class="app-shell__statusbar" />
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted, nextTick, watch } from 'vue'
import { useRecordingStore } from '../stores/recording'
import { useTranscriptStore } from '../stores/transcript'
import { useSessionStore } from '../stores/session'
import { useSidecarStore } from '../stores/sidecar'
import AppToolbar from '../components/AppToolbar.vue'
import WaveformPanel from '../components/WaveformPanel.vue'
import TranscriptPanel from '../components/TranscriptPanel.vue'
import AnnotationPanel from '../components/AnnotationPanel.vue'
import AppStatusBar from '../components/AppStatusBar.vue'

const recordingStore = useRecordingStore()
const transcriptStore = useTranscriptStore()
const sessionStore = useSessionStore()
const sidecarStore = useSidecarStore()

// Scroll sync: waveform height = transcript scrollable content height,
// waveform scrolls in lockstep with transcript so temporal positions align.
const waveformRef = ref<HTMLElement | null>(null)
const transcriptRef = ref<HTMLElement | null>(null)
const transcriptPanelRef = ref<InstanceType<typeof TranscriptPanel> | null>(null)
const transcriptScrollHeight = ref(0)
let contentResizeObserver: ResizeObserver | null = null

function updateScrollHeight(): void {
  if (transcriptRef.value) {
    transcriptScrollHeight.value = transcriptRef.value.scrollHeight
  }
}

function syncWaveformScroll(): void {
  if (!transcriptRef.value || !waveformRef.value) return
  // Mirror transcript scroll position on the waveform section (hidden scrollbar)
  waveformRef.value.scrollTop = transcriptRef.value.scrollTop
  // Keep scrollHeight in sync (content may grow e.g. after transcription)
  updateScrollHeight()
}

onMounted(async () => {
  sessionStore.startAutoSave()          // SESSION-01: 30s auto-save
  sessionStore.registerSaveOnClose()    // SESSION-02: save on close

  // Initial scrollHeight read after Vue has rendered
  await nextTick()
  updateScrollHeight()

  // Observe TranscriptPanel's natural-height element for content changes
  // (e.g., when transcription completes and word spans are added).
  // panelEl is exposed by TranscriptPanel via defineExpose; Vue 3 unwraps
  // the ref so we access the element directly (no extra .value).
  const panelEl = transcriptPanelRef.value?.panelEl as HTMLElement | null | undefined
  if (panelEl) {
    contentResizeObserver = new ResizeObserver(updateScrollHeight)
    contentResizeObserver.observe(panelEl)
  }
})

onUnmounted(() => {
  sessionStore.stopAutoSave()
  sessionStore.unregisterSaveOnClose()
  contentResizeObserver?.disconnect()
})

watch(
  () => recordingStore.recordingState,
  async (next, prev) => {
    if (next === 'recording' && prev !== 'paused') {
      await transcriptStore.startLiveSession()
      if (
        sidecarStore.port !== null &&
        recordingStore.recordingState === 'recording' &&
        transcriptStore.liveSessionId
      ) {
        transcriptStore._startLiveStatusPolling(sidecarStore.port)
      }
    }

    if (next === 'stopped' || next === 'idle') {
      transcriptStore._stopLiveStatusPolling()
    }
  },
)

async function handleCloseSession(): Promise<void> {
  if (recordingStore.isActive || transcriptStore.isLive || transcriptStore.isTranscribing) return
  sessionStore.stopAutoSave()
  await sessionStore.closeSession()
  // currentSessionId is now null → App.vue routes back to SessionListView
}
</script>

<style scoped>
.app-shell {
  display: grid;
  grid-template-rows: auto 48px 1fr 24px; /* row1=warning, row2=toolbar, row3=main, row4=statusbar */
  height: 100vh;
  overflow: hidden;
  background: var(--bg);
}
/*
  Explicit grid-row on every direct child so auto-placement never shifts
  items when the warning div is absent (v-if=false removes it from DOM,
  which would otherwise push toolbar into row1, main into row2, etc.).
*/
.app-shell__warning {
  grid-row: 1;
  background: var(--warn-bg);
  color: var(--warn-text);
  font-size: 0.8rem;
  padding: 6px 16px;
  border-bottom: 1px solid var(--warn-border);
}
.app-shell__toolbar {
  grid-row: 2;
}
.app-shell__main {
  grid-row: 3;
  display: grid;
  grid-template-columns: 25% 1fr;
  grid-template-rows: 1fr auto;
  overflow: hidden;
  min-height: 0;
}
.app-shell__statusbar {
  grid-row: 4;
}
.app-shell__waveform {
  grid-column: 1;
  grid-row: 1;
  border-right: 1px solid var(--border);
  background: var(--bg-hl);
  /* Hidden-scrollbar scroll container — synced programmatically with transcript.
     scrollbar-width: none hides the bar on Firefox;
     ::-webkit-scrollbar { display:none } handles Chrome/Electron. */
  overflow-y: scroll;
  scrollbar-width: none;
  min-height: 0;
}
.app-shell__waveform::-webkit-scrollbar {
  display: none;
}
.app-shell__transcript {
  grid-column: 2;
  grid-row: 1;
  overflow-y: auto;
  min-height: 0;
  background: var(--bg);
}
.app-shell__annotations {
  grid-column: 1 / -1;
  grid-row: 2;
  border-top: 1px solid var(--border);
  max-height: 200px;
  overflow-y: auto;
  background: var(--bg);
}
</style>
