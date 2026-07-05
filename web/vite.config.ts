import { readFileSync } from 'node:fs'
import { defineConfig } from 'vitest/config'
import vue from '@vitejs/plugin-vue'
import vuetify from 'vite-plugin-vuetify'

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf-8'))

// The site is served at the root of the custom domain (https://scanntune.jaak0b.at/), so assets live at
// the root. (GitHub Pages 301-redirects https://<user>.github.io/ScanNTune/ to the custom domain root.)
export default defineConfig({
  base: '/',
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
