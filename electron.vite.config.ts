import { resolve } from 'path'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import vue from '@vitejs/plugin-vue'

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()]
  },
  preload: {
    plugins: [externalizeDepsPlugin()]
  },
  renderer: {
    resolve: {
      alias: {
        '@renderer': resolve('src/renderer/src')
      }
    },
    plugins: [vue()],
    optimizeDeps: {
      // Exclude packages that try to use Node builtins in browser context
      exclude: ['worker_threads']
    },
    build: {
      rollupOptions: {
        external: ['worker_threads']
      }
    }
  }
})
