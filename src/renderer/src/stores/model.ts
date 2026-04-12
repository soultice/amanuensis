import { defineStore } from 'pinia'
import type { ModelState } from '../env.d'

export const useModelStore = defineStore('model', {
  state: () => ({
    state: 'checking' as ModelState,
    progress: 0,
    error: null as string | null
  }),
  getters: {
    isReady: (s): boolean => s.state === 'present',
    isDownloading: (s): boolean => s.state === 'downloading'
  },
  actions: {
    async refresh(): Promise<void> {
      const status = await window.api.getModelStatus()
      this.state = status.state
      this.progress = status.progress ?? 0
      this.error = status.error ?? null
    },
    async startDownload(): Promise<void> {
      this.state = 'downloading'
      this.progress = 0

      // Subscribe to progress events
      const cleanup = window.api.onModelProgress((p) => {
        this.progress = p
        if (p >= 100) {
          this.state = 'present'
          cleanup()
        }
      })

      try {
        await window.api.downloadModel()
      } catch (err) {
        this.state = 'error'
        this.error = String(err)
        cleanup()
      }
    }
  }
})
