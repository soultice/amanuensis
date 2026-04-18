<template>
  <div ref="panelRef" class="waveform-panel" @click="handlePanelClick">
    <!-- Placeholder shown before any audio is available -->
    <p v-if="!recordingStore.audioBlobUrl" class="waveform-panel__empty">
      Waveform appears<br>after recording
    </p>

    <!--
      Container is always in the DOM so useWaveSurfer's onMounted can create
      the WaveSurfer instance with a valid element. Hiding it via v-if caused
      containerRef to be null at mount, so WaveSurfer was never initialised
      and the waveform was permanently blank after recording.
    -->
    <div ref="containerRef" class="waveform-panel__wave" />

    <!--
      Playback cursor: a horizontal line at the current playback position.
      WaveSurfer's built-in progress overlay fills left→right, which is wrong
      for a vertical (top→bottom) waveform. We use progressColor:'transparent'
      and draw the cursor ourselves as a CSS-positioned div instead.
    -->
    <div
      v-if="isReady && playbackStore.duration > 0"
      class="waveform-panel__cursor"
      :style="{ top: (playbackStore.currentTime / playbackStore.duration * 100) + '%' }"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, watch, computed, onUnmounted, withDefaults, defineProps } from 'vue'
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

// Height prop: AppShellView passes the transcript's natural scrollHeight so
// the waveform fills the same vertical space as the text (temporal alignment).
const props = withDefaults(defineProps<{ transcriptScrollHeight?: number }>(), {
  transcriptScrollHeight: 0,
})

// Regions plugin — created before WaveSurfer init so it can be passed as plugin
const regionsPlugin = RegionsPlugin.create()

// Theme-adaptive wave colours.
const waveColors = computed(() =>
  themeStore.isDark
    ? { waveColor: '#93a1a1', progressColor: 'transparent', cursorColor: 'transparent' }
    : { waveColor: '#657b83', progressColor: 'transparent', cursorColor: 'transparent' }
)

/**
 * Vertical waveform renderer for WaveSurfer's renderFunction hook.
 *
 * WaveSurfer calls this after audio is decoded, passing peaks[] and the
 * canvas 2D context. The canvas is already sized to containerWidth × WaveSurferHeight.
 * We draw the waveform with time flowing TOP → BOTTOM:
 *   - Y axis = time (0 at top, duration at bottom)
 *   - X axis = amplitude (bars centred horizontally)
 *
 * WaveSurfer sets ctx.fillStyle = waveColor before calling us, so we inherit
 * the correct theme colour automatically.
 */
function renderVertical(
  peaks: Array<Float32Array | number[]>,
  ctx: CanvasRenderingContext2D,
): void {
  const { width, height } = ctx.canvas
  const channelData = peaks[0]
  if (!channelData || channelData.length === 0) return

  const totalSamples = channelData.length
  // Thickness of each bar: spread samples evenly over canvas height.
  // At minimum 1px so nothing disappears due to rounding.
  const barThickness = Math.max(1, Math.ceil(height / totalSamples))

  for (let i = 0; i < totalSamples; i++) {
    const amplitude = Math.abs(Number(channelData[i]))
    if (amplitude < 0.001) continue // skip near-silence

    const y = Math.round((i / totalSamples) * height)
    const barW = Math.round(amplitude * width)
    const x = Math.round((width - barW) / 2) // centred horizontally
    ctx.fillRect(x, y, barW, barThickness)
  }
}

const { waveSurfer, isReady } = useWaveSurfer({
  containerRef,
  options: {
    height: 160, // overridden by ResizeObserver once panel dimensions are known
    ...waveColors.value,
    barWidth: 0,      // ignored — renderFunction overrides bar drawing
    barGap: 0,
    barRadius: 0,
    interact: false,  // Y-axis seek handled by handlePanelClick below
    normalize: true,
    plugins: [regionsPlugin],
    renderFunction: renderVertical,
  },
})

function findWaveSurferShadowRoot(): ShadowRoot | null {
  const container = containerRef.value
  if (!container) return null

  const directHost = container.firstElementChild as HTMLElement | null
  if (directHost?.shadowRoot) return directHost.shadowRoot

  for (const node of Array.from(container.querySelectorAll('*'))) {
    const el = node as HTMLElement
    if (el.shadowRoot) return el.shadowRoot
  }

  return null
}

function suppressWaveSurferHorizontalProgress(): void {
  const root = findWaveSurferShadowRoot()
  if (!root) return

  const progressEl = root.querySelector('[part="progress"]') as HTMLElement | null
  const cursorEl = root.querySelector('[part="cursor"]') as HTMLElement | null
  const canvasesEl = root.querySelector('[part="canvases"]') as HTMLElement | null

  if (progressEl) {
    progressEl.style.display = 'none'
    progressEl.style.width = '0'
    progressEl.style.maxWidth = '0'
    progressEl.style.opacity = '0'
    progressEl.style.visibility = 'hidden'
    progressEl.style.pointerEvents = 'none'
  }
  if (cursorEl) {
    cursorEl.style.display = 'none'
    cursorEl.style.width = '0'
    cursorEl.style.opacity = '0'
    cursorEl.style.visibility = 'hidden'
    cursorEl.style.pointerEvents = 'none'
  }
  if (canvasesEl) {
    canvasesEl.style.clipPath = 'none'
  }
}

