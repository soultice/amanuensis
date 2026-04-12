<template>
  <div class="level-meter" :class="{ 'level-meter--active': props.active }">
    <div
      v-for="(height, i) in bars"
      :key="i"
      class="level-meter__bar"
      :style="{ height: `${height}%` }"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, watch, onUnmounted } from 'vue'

const props = defineProps<{
  stream: MediaStream | null
  active: boolean
}>()

const BAR_COUNT = 12
const bars = ref<number[]>(new Array(BAR_COUNT).fill(0))

let audioCtx: AudioContext | null = null
let analyser: AnalyserNode | null = null
let source: MediaStreamAudioSourceNode | null = null
let rafId: number | null = null
let dataArray = new Uint8Array(0)

function startMeter(stream: MediaStream): void {
  audioCtx = new AudioContext()
  analyser = audioCtx.createAnalyser()
  analyser.fftSize = 64
  analyser.smoothingTimeConstant = 0.8
  source = audioCtx.createMediaStreamSource(stream)
  source.connect(analyser)
  dataArray = new Uint8Array(analyser.frequencyBinCount)

  const tick = () => {
    analyser!.getByteFrequencyData(dataArray)
    const bucketSize = Math.floor(dataArray.length / BAR_COUNT)
    bars.value = Array.from({ length: BAR_COUNT }, (_, i) => {
      const start = i * bucketSize
      const slice = dataArray.slice(start, start + bucketSize)
      const avg = slice.reduce((a, b) => a + b, 0) / slice.length
      return Math.round((avg / 255) * 100)
    })
    rafId = requestAnimationFrame(tick)
  }
  rafId = requestAnimationFrame(tick)
}

function stopMeter(): void {
  if (rafId !== null) cancelAnimationFrame(rafId)
  source?.disconnect()
  audioCtx?.close()
  audioCtx = null
  analyser = null
  source = null
  rafId = null
  bars.value = new Array(BAR_COUNT).fill(0)
}

watch(
  () => [props.stream, props.active] as [MediaStream | null, boolean],
  ([stream, active]) => {
    stopMeter()
    if (stream && active) startMeter(stream)
  },
)

onUnmounted(() => stopMeter())
</script>

<style scoped>
.level-meter {
  display: flex;
  align-items: flex-end;
  gap: 2px;
  height: 24px;
  width: 80px;
  padding: 0 4px;
}
.level-meter__bar {
  flex: 1;
  min-height: 2px;
  background: #d1d5db;
  border-radius: 1px;
  transition: height 60ms ease-out;
}
.level-meter--active .level-meter__bar {
  background: #16a34a;
}
</style>
