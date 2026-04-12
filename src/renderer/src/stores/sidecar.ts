import { defineStore } from 'pinia'

export const useSidecarStore = defineStore('sidecar', {
  state: () => ({
    port: null as number | null,
    status: 'starting' as 'starting' | 'ready' | 'error',
    error: null as string | null
  }),
  actions: {
    async initialize(): Promise<void> {
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