// Register WaveSurfer instance and wire events into playback store
watch(waveSurfer, (ws) => {
  if (!ws) return

  suppressWaveSurferHorizontalProgress()

  playbackStore.registerWaveSurfer(ws)

  ws.on('ready', (dur: number) => {
    suppressWaveSurferHorizontalProgress()
    playbackStore.onWaveSurferReady(dur)
  })
  ws.on('timeupdate', (t: number) => {
    suppressWaveSurferHorizontalProgress()
    playbackStore.onTimeUpdate(t)
  })
  ws.on('redraw', () => suppressWaveSurferHorizontalProgress())
  ws.on('redrawcomplete', () => suppressWaveSurferHorizontalProgress())
  ws.on('play', () => playbackStore.onPlayPause(true))
  ws.on('pause', () => playbackStore.onPlayPause(false))
  ws.on('finish', () => playbackStore.onPlayPause(false))

  // Load audio if already available at mount (e.g., after session restore)
  if (recordingStore.audioBlobUrl) {
    ws.load(recordingStore.audioBlobUrl)
  }

  // ResizeObserver: keeps WaveSurfer height in sync.
  // When transcriptScrollHeight > 0, use that (so waveform matches full text
  // height). Otherwise fall back to the panel's own clientHeight.
  if (panelRef.value) {
    resizeObserver?.disconnect()
    resizeObserver = new ResizeObserver(([entry]) => {
      const { height } = entry.contentRect
      const target = props.transcriptScrollHeight > 0
        ? props.transcriptScrollHeight
        : Math.floor(height)
      if (target > 0) ws.setOptions({ height: target })
    })
    resizeObserver.observe(panelRef.value)
  }
})

// When transcript content grows (e.g. after transcription), update WaveSurfer
// height AND the container's explicit CSS height so the panel grows to match
// the full transcript content height (enabling scroll sync).
watch(() => props.transcriptScrollHeight, (sh) => {
  if (sh > 0) {
    if (containerRef.value) containerRef.value.style.height = `${sh}px`
    if (waveSurfer.value) waveSurfer.value.setOptions({ height: sh })
  }
})

// Reload WaveSurfer when audioBlobUrl changes (after recording completes)
watch(
  () => recordingStore.audioBlobUrl,
  (url) => {
    if (url && waveSurfer.value) {
      waveSurfer.value.load(url)
      requestAnimationFrame(() => suppressWaveSurferHorizontalProgress())
    }
  }
)

// Sync WaveSurfer region with the selected word range
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

/**
 * Y-axis click-to-seek. Uses the container's full scrollable height (not the
 * panel's clipped viewport) so seek position is correct regardless of scroll.
 */
function handlePanelClick(e: MouseEvent): void {
  if (!waveSurfer.value || !containerRef.value) return
  // panelRef.getBoundingClientRect() gives the VIEWPORT rect (clipped).
  // We need the position relative to the full canvas height.
  const panelRect = panelRef.value!.getBoundingClientRect()
  const scrollTop = panelRef.value!.parentElement?.scrollTop ?? 0
  const totalHeight = containerRef.value.offsetHeight // full canvas height
  const clickY = (e.clientY - panelRect.top) + scrollTop
  const relativeTime = Math.max(0, Math.min(1, clickY / totalHeight))
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
  /* No height:100% — the panel grows to match the WaveSurfer canvas height
     (= transcriptScrollHeight, set on .waveform-panel__wave via inline style).
     .app-shell__waveform (overflow-y:scroll, viewport-height) clips and scrolls
     the tall panel so temporal positions match the transcript scroll position. */
  position: relative;
  overflow: hidden;
}
.waveform-panel__empty {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  text-align: center;
  color: var(--text-de);
  font-size: 0.75rem;
  letter-spacing: 0.05em;
  line-height: 1.6;
  pointer-events: none;
}
.waveform-panel__wave {
  /* Width fills the column. Height set dynamically via inline style to
     transcriptScrollHeight so the waveform and transcript span the same
     total vertical distance (temporal alignment via scroll sync). */
  width: 100%;
}
/* Note: WaveSurfer's built-in progress overlay/cursor are suppressed from JS
   by mutating the actual shadow-root elements each redraw/timeupdate, because
   its default left→right progress conflicts with this top→bottom waveform. */
.waveform-panel__cursor {
  /* Horizontal position-indicator line: moves top→bottom as audio plays.
     The panel is transcriptScrollHeight tall so top:N% = N% through the audio.
     z-index above the WaveSurfer canvas, below any tooltip/overlay. */
  position: absolute;
  left: 0;
  right: 0;
  height: 2px;
  background: var(--accent);
  pointer-events: none;
  z-index: 10;
}
</style>
