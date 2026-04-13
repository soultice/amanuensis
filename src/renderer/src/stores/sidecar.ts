import { defineStore } from 'pinia'

export const useSidecarStore = defineStore('sidecar', {
  state: () => ({
    port: null as number | null,
    status: 'starting' as 'starting' | 'ready' | 'error',
    error: null as string | null
  }),
  actions: {
    async initialize(): Promise<void> {
      if (!window.api) {
        console.error('[sidecarStore] window.api not available — preload not loaded')
        this.status = 'error'
        this.error = 'Preload script did not load. Check Electron security settings.'
        return
      }
      this.port = await window.api.getSidecarPort()
      this.status = await window.api.getSidecarStatus()

      // Subscribe to future error events
      window.api.onSidecarError((err) => {
        this.status = 'error'
        this.error = err
      })
    }
  }
})
