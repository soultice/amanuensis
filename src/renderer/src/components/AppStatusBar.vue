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
  background: #f9fafb;
  border-top: 1px solid #e5e7eb;
  font-size: 0.72rem;
  color: #6b7280;
}
.status--ready { color: #16a34a; }
.status--error { color: #dc2626; }
.status--starting { color: #d97706; }
</style>
