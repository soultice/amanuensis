<template>
  <div class="status-bar">
    <span class="status-bar__item" :class="`status--${sidecarStore.status}`">
      Sidecar: {{ sidecarStore.status }}
    </span>
  </div>
</template>

<script setup lang="ts">
import { useSidecarStore } from '../stores/sidecar'
const sidecarStore = useSidecarStore()
</script>

<style scoped>
.status-bar {
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 0 16px;
  height: 24px;
  background: var(--bg-hl);
  border-top: 1px solid var(--border);
  font-size: 0.72rem;
  color: var(--text-de);
}
.status--ready   { color: var(--success); }
.status--error   { color: var(--danger); }
.status--starting { color: #b58900; }
</style>
