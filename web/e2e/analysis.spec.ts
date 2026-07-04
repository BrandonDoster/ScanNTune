import { test, expect } from '@playwright/test'
import { fileURLToPath } from 'node:url'

// Real-world end-to-end tests over the user's actual scans. This is the regression test for the bug
// that motivated the rewrite: analysis must complete in the browser without freezing.
const card = fileURLToPath(new URL('./fixtures/card.png', import.meta.url))
const scan0 = fileURLToPath(new URL('./fixtures/scan1-0.png', import.meta.url))
const scan90 = fileURLToPath(new URL('./fixtures/scan1-90.png', import.meta.url))

test.beforeEach(async ({ page }) => {
  // Surface browser + worker logs and errors in the test output for debugging.
  page.on('console', (msg) => console.log(`[browser:${msg.type()}]`, msg.text()))
  page.on('pageerror', (e) => console.log('[pageerror]', e.message))
  await page.addInitScript(() => localStorage.clear())
})

test('the app loads', async ({ page }) => {
  await page.goto('/ScanNTune/')
  await expect(page.getByRole('heading', { name: 'ScanNTune' })).toBeVisible()
})

test('calibration flow recovers ~23.6 px/mm from the real card scan', async ({ page }) => {
  await page.goto('/ScanNTune/')
  await page.getByTestId('calibrate-btn').click()
  await page.getByTestId('card-input').setInputFiles(card)

  await expect(page.getByTestId('calibration-result')).toBeVisible({ timeout: 120000 })
  const pxPerMmText = await page.getByTestId('pxpermm').innerText()
  const pxPerMm = parseFloat(pxPerMmText)
  console.log('card px/mm =', pxPerMm)
  expect(pxPerMm).toBeGreaterThan(23.3)
  expect(pxPerMm).toBeLessThan(23.9)
  await expect(page.getByTestId('saved')).toBeVisible()
})

test('two-scan analysis completes on real scans without freezing', async ({ page }) => {
  await page.goto('/ScanNTune/')
  await page.getByTestId('scan1-input').setInputFiles(scan0)
  await page.getByTestId('scan2-input').setInputFiles(scan90)

  await expect(page.getByTestId('analyze-btn')).toBeEnabled({ timeout: 60000 })
  await page.getByTestId('analyze-btn').click()

  // The results page appearing at all is the core assertion: the pipeline ran off the main thread
  // and returned, rather than hanging.
  await expect(page.getByTestId('x-scale')).toBeVisible({ timeout: 120000 })

  const x = await page.getByTestId('x-scale').innerText()
  const y = await page.getByTestId('y-scale').innerText()
  const skew = await page.getByTestId('skew').innerText()
  const summary = await page.getByTestId('summary').innerText()
  console.log('results:', { x, y, skew, summary })

  const xVal = parseFloat(x)
  const yVal = parseFloat(y)
  const skewVal = parseFloat(skew)

  // The scans are analyzed without calibration at the default 1200 dpi, but were made at ~600 dpi, so
  // the ABSOLUTE scale reads about -50% (correct: half the assumed resolution). The DPI-independent
  // quantities are the meaningful ones: a real print is near-isotropic with tiny skew, the full ring
  // grid resolves, and the two scans are a quarter-turn apart.
  expect(summary).toMatch(/23 rings/)
  const turn = parseFloat(summary.match(/(\d+)° turn/)![1])
  expect([90, 270].some((t) => Math.abs(turn - t) <= 5)).toBe(true)
  expect(Math.abs(xVal - yVal)).toBeLessThan(1.0)
  expect(Math.abs(skewVal)).toBeLessThan(2.0)
})
