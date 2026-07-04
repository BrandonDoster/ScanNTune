import { defineConfig } from 'vitest/config'
import vue from '@vitejs/plugin-vue'
import vuetify from 'vite-plugin-vuetify'

// base must match the GitHub Pages project path (https://<user>.github.io/ScanNTune/).
export default defineConfig({
  base: '/ScanNTune/',
  plugins: [vue(), vuetify({ autoImport: true })],
  // The CV engine runs in a module Web Worker; ship it as ESM so imports resolve.
  worker: { format: 'es' },
  test: {
    environment: 'happy-dom',
    include: ['tests/**/*.spec.ts'],
    // OpenCV.js is a large wasm module; give the fixture-backed engine tests room.
    testTimeout: 30000,
  },
})
