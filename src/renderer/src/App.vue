<template>
  <div id="app-root">
    <OnboardingView v-if="!modelStore.isReady" />
    <AppShellView v-else />
    <SidecarErrorDialog
      v-if="sidecarStore.status === 'error' && sidecarStore.error"
      :error="sidecarStore.error!"
    />
  </div>
</template>

<script setup lang="ts">
import { onMounted } from 'vue'
import { useSidecarStore } from './stores/sidecar'
import { useModelStore } from './stores/model'
import OnboardingView from './views/OnboardingView.vue'
import AppShellView from './views/AppShellView.vue'
import SidecarErrorDialog from './components/SidecarErrorDialog.vue'

const sidecarStore = useSidecarStore()
const modelStore = useModelStore()

onMounted(async () => {
  await sidecarStore.initialize()
  await modelStore.refresh()
})
</script>

<style>
#app-root {
  height: 100%;
  display: contents;
}
</style>
