import { defineConfig } from '@playwright/test'

// The app is served under the Pages base path, so the preview URL includes /ScanNTune/.
export default defineConfig({
  testDir: './e2e',
  timeout: 120000,
  use: { baseURL: 'http://localhost:4173/ScanNTune/' },
  webServer: {
    command: 'npm run build && npm run preview -- --port 4173 --strictPort',
    url: 'http://localhost:4173/ScanNTune/',
    reuseExistingServer: !process.env.CI,
    timeout: 240000,
  },
})
