<template>
  <dialog ref="dialogRef" class="error-dialog">
    <div class="error-dialog__content">
      <h2 class="error-dialog__title">⚠ Sidecar Failed to Start</h2>
      <p class="error-dialog__message">
        The transcription service could not be started. The app cannot function without it.
      </p>
      <details v-if="props.error" class="error-dialog__details">
        <summary>Error details</summary>
        <pre>{{ props.error }}</pre>
      </details>
      <div class="error-dialog__actions">
        <button class="btn-primary" @click="restartApp">Restart App</button>
      </div>
    </div>
  </dialog>
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue'

const props = defineProps<{ error: string }>()
const dialogRef = ref<HTMLDialogElement>()

onMounted(() => {
  dialogRef.value?.showModal()
  // Prevent Escape from dismissing — blocking by design (D-06, D-07)
  dialogRef.value?.addEventListener('cancel', (e) => e.preventDefault())
})

async function restartApp(): Promise<void> {
  await window.api.restartApp()
}
</script>

<style scoped>
.error-dialog {
  border: none;
  border-radius: 12px;
  box-shadow: 0 8px 40px rgba(0, 0, 0, 0.32);
  padding: 0;
  max-width: 480px;
  width: 90%;
  background: var(--bg-raised);
  color: var(--text);
}
.error-dialog::backdrop {
  background: rgba(0, 0, 0, 0.6);
}
.error-dialog__content {
  padding: 32px;
}
.error-dialog__title {
  color: var(--danger);
  margin-bottom: 12px;
  font-size: 1.2rem;
}
.error-dialog__message {
  color: var(--text);
  margin-bottom: 16px;
  line-height: 1.6;
}
.error-dialog__details {
  margin-bottom: 16px;
}
.error-dialog__details summary {
  cursor: pointer;
  color: var(--text-de);
  font-size: 0.85rem;
  margin-bottom: 6px;
}
.error-dialog__details pre {
  background: var(--bg-hl);
  padding: 12px;
  border-radius: 6px;
  overflow-x: auto;
  font-size: 0.78rem;
  line-height: 1.5;
  color: var(--text);
  white-space: pre-wrap;
}
.error-dialog__actions {
  display: flex;
  justify-content: flex-end;
}
.btn-primary {
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
.btn-primary:hover {
  background: var(--accent-2);
}
</style>
