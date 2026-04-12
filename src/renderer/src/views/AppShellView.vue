<template>
  <div class="app-shell">
    <AppToolbar class="app-shell__toolbar" />
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
import AppToolbar from '../components/AppToolbar.vue'
import WaveformPanel from '../components/WaveformPanel.vue'
import TranscriptPanel from '../components/TranscriptPanel.vue'
import AnnotationPanel from '../components/AnnotationPanel.vue'
import AppStatusBar from '../components/AppStatusBar.vue'
</script>

<style scoped>
.app-shell {
  display: grid;
  grid-template-rows: 48px 1fr 24px;
  height: 100vh;
  overflow: hidden;
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
