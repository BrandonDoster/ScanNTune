import { test, expect } from '@playwright/test'

// Phase-A smoke test for the input shaper flow: no scan analysis exists yet, so this only
// covers profile-driven G-code generation (settings resolution, bed fitting, download).

test.beforeEach(async ({ page }) => {
  page.on('console', (msg) => console.log(`[browser:${msg.type()}]`, msg.text()))
  page.on('pageerror', (e) => console.log('[pageerror]', e.message))
  await page.addInitScript(() => localStorage.clear())
})

async function openIsPageWithProfile(
  page: import('@playwright/test').Page,
  opts?: { bedWidthMm?: number; bedDepthMm?: number },
) {
  await page.goto('/')
  await page.getByTestId('nav-is').click()
  await expect(page.getByRole('heading', { name: 'Input shaper calibration' })).toBeVisible()

  // Create a printer profile through the profile page (defaults are valid: Klipper firmware,
  // 220x220 bed, a default filament already attached). Saving returns to the flow page with
  // the new profile selected.
  await page.getByTestId('profile-new').click()
  await expect(page.getByTestId('profile-page')).toBeVisible()
  await page.getByLabel('Profile name').fill('E2E Printer')
  if (opts?.bedWidthMm !== undefined) {
    await page.getByLabel('Bed width (mm)').fill(String(opts.bedWidthMm))
  }
  if (opts?.bedDepthMm !== undefined) {
    await page.getByLabel('Bed depth (mm)').fill(String(opts.bedDepthMm))
  }
  await page.getByTestId('profile-save').click()
  await expect(page.getByRole('heading', { name: 'Input shaper calibration' })).toBeVisible()
}

test('input shaper: settings resolve speed tiers and a coupon footprint', async ({ page }) => {
  await openIsPageWithProfile(page)

  await expect(page.getByTestId('is-tiers')).toBeVisible()
  await expect(page.getByTestId('is-tiers')).toContainText('mm/s')
  await expect(page.getByTestId('is-footprint')).toBeVisible()
  await expect(page.getByTestId('is-footprint')).toContainText('coupon')
  await expect(page.getByTestId('is-fit-error')).toHaveCount(0)
})

test('input shaper: generate downloads a Klipper resonance test coupon', async ({ page }) => {
  await openIsPageWithProfile(page)

  const downloadPromise = page.waitForEvent('download')
  await page.getByTestId('is-generate').click()
  const download = await downloadPromise

  expect(download.suggestedFilename()).toMatch(/^is_resonance_test_.*\.gcode$/)

  const streamPath = await download.path()
  expect(streamPath).toBeTruthy()
  const fs = await import('node:fs/promises')
  const content = await fs.readFile(streamPath!, 'utf-8')
  expect(content).toContain('; ScanNTune input shaper resonance test')
  expect(content).toContain('SET_INPUT_SHAPER SHAPER_FREQ_X=0')

  await expect(page.getByTestId('is-generate-error')).toHaveCount(0)
})

test('input shaper: a small bed shows fit notes and drops the fastest speed tier', async ({
  page,
}) => {
  await openIsPageWithProfile(page, { bedWidthMm: 80, bedDepthMm: 80 })

  await expect(page.getByTestId('is-fit-notes')).toBeVisible()
  const tiers = await page.getByTestId('is-tiers').innerText()
  expect(tiers).not.toContain('300')
})
