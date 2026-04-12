<template>
  <div class="waveform-panel">
    <div v-if="!recordingStore.audioBlobUrl" class="waveform-panel__empty">
      <p>Waveform appears after recording</p>
    </div>
    <div v-else ref="containerRef" class="waveform-panel__wave" />
  </div>
</template>

<script setup lang="ts">
import { ref, watch, onUnmounted } from 'vue'
import { useWaveSurfer } from '@meersagor/wavesurfer-vue'
import RegionsPlugin from 'wavesurfer.js/dist/plugins/regions.esm.js'
import { useRecordingStore } from '../stores/recording'
import { usePlaybackStore } from '../stores/playback'
import { useTranscriptStore } from '../stores/transcript'

const recordingStore = useRecordingStore()
const playbackStore = usePlaybackStore()
const transcriptStore = useTranscriptStore()

const containerRef = ref<HTMLElement | null>(null)

// Regions plugin — created before WaveSurfer init so it can be passed as plugin
const regionsPlugin = RegionsPlugin.create()

const { waveSurfer, isReady } = useWaveSurfer({
  containerRef,
  options: {
    height: 160,
    waveColor: '#d1d5db',
    progressColor: '#1a56db',
    cursorColor: '#374151',
    barWidth: 2,
    barGap: 1,
    barRadius: 2,
    url: recordingStore.audioBlobUrl ?? undefined,
    interact: true,
    normalize: true,
    plugins: [regionsPlugin],
  },
})

// Register WaveSurfer instance and wire events into playback store
watch(waveSurfer, (ws) => {
  if (!ws) return
  playbackStore.registerWaveSurfer(ws)

  ws.on('ready', (dur: number) => {
    playbackStore.onWaveSurferReady(dur)
  })
  ws.on('timeupdate', (t: number) => {
    playbackStore.onTimeUpdate(t)
  })
  ws.on('play', () => playbackStore.onPlayPause(true))
  ws.on('pause', () => playbackStore.onPlayPause(false))
  ws.on('finish', () => playbackStore.onPlayPause(false))
})

// Sync WaveSurfer region with the selected word range (D-08, D-03/D-04)
watch(
  () => [playbackStore.selectionMin, playbackStore.selectionMax] as [number | null, number | null],
  ([min, max]) => {
    regionsPlugin.clearRegions()
    if (
      min !== null &&
      max !== null &&
      isReady.value &&
      transcriptStore.words.length > 0
    ) {
      const startTime = transcriptStore.words[min]?.start ?? 0
      const endTime = transcriptStore.words[max]?.end ?? startTime + 0.1
      if (endTime > startTime) {
        regionsPlugin.addRegion({
          start: startTime,
          end: endTime,
          color: 'rgba(26, 86, 219, 0.12)',
          drag: false,
          resize: false,
        })
      }
    }
  },
)

onUnmounted(() => {
  waveSurfer.value?.destroy()
})
</script>

<style scoped>
.waveform-panel {
  height: 100%;
  display: flex;
  align-items: center;
  padding: 0 16px;
}
.waveform-panel__empty {
  color: #d1d5db;
  font-size: 0.8rem;
  letter-spacing: 0.05em;
}
.waveform-panel__wave {
  width: 100%;
  height: 100%;
}
</style>
