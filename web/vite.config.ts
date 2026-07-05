import { readFileSync } from 'node:fs'
import { defineConfig } from 'vitest/config'
import vue from '@vitejs/plugin-vue'
import vuetify from 'vite-plugin-vuetify'

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf-8'))

// base must match the GitHub Pages project path (https://<user>.github.io/ScanNTune/).
export default defineConfig({
  base: '/ScanNTune/',
  define: { __APP_VERSION__: JSON.stringify(pkg.version) },
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
