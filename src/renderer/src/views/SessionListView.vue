<template>
  <div class="session-list-view">
    <header class="session-list-view__header">
      <h1 class="session-list-view__title">Amanuensis</h1>
      <div class="session-list-view__header-actions">
        <button class="session-list-view__new-btn" @click="handleNew">
          + New Session
        </button>
        <button
          class="session-list-view__import-btn"
          :disabled="isImportPending"
          :title="isImportPending ? 'Selecting file…' : 'Import audio from file'"
          @click="handleImport"
        >
          {{ isImportPending ? 'Importing…' : 'Import Audio' }}
        </button>
        <button
          class="session-list-view__theme-btn"
          :title="themeStore.isDark ? 'Switch to light mode' : 'Switch to dark mode'"
          @click="themeStore.toggle()"
        >
          {{ themeStore.isDark ? '☀' : '☾' }}
        </button>
      </div>
    </header>

    <p v-if="importWarning" class="session-list-view__import-warning">
      ⚠ {{ importWarning }}
    </p>

    <main class="session-list-view__body">
      <p v-if="loading" class="session-list-view__hint">Loading…</p>
      <p v-else-if="sessions.length === 0" class="session-list-view__hint">
        No sessions yet.
      </p>
      <ul v-else class="session-list-view__list">
        <li
          v-for="session in sessions"
          :key="session.id"
          class="session-card"
        >
          <div class="session-card__info">
            <span class="session-card__name">{{ session.name }}</span>
            <span class="session-card__meta">
              {{ session.wordCount }} words · saved {{ formatDate(session.updatedAt) }}
            </span>
          </div>
          <div class="session-card__actions">
            <button class="session-card__open-btn" @click="handleOpen(session.id)">
              Open →
            </button>
            <button class="session-card__delete-btn" @click="handleDelete(session.id)" title="Delete session">
              ✕
            </button>
          </div>
        </li>
      </ul>
    </main>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useSessionStore } from '../stores/session'
import { useThemeStore } from '../stores/theme'
import type { SessionMeta } from '../stores/session'

const sessionStore = useSessionStore()
const themeStore = useThemeStore()
const sessions = ref<SessionMeta[]>([])
const loading = ref(true)

const emit = defineEmits<{ open: [id: string] }>()

onMounted(async () => {
  sessions.value = await sessionStore.listSessions()
  loading.value = false
})

async function handleNew(): Promise<void> {
  const id = await sessionStore.createSession()
  emit('open', id)
}

async function handleOpen(id: string): Promise<void> {
  emit('open', id)
}

const isImportPending = computed<boolean>(() => sessionStore.importPhase === 'picking')

const importWarning = computed<string | null>(() => {
  const error = sessionStore.lastImportError
  if (!error || error.entrypoint !== 'session-list') return null
  if (error.reason === 'cancelled') return null
  return error.message
})

async function handleImport(): Promise<void> {
  if (isImportPending.value) return
  await sessionStore.startImportIntent('session-list')
}

async function handleDelete(id: string): Promise<void> {
  await window.api.deleteSession(id)
  sessions.value = sessions.value.filter(s => s.id !== id)
}

function formatDate(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
}
</script>

<style scoped>
.session-list-view {
  display: flex;
  flex-direction: column;
  height: 100vh;
  background: var(--bg);
  color: var(--text);
}
.session-list-view__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 24px;
  height: 56px;
  background: var(--bg-hl);
  border-bottom: 1px solid var(--border);
  flex-shrink: 0;
  gap: 12px;
}
.session-list-view__header-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}
.session-list-view__title {
  font-size: 1rem;
  font-weight: 600;
  color: var(--text-em);
  margin: 0;
  flex: 1;
}
.session-list-view__new-btn {
  padding: 7px 14px;
  background: var(--accent);
  color: #fdf6e3;
  border: none;
  border-radius: 6px;
  font-size: 0.85rem;
  font-weight: 500;
  cursor: pointer;
}
.session-list-view__new-btn:hover { background: var(--accent-2); }
.session-list-view__import-btn {
  padding: 7px 12px;
  background: var(--bg-raised);
  color: var(--text-em);
  border: 1px solid var(--border);
  border-radius: 6px;
  font-size: 0.82rem;
  font-weight: 500;
  cursor: pointer;
}
.session-list-view__import-btn:hover:not(:disabled) {
  background: var(--bg);
}
.session-list-view__import-btn:disabled {
  opacity: 0.6;
  cursor: wait;
}
.session-list-view__theme-btn {
  background: transparent;
  color: var(--text-de);
  border: 1px solid var(--border);
  border-radius: 5px;
  padding: 5px 8px;
  font-size: 1rem;
  line-height: 1;
  cursor: pointer;
}
.session-list-view__theme-btn:hover {
  color: var(--text-em);
  background: var(--bg-raised);
}
.session-list-view__body {
  flex: 1;
  overflow-y: auto;
  padding: 24px;
  max-width: 720px;
  width: 100%;
  margin: 0 auto;
}
.session-list-view__import-warning {
  margin: 0;
  padding: 10px 24px;
  border-bottom: 1px solid color-mix(in srgb, var(--danger) 24%, var(--border));
  background: color-mix(in srgb, var(--danger) 9%, transparent);
  color: var(--danger);
  font-size: 0.8rem;
}
.session-list-view__hint {
  color: var(--text-de);
  font-size: 0.9rem;
  text-align: center;
  margin-top: 48px;
}
.session-list-view__list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.session-card {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px 16px;
  background: var(--bg-raised);
  border: 1px solid var(--border);
  border-radius: 8px;
}
.session-card__info {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}
.session-card__name {
  font-size: 0.9rem;
  font-weight: 500;
  color: var(--text-em);
}
.session-card__meta {
  font-size: 0.75rem;
  color: var(--text-de);
}
.session-card__actions {
  display: flex;
  gap: 8px;
  flex-shrink: 0;
}
.session-card__open-btn {
  padding: 5px 12px;
  background: var(--accent);
  color: #fdf6e3;
  border: none;
  border-radius: 5px;
  font-size: 0.8rem;
  font-weight: 500;
  cursor: pointer;
}
.session-card__open-btn:hover { background: var(--accent-2); }
.session-card__delete-btn {
  padding: 5px 8px;
  background: transparent;
  color: var(--text-de);
  border: 1px solid var(--border);
  border-radius: 5px;
  font-size: 0.8rem;
  cursor: pointer;
}
.session-card__delete-btn:hover { color: var(--danger); border-color: var(--danger); }
</style>
