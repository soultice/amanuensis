<template>
  <div class="session-list-view">
    <header class="session-list-view__header">
      <h1 class="session-list-view__title">Amanuensis</h1>
      <button class="session-list-view__new-btn" @click="handleNew">
        + New Session
      </button>
    </header>

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
import { ref, onMounted } from 'vue'
import { useSessionStore } from '../stores/session'
import type { SessionMeta } from '../stores/session'

const sessionStore = useSessionStore()
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
  background: #f9fafb;
}
.session-list-view__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 24px;
  height: 56px;
  background: white;
  border-bottom: 1px solid #e5e7eb;
  flex-shrink: 0;
}
.session-list-view__title {
  font-size: 1rem;
  font-weight: 600;
  color: #111827;
  margin: 0;
}
.session-list-view__new-btn {
  padding: 7px 14px;
  background: #1a56db;
  color: white;
  border: none;
  border-radius: 6px;
  font-size: 0.85rem;
  font-weight: 500;
  cursor: pointer;
}
.session-list-view__new-btn:hover { background: #1345b7; }
.session-list-view__body {
  flex: 1;
  overflow-y: auto;
  padding: 24px;
  max-width: 720px;
  width: 100%;
  margin: 0 auto;
}
.session-list-view__hint {
  color: #6b7280;
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
  background: white;
  border: 1px solid #e5e7eb;
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
  color: #111827;
}
.session-card__meta {
  font-size: 0.75rem;
  color: #6b7280;
}
.session-card__actions {
  display: flex;
  gap: 8px;
  flex-shrink: 0;
}
.session-card__open-btn {
  padding: 5px 12px;
  background: #1a56db;
  color: white;
  border: none;
  border-radius: 5px;
  font-size: 0.8rem;
  font-weight: 500;
  cursor: pointer;
}
.session-card__open-btn:hover { background: #1345b7; }
.session-card__delete-btn {
  padding: 5px 8px;
  background: transparent;
  color: #9ca3af;
  border: 1px solid #e5e7eb;
  border-radius: 5px;
  font-size: 0.8rem;
  cursor: pointer;
}
.session-card__delete-btn:hover { color: #dc2626; border-color: #dc2626; }
</style>
