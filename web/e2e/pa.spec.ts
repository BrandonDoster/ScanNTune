import { test, expect } from '@playwright/test'
import { fileURLToPath } from 'node:url'

// End-to-end pressure advance flow over a synthetic scan rendered by
// tests/fixtures/make-pa-fixture.ts: ground truth PA 0.03, rotated 3 degrees, default noise.
// The default test range (0 to 0.06, 16 lines) puts the truth mid-sweep.
const paScan = fileURLToPath(new URL('./fixtures/pa_synthetic.png', import.meta.url))
// Same ground truth with the palette inverted: white lines on a black base, white scanner lid.
const paScanInverted = fileURLToPath(
  new URL('./fixtures/pa_synthetic_inverted.png', import.meta.url),
)
// A real 35 MP flatbed scan of a printed coupon (default spec, measured PA near 0.035).
const paScanReal = fileURLToPath(new URL('./fixtures/pa_real_scan.png', import.meta.url))

test.beforeEach(async ({ page }) => {
  page.on('console', (msg) => console.log(`[browser:${msg.type()}]`, msg.text()))
  page.on('pageerror', (e) => console.log('[pageerror]', e.message))
  await page.addInitScript(() => localStorage.clear())
})

test('pressure advance flow: profile, G-code download, scan analysis', async ({ page }) => {
  await page.goto('/')
  await page.getByTestId('nav-pa').click()
  await expect(page.getByRole('heading', { name: 'Pressure advance calibration' })).toBeVisible()

  // Create a printer profile through the profile page (defaults are valid; only the name is
  // needed). Saving returns to the PA page with the new profile selected.
  await page.getByTestId('profile-new').click()
  await expect(page.getByTestId('profile-page')).toBeVisible()
  await page.getByLabel('Profile name').fill('E2E Printer')
  await page.getByTestId('profile-save').click()
  await expect(page.getByRole('heading', { name: 'Pressure advance calibration' })).toBeVisible()
  await expect(page.getByTestId('generate-btn')).toBeEnabled()

  // The saved profile exposes its default filament in the filament select.
  await expect(page.getByTestId('pa-filament-select')).toBeVisible()
  await expect(page.getByTestId('pa-filament-select')).toContainText('Default')

  // Generating must fire a .gcode download.
  const downloadPromise = page.waitForEvent('download')
  await page.getByTestId('generate-btn').click()
  const download = await downloadPromise
  expect(download.suggestedFilename()).toMatch(/\.gcode$/)

  // Upload the synthetic scan and await the analysis result.
  await page.getByTestId('pa-scan-input').setInputFiles(paScan)
  await expect(page.getByTestId('pa-best')).toBeVisible({ timeout: 120000 })
  await expect(page.getByTestId('scan-error')).toHaveCount(0)

  const bestPa = parseFloat(await page.getByTestId('pa-best').innerText())
  console.log('best PA =', bestPa)
  expect(bestPa).toBeGreaterThan(0.026)
  expect(bestPa).toBeLessThan(0.034)

  // The Klipper command for the recovered value is shown.
  await expect(page.getByTestId('pa-code')).toContainText('SET_PRESSURE_ADVANCE')
  await expect(page.getByTestId('pa-code')).toContainText(bestPa.toFixed(4))
})

test('pressure advance scan analysis: white lines on a black base', async ({ page }) => {
  await page.goto('/')
  await page.getByTestId('nav-pa').click()
  await expect(page.getByRole('heading', { name: 'Pressure advance calibration' })).toBeVisible()

  await page.getByTestId('pa-scan-input').setInputFiles(paScanInverted)
  await expect(page.getByTestId('pa-best')).toBeVisible({ timeout: 120000 })
  await expect(page.getByTestId('scan-error')).toHaveCount(0)

  const bestPa = parseFloat(await page.getByTestId('pa-best').innerText())
  console.log('best PA (inverted palette) =', bestPa)
  expect(bestPa).toBeGreaterThan(0.026)
  expect(bestPa).toBeLessThan(0.034)
})

test('pressure advance scan analysis: real flatbed scan', async ({ page }) => {
  await page.goto('/')
  await page.getByTestId('nav-pa').click()
  await expect(page.getByRole('heading', { name: 'Pressure advance calibration' })).toBeVisible()

  await page.getByTestId('pa-scan-input').setInputFiles(paScanReal)
  // The 35 MP scan takes a few seconds in the worker, so the progress line must appear.
  await expect(page.getByTestId('pa-progress')).toBeVisible({ timeout: 60000 })
  await expect(page.getByTestId('pa-best')).toBeVisible({ timeout: 180000 })
  await expect(page.getByTestId('scan-error')).toHaveCount(0)
  await expect(page.getByTestId('pa-failure')).toHaveCount(0)

  const bestPa = parseFloat(await page.getByTestId('pa-best').innerText())
  console.log('best PA (real scan) =', bestPa)
  expect(Number.isFinite(bestPa)).toBe(true)
  // Regression bound: the value measured when the fixture was added, within one sweep
  // step of the default range (0.06 / 15 = 0.004).
  expect(Math.abs(bestPa - 0.0348)).toBeLessThan(0.004)
})
