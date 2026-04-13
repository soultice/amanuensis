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
</script>

<style scoped>
.app-shell {
  display: grid;
  grid-template-rows: 48px 1fr 24px;
  height: 100vh;
  overflow: hidden;
}
.app-shell__warning {
  background: #fff8e1;
  color: #856404;
  font-size: 0.8rem;
  padding: 6px 16px;
  border-bottom: 1px solid #f59e0b;
}
.app-shell__main {
  display: grid;
  grid-template-rows: 180px 1fr auto;
  overflow: hidden;
  min-height: 0;
}
.app-shell__waveform {
  border-bottom: 1px solid #e5e7eb;
  background: #fafafa;
  overflow: hidden;
}
.app-shell__transcript {
  overflow-y: auto;
  min-height: 0;
}
.app-shell__annotations {
  border-top: 1px solid #e5e7eb;
  max-height: 200px;
  overflow-y: auto;
}
</style>
