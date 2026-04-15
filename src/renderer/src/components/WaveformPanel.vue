<template>
  <div ref="panelRef" class="waveform-panel">
    <!-- Placeholder shown before any audio is available -->
    <p v-if="!recordingStore.audioBlobUrl" class="waveform-panel__empty">
      Waveform appears after recording
    </p>
    <!--
      Container is always in the DOM so useWaveSurfer's onMounted can create
      the WaveSurfer instance with a valid element. Hiding it via v-if caused
      containerRef to be null at mount, so WaveSurfer was never initialised
      and the waveform was permanently blank after recording.
    -->
    <div ref="containerRef" class="waveform-panel__wave" />
  </div>
</template>

<script setup lang="ts">
import { ref, watch, computed, onUnmounted } from 'vue'
import { useWaveSurfer } from '@meersagor/wavesurfer-vue'
import RegionsPlugin from 'wavesurfer.js/dist/plugins/regions.esm.js'
import { useRecordingStore } from '../stores/recording'
import { usePlaybackStore } from '../stores/playback'
import { useTranscriptStore } from '../stores/transcript'
import { useThemeStore } from '../stores/theme'

const recordingStore = useRecordingStore()
const playbackStore = usePlaybackStore()
const transcriptStore = useTranscriptStore()
const themeStore = useThemeStore()

const containerRef = ref<HTMLElement | null>(null)
const panelRef = ref<HTMLElement | null>(null)
let resizeObserver: ResizeObserver | null = null

// Target WaveSurfer height = the waveform panel's full height so the
// visualisation fills the side column. Updated on each ResizeObserver callback.

// Regions plugin — created before WaveSurfer init so it can be passed as plugin
const regionsPlugin = RegionsPlugin.create()

// Theme-adaptive wave colours. waveColor #d1d5db had 1.20:1 contrast on
// Solarized-light (#eee8d5) — invisible. Use Solarized palette tokens instead.
const waveColors = computed(() =>
  themeStore.isDark
    ? { waveColor: '#93a1a1', progressColor: '#268bd2', cursorColor: '#93a1a1' }
    : { waveColor: '#657b83', progressColor: '#1a56db', cursorColor: '#374151' }
)

const { waveSurfer, isReady } = useWaveSurfer({
  containerRef,
  options: {
    height: 160,
    ...waveColors.value,
    barWidth: 2,
    barGap: 1,
    barRadius: 2,
    interact: true,
    normalize: true,
    plugins: [regionsPlugin],
    // url loaded dynamically when audioBlobUrl changes (see watch below)
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

  // Load audio if already available at mount (e.g., after session restore)
  if (recordingStore.audioBlobUrl) {
    ws.load(recordingStore.audioBlobUrl)
  }

  // ResizeObserver keeps WaveSurfer height = panel height so the waveform
  // fills the full side column. Width is handled by CSS (width: 100%).
  if (panelRef.value) {
    resizeObserver?.disconnect()
    resizeObserver = new ResizeObserver(([entry]) => {
      const { height } = entry.contentRect
      if (height > 0) {
        ws.setOptions({ height: Math.floor(height) })
      }
    })
    resizeObserver.observe(panelRef.value)
  }
})

// Reload WaveSurfer when audioBlobUrl changes (after recording completes)
watch(
  () => recordingStore.audioBlobUrl,
  (url) => {
    if (url && waveSurfer.value) {
      waveSurfer.value.load(url)
    }
  }
)

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

// Update WaveSurfer colours when the Solarized theme toggles (light ↔ dark)
watch(waveColors, (colors) => {
  if (waveSurfer.value) {
    waveSurfer.value.setOptions(colors)
  }
})

onUnmounted(() => {
  resizeObserver?.disconnect()
  waveSurfer.value?.destroy()
})
</script>

<style scoped>
.waveform-panel {
  height: 100%;
  position: relative;
  overflow: hidden;
}
.waveform-panel__empty {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--text-de);
  font-size: 0.8rem;
  letter-spacing: 0.05em;
  pointer-events: none;
}
.waveform-panel__wave {
  /* Fill the full panel — WaveSurfer height is set to panel height via
     ResizeObserver so the waveform fills the entire side column. */
  width: 100%;
  height: 100%;
}
</style>
