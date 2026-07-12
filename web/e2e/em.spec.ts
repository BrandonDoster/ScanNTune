import { test, expect } from '@playwright/test'
import { fileURLToPath } from 'node:url'
import type { ScannerCalibration } from '../src/engine/types'

// End-to-end flow (extrusion multiplier) tests. The synthetic scan is rendered by the emRender
// helper at 24 px/mm with a ground-truth bead width of 0.42 mm; the real scan is a 600 dpi
// flatbed scan of a printed coupon (default spec, calibrated scanner at 23.622 px/mm).
const emSynthetic = fileURLToPath(new URL('./fixtures/em_synthetic.png', import.meta.url))
const emReal = fileURLToPath(new URL('./fixtures/em_real_scan.png', import.meta.url))

// Stored scanner calibrations matching the fixtures (fields per useCalibration and
// isUsableCalibration). The synthetic render is exactly 24 px/mm; the real scanner resolves
// 23.622 px/mm at its 600 dpi setting.
const syntheticCalibration: ScannerCalibration = {
  pxPerMm: 24,
  dpi: 609.6,
  referenceMm: 85.6,
  measuredWidthPx: 2054.4,
  straightnessPx: 0.1,
  parallelismDegrees: 0.02,
  calibratedUtc: '2026-07-01T00:00:00.000Z',
}
const realCalibration: ScannerCalibration = {
  pxPerMm: 23.622,
  dpi: 600,
  referenceMm: 85.6,
  measuredWidthPx: 2022.0,
  straightnessPx: 0.1,
  parallelismDegrees: 0.02,
  calibratedUtc: '2026-07-01T00:00:00.000Z',
}

test.beforeEach(async ({ page }) => {
  page.on('console', (msg) => console.log(`[browser:${msg.type()}]`, msg.text()))
  page.on('pageerror', (e) => console.log('[pageerror]', e.message))
  await page.addInitScript(() => localStorage.clear())
})

async function seedCalibration(page: import('@playwright/test').Page, cal: ScannerCalibration) {
  await page.addInitScript(
    (value) => localStorage.setItem('scanntune.calibration', value),
    JSON.stringify(cal),
  )
}

async function openEmPageWithProfile(page: import('@playwright/test').Page) {
  await page.goto('/')
  await page.getByTestId('nav-em').click()
  await expect(page.getByRole('heading', { name: 'Flow calibration' })).toBeVisible()

  // Create a printer profile through the profile page (defaults are valid; only the name is
  // needed). Saving returns to the flow page with the new profile selected.
  await page.getByTestId('profile-new').click()
  await expect(page.getByTestId('profile-page')).toBeVisible()
  await page.getByLabel('Profile name').fill('E2E Printer')
  await page.getByTestId('profile-save').click()
  await expect(page.getByRole('heading', { name: 'Flow calibration' })).toBeVisible()
}

test('flow calibration: synthetic scan recovers the ground-truth width', async ({ page }) => {
  await seedCalibration(page, syntheticCalibration)
  await openEmPageWithProfile(page)

  await page.getByTestId('em-scan-input').setInputFiles(emSynthetic)
  await expect(page.getByTestId('em-width')).toBeVisible({ timeout: 120000 })
  await expect(page.getByTestId('em-scan-error')).toHaveCount(0)
  await expect(page.getByTestId('em-failure')).toHaveCount(0)

  const width = parseFloat(await page.getByTestId('em-width').innerText())
  console.log('measured width (synthetic) =', width)
  expect(Math.abs(width - 0.42)).toBeLessThan(0.01)
  await expect(page.getByTestId('em-flow')).toBeVisible()
})

test('flow calibration: real flatbed scan analyzes to a plausible width', async ({ page }) => {
  await seedCalibration(page, realCalibration)
  await openEmPageWithProfile(page)

  await page.getByTestId('em-scan-input').setInputFiles(emReal)
  await expect(page.getByTestId('em-width')).toBeVisible({ timeout: 120000 })
  await expect(page.getByTestId('em-scan-error')).toHaveCount(0)
  await expect(page.getByTestId('em-failure')).toHaveCount(0)

  const width = parseFloat(await page.getByTestId('em-width').innerText())
  console.log('measured width (real scan) =', width)
  expect(width).toBeGreaterThanOrEqual(0.38)
  expect(width).toBeLessThanOrEqual(0.47)
  await expect(page.getByTestId('em-flow')).toBeVisible()

  const command = (await page.getByTestId('em-code').innerText()).trim()
  expect(command.length).toBeGreaterThan(0)
})

test('flow calibration: without a scanner calibration the scan input is disabled', async ({
  page,
}) => {
  await page.goto('/')
  await page.getByTestId('nav-em').click()
  await expect(page.getByRole('heading', { name: 'Flow calibration' })).toBeVisible()

  await expect(page.getByTestId('em-scan-input')).toBeDisabled()
  await expect(page.getByTestId('em-scan-needs-calibration')).toBeVisible()
})
