import vue from '@vitejs/plugin-vue'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  plugins: [vue()],
  test: {
    environment: 'jsdom',
    include: ['src/renderer/src/**/*.spec.ts'],
    exclude: ['node_modules', 'out', 'build', 'release', 'dist-sidecar', '.gsd'],
    passWithNoTests: false,
  },
})
