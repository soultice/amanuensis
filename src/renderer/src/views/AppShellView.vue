<template>
  <div class="app-shell">
    <!-- Audio file missing warning after session restore (D-14) -->
    <div v-if="sessionStore.audioFileMissing" class="app-shell__warning">
      ⚠ Audio file not found — transcript and annotations restored without audio.
    </div>
    <AppToolbar
      class="app-shell__toolbar"
      :is-transcribing="transcriptStore.isTranscribing"
      @transcribe="handleTranscribe"
      @close-session="handleCloseSession"
    />
    <main class="app-shell__main">
      <section class="app-shell__waveform">
        <WaveformPanel />
      </section>
      <section class="app-shell__transcript">
        <TranscriptPanel />
      </section>
      <section class="app-shell__annotations">
        <AnnotationPanel />
      </section>
    </main>
    <AppStatusBar class="app-shell__statusbar" />
  </div>
</template>

<script setup lang="ts">
import { onMounted, onUnmounted } from 'vue'
import { useRecordingStore } from '../stores/recording'
import { useTranscriptStore } from '../stores/transcript'
import { useSessionStore } from '../stores/session'
import AppToolbar from '../components/AppToolbar.vue'
import WaveformPanel from '../components/WaveformPanel.vue'
import TranscriptPanel from '../components/TranscriptPanel.vue'
import AnnotationPanel from '../components/AnnotationPanel.vue'
import AppStatusBar from '../components/AppStatusBar.vue'

const recordingStore = useRecordingStore()
const transcriptStore = useTranscriptStore()
const sessionStore = useSessionStore()

onMounted(async () => {
  sessionStore.startAutoSave()          // SESSION-01: 30s auto-save
  sessionStore.registerSaveOnClose()    // SESSION-02: save on close
})

onUnmounted(() => {
  sessionStore.stopAutoSave()
  sessionStore.unregisterSaveOnClose()
})

async function handleTranscribe(): Promise<void> {
  if (!recordingStore.audioBlob) return
  await transcriptStore.transcribe(recordingStore.audioBlob)
}

async function handleCloseSession(): Promise<void> {
  sessionStore.stopAutoSave()
  await sessionStore.closeSession()
  // currentSessionId is now null → App.vue routes back to SessionListView
}
</script>

<style scoped>
.app-shell {
  display: grid;
  grid-template-rows: 48px 1fr 24px;
  height: 100vh;
  overflow: hidden;
  background: var(--bg);
}
.app-shell__warning {
  background: var(--warn-bg);
  color: var(--warn-text);
  font-size: 0.8rem;
  padding: 6px 16px;
  border-bottom: 1px solid var(--warn-border);
}
.app-shell__main {
  display: grid;
  grid-template-rows: 180px 1fr auto;
  overflow: hidden;
  min-height: 0;
}
.app-shell__waveform {
  border-bottom: 1px solid var(--border);
  background: var(--bg-hl);
  overflow: hidden;
}
.app-shell__transcript {
  overflow-y: auto;
  min-height: 0;
  background: var(--bg);
}
.app-shell__annotations {
  border-top: 1px solid var(--border);
  max-height: 200px;
  overflow-y: auto;
  background: var(--bg);
}
</style>
