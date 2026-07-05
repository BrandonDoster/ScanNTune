import { test, expect } from '@playwright/test'
import { fileURLToPath } from 'node:url'

// Real-world end-to-end tests over the user's actual scans plus the rendered calibration plates. The
// core regression is the bug that motivated the rewrite: analysis must complete in the browser
// without freezing.
const card = fileURLToPath(new URL('./fixtures/card.png', import.meta.url))
const scan0 = fileURLToPath(new URL('./fixtures/scan1-0.png', import.meta.url))
const scan90 = fileURLToPath(new URL('./fixtures/scan1-90.png', import.meta.url))

const plate = (p: string, rot: number) =>
  fileURLToPath(new URL(`./fixtures/plate_${p}_${rot}.png`, import.meta.url))

test.beforeEach(async ({ page }) => {
  page.on('console', (msg) => console.log(`[browser:${msg.type()}]`, msg.text()))
  page.on('pageerror', (e) => console.log('[pageerror]', e.message))
  await page.addInitScript(() => localStorage.clear())
})

test('the app loads', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'Scan calibration' })).toBeVisible()
})

test('calibration flow recovers ~23.6 px/mm from the real card scan', async ({ page }) => {
  await page.goto('/')
  await page.getByTestId('calibrate-btn').click()
  await page.getByLabel('Measured long side (mm)').fill('85.5')
  await page.getByTestId('card-input').setInputFiles(card)

  await expect(page.getByTestId('calibration-result')).toBeVisible({ timeout: 120000 })
  const pxPerMm = parseFloat(await page.getByTestId('pxpermm').innerText())
  console.log('card px/mm =', pxPerMm)
  expect(pxPerMm).toBeGreaterThan(23.3)
  expect(pxPerMm).toBeLessThan(23.9)
  await expect(page.getByTestId('saved')).toBeVisible()
})

test('calibration recovers after uploading before entering the measurement', async ({ page }) => {
  await page.goto('/')
  await page.getByTestId('calibrate-btn').click()

  await page.getByTestId('card-input').setInputFiles(card)
  await expect(page.getByText('Enter your measured size')).toBeVisible()

  await page.getByLabel('Measured long side (mm)').fill('85.5')
  await expect(page.getByText('Enter your measured size')).toBeHidden()

  await page.getByTestId('card-input').setInputFiles(card)
  await expect(page.getByTestId('calibration-result')).toBeVisible({ timeout: 120000 })
  await expect(page.getByTestId('saved')).toBeVisible()
})

test('the original dot-less coupon is rejected, never silently treated as XY', async ({ page }) => {
  await page.goto('/')
  // The original coupon has no plane-ID dots. On real 35 MP scans the pipeline must complete without
  // freezing (the regression that motivated the rewrite) AND surface an error rather than guessing XY.
  await page.getByTestId('scans-input').setInputFiles([scan0, scan90])
  await expect(page.locator('.thumb')).toHaveCount(2)
  await expect(page.getByTestId('analyze-btn')).toBeEnabled({ timeout: 60000 })
  await page.getByTestId('analyze-btn').click()

  await expect(page.getByTestId('status')).toContainText('No plane could be analyzed', { timeout: 120000 })
  // Crucially: no silent XY result was produced.
  await expect(page.getByTestId('scale-X')).toHaveCount(0)
})

test('all three rendered plates auto-sort into X/Y/Z scale and skew', async ({ page }) => {
  await page.goto('/')
  // Drop in all six scans (two per plate, a quarter-turn apart); the app sorts them by plane-ID.
  await page
    .getByTestId('scans-input')
    .setInputFiles([
      plate('xy', 0),
      plate('xy', 90),
      plate('xz', 0),
      plate('xz', 90),
      plate('yz', 0),
      plate('yz', 90),
    ])
  // Wait for all six to finish loading before analyzing, so none are dropped.
  await expect(page.locator('.thumb')).toHaveCount(6)
  // Clear the DPI so scales are reported relative (anisotropy + skew), independent of the render size.
  await page.getByLabel('Scanner DPI').fill('')
  await expect(page.getByTestId('analyze-btn')).toBeEnabled()
  await page.getByTestId('analyze-btn').click()

  // Every physical axis and every plane skew must appear: the plates were auto-identified and combined.
  for (const axis of ['X', 'Y', 'Z']) {
    await expect(page.getByTestId(`scale-${axis}`)).toBeVisible({ timeout: 120000 })
  }
  for (const p of ['XY', 'XZ', 'YZ']) {
    await expect(page.getByTestId(`skew-${p}`)).toBeVisible()
    const skew = parseFloat(await page.getByTestId(`skew-${p}`).innerText())
    console.log(`${p} skew =`, skew)
    expect(Math.abs(skew)).toBeLessThan(0.5)
  }
})
