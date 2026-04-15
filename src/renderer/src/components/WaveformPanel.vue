<template>
  <div ref="panelRef" class="waveform-panel" @click="handlePanelClick">
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

  // Disable built-in click-to-seek (X-axis) — replaced by custom Y-axis handler
  ws.setOptions({ interact: false })

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

  // Set up ResizeObserver to keep wave div width and WaveSurfer height in sync
  // with the panel dimensions. Must run after ws is available.
  if (panelRef.value) {
    resizeObserver?.disconnect()
    resizeObserver = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect
      // After 90° rotation: wave div CSS width = panelHeight (so it fills height visually)
      if (containerRef.value) {
        containerRef.value.style.width = `${Math.floor(height)}px`
      }
      // WaveSurfer height option = panelWidth (fills the across-waveform visual width)
      ws.setOptions({ height: Math.floor(width) })
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

function handlePanelClick(e: MouseEvent): void {
  if (!waveSurfer.value || !panelRef.value) return
  const rect = panelRef.value.getBoundingClientRect()
  // After 90° rotation, vertical position maps to audio time position
  const relativeTime = (e.clientY - rect.top) / rect.height
  const duration = waveSurfer.value.getDuration()
  if (duration > 0) {
    waveSurfer.value.setTime(relativeTime * duration)
  }
}

onUnmounted(() => {
  resizeObserver?.disconnect()
  waveSurfer.value?.destroy()
})
</script>

<style scoped>
.waveform-panel {
  height: 100%;
  position: relative;
  /* overflow: hidden removed — it clips the wave div at top:100% before
     CSS rotation brings it back into bounds. Use clip-path instead:
     clip-path clips the post-transform visual, not the pre-transform
     layout box, so the rotated canvas is visible. */
  clip-path: inset(0);
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
  writing-mode: vertical-rl;   /* rotate placeholder text to read top-to-bottom */
  transform: rotate(180deg);   /* flip so text reads top→bottom, not bottom→top */
}
.waveform-panel__wave {
  position: absolute;
  top: 100%;            /* transform-origin: 0 0 rotates around bottom-left corner of panel */
  left: 0;
  /* width: set dynamically by ResizeObserver to panelHeight px */
  /* height: controlled by WaveSurfer height option = panelWidth px */
  transform: rotate(90deg);
  transform-origin: 0 0;
}
</style>
