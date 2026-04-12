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
  background: #f5f7fa;
}
.onboarding__card {
  background: white;
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
  color: #1a1a1a;
}
.onboarding__subtitle {
  color: #666;
  margin-bottom: 32px;
  font-size: 1rem;
}
.status-badge {
  padding: 16px;
  border-radius: 8px;
  font-size: 0.95rem;
}
.status--checking {
  background: #f0f0f0;
  color: #666;
}
.status--ready {
  background: #e6f4ea;
  color: #1e7e34;
  font-weight: 600;
}
.status--downloading {
  background: #e8f0fe;
  color: #1a56db;
}
.status--downloading progress {
  width: 100%;
  margin-top: 10px;
  height: 8px;
  border-radius: 4px;
}
.status--missing {
  background: #fff8e1;
  color: #856404;
}
.status--error {
  background: #fce8e6;
  color: #c5221f;
}
.btn-primary {
  display: inline-block;
  margin-top: 14px;
  padding: 10px 28px;
  background: #1a56db;
  color: white;
  border: none;
  border-radius: 6px;
  cursor: pointer;
  font-size: 0.95rem;
  font-weight: 500;
  transition: background 0.15s;
}
.btn-primary:hover {
  background: #1345b7;
}
</style>
