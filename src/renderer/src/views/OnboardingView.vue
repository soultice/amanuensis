<template>
  <div class="onboarding">
    <div class="onboarding__card">
      <h1 class="onboarding__title">Amanuensis</h1>
      <p class="onboarding__subtitle">Audio transcription and annotation</p>

      <div class="onboarding__status">
        <!-- checking -->
        <div v-if="modelStore.state === 'checking'" class="status-badge status--checking">
          Checking model…
        </div>

        <!-- present — App.vue will switch to AppShellView automatically -->
        <div v-else-if="modelStore.state === 'present'" class="status-badge status--ready">
          Model ready ✓
        </div>

        <!-- downloading -->
        <div v-else-if="modelStore.state === 'downloading'" class="status-badge status--downloading">
          <p>Downloading Whisper large-v3… {{ modelStore.progress }}%</p>
          <progress :value="modelStore.progress" max="100" />
        </div>

        <!-- missing -->
        <div v-else-if="modelStore.state === 'missing'" class="status-badge status--missing">
          <p>Whisper large-v3 model is not downloaded (~3 GB required)</p>
          <button class="btn-primary" @click="modelStore.startDownload()">
            Download Model
          </button>
        </div>

        <!-- error -->
        <div v-else-if="modelStore.state === 'error'" class="status-badge status--error">
          <p>Download failed: {{ modelStore.error }}</p>
          <button class="btn-primary" @click="modelStore.startDownload()">Retry</button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { useModelStore } from '../stores/model'
const modelStore = useModelStore()
</script>

<style scoped>
.onboarding {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100vh;
  background: var(--bg);
}
.onboarding__card {
  background: var(--bg-raised);
  border: 1px solid var(--border);
  border-radius: 12px;
  padding: 48px;
  max-width: 480px;
  width: 100%;
  box-shadow: 0 4px 24px rgba(0, 0, 0, 0.08);
  text-align: center;
}
.onboarding__title {
  font-size: 2rem;
  font-weight: 700;
  margin-bottom: 8px;
  color: var(--text-em);
}
.onboarding__subtitle {
  color: var(--text-de);
  margin-bottom: 32px;
  font-size: 1rem;
}
.status-badge {
  padding: 16px;
  border-radius: 8px;
  font-size: 0.95rem;
  color: var(--text);
  background: var(--bg-hl);
}
.status--checking {
  color: var(--text-de);
}
.status--ready {
  background: rgba(133,153,0,0.12);
  color: var(--success);
  font-weight: 600;
}
.status--downloading {
  background: rgba(38,139,210,0.12);
  color: var(--accent);
}
.status--downloading progress {
  width: 100%;
  margin-top: 10px;
  height: 8px;
  border-radius: 4px;
}
.status--missing {
  background: var(--warn-bg);
  color: var(--warn-text);
}
.status--error {
  background: rgba(220,50,47,0.1);
  color: var(--danger);
}
.btn-primary {
  display: inline-block;
  margin-top: 14px;
  padding: 10px 28px;
  background: var(--accent);
  color: #fdf6e3;
  border: none;
  border-radius: 6px;
  cursor: pointer;
  font-size: 0.95rem;
  font-weight: 500;
  transition: background 0.15s;
}
.btn-primary:hover { background: var(--accent-2); }
</style>
