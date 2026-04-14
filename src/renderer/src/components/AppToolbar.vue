<template>
  <header class="toolbar">
    <span class="toolbar__title">Amanuensis</span>

    <div class="toolbar__controls">
      <!-- ← Sessions button (Phase 8) -->
      <button
        class="toolbar__btn toolbar__btn--sessions"
        :disabled="recordingStore.isActive"
        :title="recordingStore.isActive ? 'Stop recording before leaving' : 'Back to sessions'"
        @click="emit('closeSession')"
      >
        ← Sessions
      </button>

      <!-- Audio device selector (AUDIO-01) -->
      <select
        v-if="recordingStore.devices.length > 0"
        v-model="recordingStore.selectedDeviceId"
        class="toolbar__device-select"
        :disabled="recordingStore.isActive"
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

      <!-- Record/Pause/Resume toggle (AUDIO-02 + phase 11) -->
      <button
        class="toolbar__btn"
        :class="recordToggleClass"
        :disabled="!recordingStore.isActive && recordingStore.devices.length === 0"
        :title="recordToggleTitle"
        @click="handleRecordToggle"
      >
        {{ recordToggleLabel }}
      </button>

      <!-- Stop button (AUDIO-03) — shown when recording OR paused -->
      <button
        v-if="recordingStore.isActive"
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

      <!-- Phase 9: dark mode toggle -->
      <button
        class="toolbar__btn toolbar__btn--theme"
        :title="themeStore.isDark ? 'Switch to light mode' : 'Switch to dark mode'"
        @click="themeStore.toggle()"
      >
        {{ themeStore.isDark ? '☀' : '☾' }}
      </button>
    </div>
  </header>
</template>

<script setup lang="ts">
import { ref, onMounted, computed } from 'vue'
import { useRecordingStore } from '../stores/recording'
import { useSessionStore } from '../stores/session'
import { useTranscriptStore } from '../stores/transcript'
import { useThemeStore } from '../stores/theme'
import LevelMeter from './LevelMeter.vue'

const props = defineProps<{ isTranscribing: boolean }>()
const emit = defineEmits<{ transcribe: []; closeSession: [] }>()

const recordingStore = useRecordingStore()
const sessionStore = useSessionStore()
const transcriptStore = useTranscriptStore()
const themeStore = useThemeStore()
const activeStream = ref<MediaStream | null>(null)

// Record/Pause/Resume toggle — derived from store state
const recordToggleLabel = computed<string>(() => {
  if (recordingStore.isRecording) return '⏸ Pause'
  if (recordingStore.isPaused)    return '● Resume'
  return '● Rec'
})

const recordToggleTitle = computed<string>(() => {
  if (recordingStore.isRecording) return 'Pause recording'
  if (recordingStore.isPaused)    return 'Resume recording'
  return 'Start recording'
})

const recordToggleClass = computed<string>(() => {
  if (recordingStore.isRecording) return 'toolbar__btn--pause'
  if (recordingStore.isPaused)    return 'toolbar__btn--resume'
  return 'toolbar__btn--record'
})

function handleRecordToggle(): void {
  if (recordingStore.isRecording) {
    recordingStore.pauseRecording()
  } else if (recordingStore.isPaused) {
    recordingStore.resumeRecording()
  } else {
    startRecording()
  }
}

onMounted(() => recordingStore.loadDevices())

async function startRecording(): Promise<void> {
  // If the current session already has content (recording or transcript),
  // save it and branch into a fresh session before recording again.
  if (recordingStore.isStopped || transcriptStore.hasTranscript) {
    await sessionStore.newSession()
  }
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
  border-bottom: 1px solid var(--border);
  background: var(--bg-hl);
  overflow: hidden;
}
.toolbar__title {
  font-weight: 600;
  font-size: 0.9rem;
  color: var(--text-em);
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
  border: 1px solid var(--border);
  border-radius: 4px;
  background: var(--bg-raised);
  color: var(--text);
  max-width: 200px;
  overflow: hidden;
  text-overflow: ellipsis;
}
.toolbar__device-hint {
  font-size: 0.75rem;
  color: var(--text-de);
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
  background: var(--danger);
  color: #fdf6e3;
}
.toolbar__btn--record:hover:not(:disabled) {
  background: #a8201e;
}
.toolbar__btn--pause {
  background: #b58900;
  color: #fdf6e3;
}
.toolbar__btn--pause:hover:not(:disabled) {
  background: #8a6800;
}
.toolbar__btn--resume {
  background: var(--success);
  color: #fdf6e3;
}
.toolbar__btn--resume:hover:not(:disabled) {
  background: #6b7a00;
}
.toolbar__btn--stop {
  background: var(--text-em);
  color: var(--bg);
}
.toolbar__btn--stop:hover {
  background: var(--text);
}
.toolbar__btn--play {
  background: var(--bg-raised);
  color: var(--text);
  border: 1px solid var(--border);
}
.toolbar__btn--play:hover {
  background: var(--bg-hl);
}
.toolbar__btn--transcribe {
  background: var(--accent);
  color: #fdf6e3;
}
.toolbar__btn--transcribe:hover:not(:disabled) {
  background: var(--accent-2);
}
.toolbar__btn--sessions {
  background: transparent;
  color: var(--text-em);
  border: 1px solid var(--border);
}
.toolbar__btn--sessions:hover:not(:disabled) {
  background: var(--bg-raised);
}
.toolbar__btn--sessions:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}
.toolbar__btn--theme {
  background: transparent;
  color: var(--text-de);
  border: 1px solid var(--border);
  margin-left: auto;
  font-size: 1rem;
  line-height: 1;
  padding: 4px 8px;
}
.toolbar__btn--theme:hover {
  color: var(--text-em);
  background: var(--bg-raised);
}
.toolbar__error {
  font-size: 0.75rem;
  color: var(--danger);
  flex-shrink: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
</style>
