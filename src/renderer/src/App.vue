<template>
  <div id="app-root">
    <!-- Model not ready: onboarding/download -->
    <OnboardingView v-if="!modelStore.isReady" />

    <!-- Model ready, no active session: session list -->
    <SessionListView
      v-else-if="!sessionStore.currentSessionId"
      @open="handleOpenSession"
    />

    <!-- Model ready, session active: editor -->
    <AppShellView v-else />

    <SidecarErrorDialog
      v-if="sidecarStore.status === 'error' && sidecarStore.error"
      :error="sidecarStore.error!"
    />
  </div>
</template>

<script setup lang="ts">
import { onMounted, watch } from 'vue'
import { useSidecarStore } from './stores/sidecar'
import { useModelStore } from './stores/model'
import { useSessionStore } from './stores/session'
import { useThemeStore } from './stores/theme'
import OnboardingView from './views/OnboardingView.vue'
import SessionListView from './views/SessionListView.vue'
import AppShellView from './views/AppShellView.vue'
import SidecarErrorDialog from './components/SidecarErrorDialog.vue'

const sidecarStore = useSidecarStore()
const modelStore = useModelStore()
const sessionStore = useSessionStore()
const themeStore = useThemeStore()

onMounted(async () => {
  themeStore.init()                   // Phase 9: apply saved theme on startup
  await sidecarStore.initialize()
  await modelStore.refresh()
  sessionStore.registerSaveOnClose()
})

// When model becomes ready, handle first-launch auto-create
watch(
  () => modelStore.isReady,
  async (ready) => {
    if (!ready) return
    const sessions = await sessionStore.listSessions()
    if (sessions.length === 0) {
      // First launch: skip list, drop into a new session
      const id = await sessionStore.createSession()
      await sessionStore.openSession(id)
    }
  }
)

// Re-check model status when sidecar finishes starting
watch(
  () => sidecarStore.status,
  async (status) => {
    if (status === 'ready') await modelStore.refresh()
  }
)

async function handleOpenSession(id: string): Promise<void> {
  await sessionStore.openSession(id)
}
</script>

<style>
#app-root {
  height: 100%;
  display: contents;
}
</style>
