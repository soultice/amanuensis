<template>
  <header class="toolbar">
    <span class="toolbar__title">Amanuensis</span>

    <div class="toolbar__controls">
      <!-- Audio device selector (AUDIO-01) -->
      <select
        v-if="recordingStore.devices.length > 0"
        v-model="recordingStore.selectedDeviceId"
        class="toolbar__device-select"
        :disabled="recordingStore.isRecording"
        title="Audio input device"
      >
        <option
          v-for="dev in recordingStore.devices"
          :key="dev.deviceId"
          :value="dev.deviceId"
        >
          {{ dev.label || `Microphone ${dev.deviceId.slice(0, 6)}` }}
        </option>
      </select>

      <span v-else-if="recordingStore.error" class="toolbar__device-hint">
        No devices
      </span>

      <!-- Level meter — visible while recording (AUDIO-04) -->
      <LevelMeter :stream="activeStream" :active="recordingStore.isRecording" />

      <!-- Record button (AUDIO-02) -->
      <button
        v-if="!recordingStore.isRecording"
        class="toolbar__btn toolbar__btn--record"
        :disabled="recordingStore.devices.length === 0"
        title="Start recording"
        @click="startRecording"
      >
        ● Rec
      </button>

      <!-- Stop button (AUDIO-03) -->
      <button
        v-if="recordingStore.isRecording"
        class="toolbar__btn toolbar__btn--stop"
        title="Stop recording"
        @click="recordingStore.stopRecording()"
      >
        ■ Stop
      </button>

      <!-- Play button — after recording stopped (AUDIO-05) -->
      <button
        v-if="recordingStore.isStopped"
        class="toolbar__btn toolbar__btn--play"
        title="Play recording"
        @click="playRecording"
      >
        ▶ Play
      </button>

      <!-- Transcribe button — only shown when recording exists (D-03, D-04) -->
      <button
        v-if="recordingStore.hasRecording"
        class="toolbar__btn toolbar__btn--transcribe"
        :disabled="props.isTranscribing"
        title="Transcribe recording with Whisper"
        @click="emit('transcribe')"
      >
        {{ props.isTranscribing ? 'Transcribing…' : 'Transcribe' }}
      </button>

      <!-- Error indicator -->
      <span
        v-if="recordingStore.error"
        class="toolbar__error"
        :title="recordingStore.error"
      >
        ⚠ {{ recordingStore.error.slice(0, 40) }}
      </span>
    </div>
  </header>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRecordingStore } from '../stores/recording'
import LevelMeter from './LevelMeter.vue'

const props = defineProps<{ isTranscribing: boolean }>()
const emit = defineEmits<{ transcribe: [] }>()

const recordingStore = useRecordingStore()
const activeStream = ref<MediaStream | null>(null)

onMounted(() => recordingStore.loadDevices())

async function startRecording(): Promise<void> {
  await recordingStore.startRecording()
  // Expose live stream to LevelMeter component
  activeStream.value = recordingStore._stream
}

function playRecording(): void {
  if (!recordingStore.audioBlobUrl) return
  const audio = new Audio(recordingStore.audioBlobUrl)
  audio.play().catch((err) => console.error('Playback error:', err))
}
</script>

<style scoped>
.toolbar {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 0 16px;
  height: 48px;
  border-bottom: 1px solid #e5e7eb;
  background: #ffffff;
  overflow: hidden;
}
.toolbar__title {
  font-weight: 600;
  font-size: 0.9rem;
  color: #374151;
  flex-shrink: 0;
}
.toolbar__controls {
  display: flex;
  align-items: center;
  gap: 8px;
  flex: 1;
  min-width: 0;
}
.toolbar__device-select {
  font-size: 0.8rem;
  padding: 3px 6px;
  border: 1px solid #d1d5db;
  border-radius: 4px;
  background: white;
  max-width: 200px;
  overflow: hidden;
  text-overflow: ellipsis;
}
.toolbar__device-hint {
  font-size: 0.75rem;
  color: #9ca3af;
}
.toolbar__btn {
  padding: 5px 12px;
  border: none;
  border-radius: 5px;
  font-size: 0.8rem;
  font-weight: 500;
  cursor: pointer;
  white-space: nowrap;
  flex-shrink: 0;
}
.toolbar__btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
.toolbar__btn--record {
  background: #dc2626;
  color: white;
}
.toolbar__btn--record:hover:not(:disabled) {
  background: #b91c1c;
}
.toolbar__btn--stop {
  background: #374151;
  color: white;
}
.toolbar__btn--stop:hover {
  background: #1f2937;
}
.toolbar__btn--play {
  background: #f3f4f6;
  color: #374151;
  border: 1px solid #d1d5db;
}
.toolbar__btn--play:hover {
  background: #e5e7eb;
}
.toolbar__btn--transcribe {
  background: #1a56db;
  color: white;
}
.toolbar__btn--transcribe:hover:not(:disabled) {
  background: #1345b7;
}
.toolbar__error {
  font-size: 0.75rem;
  color: #dc2626;
  flex-shrink: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
</style>
