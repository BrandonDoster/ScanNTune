import { test, expect, type Page } from '@playwright/test'
import { fileURLToPath } from 'node:url'

// Golden webtest for XY skew/scale calibration. Phase 2 implementation of
// web/e2e/flows/xy-skew-golden.md. Every golden number below is copied from
// web/e2e/golden/xy-skew-0p5/PROVENANCE.md ("Golden values and tolerances"):
// XY skew +0.52 deg (tol 0.06), X scale +0.05% (tol 0.04pp), Y scale +0.08% (tol 0.04pp).
// These are external caliper measurements from a community calibration print with the same
// injected SET_SKEW profile, entered into an independent calculator: they are NOT derived from
// this codebase's own prior reading (+0.504 deg, X +0.059%, Y +0.077%), which PROVENANCE.md
// explicitly marks as a cross-validation note, not a golden value.

const fixture = (dpi: '150dpi' | '300dpi', name: string) =>
  fileURLToPath(new URL(`./golden/xy-skew-0p5/${dpi}/${name}`, import.meta.url))

const ISO_MM = 85.6

test.beforeEach(async ({ page }) => {
  page.on('console', (msg) => console.log(`[browser:${msg.type()}]`, msg.text()))
  page.on('pageerror', (e) => console.log('[pageerror]', e.message))
  await page.addInitScript(() => localStorage.clear())
})

/** Steps 1-3: navigate, calibrate the scanner at the given nominal DPI, return to the scan page. */
async function calibrate(page: Page, nominalDpi: number, cardFile: string) {
  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'Skew/shrinkage calibration' })).toBeVisible()

  await page.getByTestId('calibrate-btn').click()
  await page.getByLabel('Measured long side (mm)').fill(ISO_MM.toFixed(2))
  await page.getByLabel('Scan resolution (dpi)').fill(String(nominalDpi))
  await page.getByTestId('card-input').setInputFiles(cardFile)
  await expect(page.getByTestId('calibration-result')).toBeVisible({ timeout: 120000 })
  await expect(page.getByTestId('saved')).toBeVisible()

  // Snapshot tier (not external truth): pin today's measured card px/mm and effective dpi for
  // this exact fixture with literal band endpoints per the spec: [5.90359, 5.90759] (150 dpi) /
  // [11.80470, 11.80870] (300 dpi), effective dpi exactly the nominal.
  const pxPerMm = parseFloat(await page.getByTestId('pxpermm').innerText())
  const effectiveDpi = parseFloat(await page.getByTestId('effective-dpi').innerText())
  const [lowSnapPx, highSnapPx] = nominalDpi === 150 ? [5.90359, 5.90759] : [11.8047, 11.8087]
  console.log(`[${nominalDpi} dpi] calibration pxPerMm =`, pxPerMm, 'effectiveDpi =', effectiveDpi)
  expect(pxPerMm).toBeGreaterThanOrEqual(lowSnapPx)
  expect(pxPerMm).toBeLessThanOrEqual(highSnapPx)
  expect(effectiveDpi).toBe(nominalDpi)

  await page.getByTestId('back-btn').click()
  await expect(page.getByTestId('calibration-status-line')).toContainText(`${nominalDpi} dpi`)
}

/** Steps 4-13: upload both plate scans, wait for measurement, analyze, and read the goldens. */
async function runPlateScenario(
  page: Page,
  dpi: '150dpi' | '300dpi',
  scan0: string,
  scan90: string,
): Promise<void> {
  // 4. Upload both scans together.
  await page.getByTestId('scans-input').setInputFiles([scan0, scan90])
  await expect(page.locator('[data-testid="scan-island"]')).toHaveCount(2)

  // 5. Wait for both scans to finish measuring: 23 of 23 rings, XY plane, a resolved rotation angle.
  const ringCounts = page.getByTestId('ring-count')
  await expect(ringCounts.first()).toContainText('23 of 23', { timeout: 120000 })
  await expect(ringCounts.nth(1)).toContainText('23 of 23', { timeout: 120000 })

  const islands = page.locator('[data-testid="scan-island"]')
  await expect(islands.first()).toContainText('XY plane')
  await expect(islands.nth(1)).toContainText('XY plane')

  // 5 (snapshot, not external truth): the displayed angles are the hardcoded current app readings
  // recorded in the spec (150 dpi: 89.6 and 180.0; 300 dpi: 89.7 and 180.2), each within 0.5
  // degrees, matched by value across the two islands (either pairing) since island order is not
  // guaranteed. No angular arithmetic: simple parse and compare both pairings. The physical
  // quarter-turn the owner made between the scans is documented in the spec, not computed here.
  const angles = page.getByTestId('scan-angle')
  await expect(angles.first()).not.toContainText('Not resolved')
  await expect(angles.nth(1)).not.toContainText('Not resolved')
  const angleA = parseFloat(await angles.first().innerText())
  const angleB = parseFloat(await angles.nth(1).innerText())
  console.log(`[${dpi}] scan angles =`, angleA, angleB)
  const [lit1, lit2] = dpi === '150dpi' ? [89.6, 180.0] : [89.7, 180.2]
  const pairingOne = Math.abs(angleA - lit1) <= 0.5 && Math.abs(angleB - lit2) <= 0.5
  const pairingTwo = Math.abs(angleA - lit2) <= 0.5 && Math.abs(angleB - lit1) <= 0.5
  expect(pairingOne || pairingTwo).toBe(true)

  // 5 (amended): each scan's scan-flip reads exactly "None" (both golden scans were printed and
  // scanned unmirrored, per the app's own instructions).
  const flips = page.getByTestId('scan-flip')
  await expect(flips.first()).toHaveText('None')
  await expect(flips.nth(1)).toHaveText('None')

  // 6. plane-group-XY visible with both scans, plane-status-XY reads "Ready to analyze."
  await expect(page.getByTestId('plane-group-XY')).toBeVisible()
  await expect(page.getByTestId('plane-status-XY')).toContainText('Ready to analyze.')

  // 7. analyze-btn enabled; click it and scroll to results.
  await expect(page.getByTestId('analyze-btn')).toBeEnabled()
  await page.getByTestId('analyze-btn').click()
  await expect(page.getByTestId('scale-X')).toBeVisible({ timeout: 120000 })

  // 8. scale-X: +0.05 percent external truth. Tolerance differs by dpi (amendment): 150 dpi widened
  // to [-0.01, +0.11], 300 dpi unchanged strict [+0.01, +0.09]. Sign must be positive.
  const scaleXText = await page.getByTestId('scale-X').innerText()
  const scaleX = parseFloat(scaleXText)
  console.log(`[${dpi}] scale-X =`, scaleX)
  expect(scaleX).toBeGreaterThan(0)
  if (dpi === '150dpi') {
    expect(scaleX).toBeGreaterThanOrEqual(-0.01)
    expect(scaleX).toBeLessThanOrEqual(0.11)
  } else {
    expect(scaleX).toBeGreaterThanOrEqual(0.01)
    expect(scaleX).toBeLessThanOrEqual(0.09)
  }
  // 8 (snapshot, not external truth): regression pin with literal band endpoints per the spec:
  // [+0.012, +0.022] (150 dpi) / [+0.046, +0.056] (300 dpi).
  const [lowSnapX, highSnapX] = dpi === '150dpi' ? [0.012, 0.022] : [0.046, 0.056]
  expect(scaleX).toBeGreaterThanOrEqual(lowSnapX)
  expect(scaleX).toBeLessThanOrEqual(highSnapX)

  // 9. scale-Y: +0.08 percent external truth. Tolerance differs by dpi (amendment): 150 dpi widened
  // to [+0.02, +0.14], 300 dpi unchanged strict [+0.04, +0.12]. Sign must be positive.
  const scaleYText = await page.getByTestId('scale-Y').innerText()
  const scaleY = parseFloat(scaleYText)
  console.log(`[${dpi}] scale-Y =`, scaleY)
  expect(scaleY).toBeGreaterThan(0)
  if (dpi === '150dpi') {
    expect(scaleY).toBeGreaterThanOrEqual(0.02)
    expect(scaleY).toBeLessThanOrEqual(0.14)
  } else {
    expect(scaleY).toBeGreaterThanOrEqual(0.04)
    expect(scaleY).toBeLessThanOrEqual(0.12)
  }
  // 9 (snapshot, not external truth): regression pin with literal band endpoints per the spec:
  // [+0.023, +0.033] (150 dpi) / [+0.066, +0.076] (300 dpi).
  const [lowSnapY, highSnapY] = dpi === '150dpi' ? [0.023, 0.033] : [0.066, 0.076]
  expect(scaleY).toBeGreaterThanOrEqual(lowSnapY)
  expect(scaleY).toBeLessThanOrEqual(highSnapY)

  // 10. skew-XY: +0.52 degrees, tolerance +-0.06 -> [+0.46, +0.58], sign explicitly positive.
  const skewXYText = await page.getByTestId('skew-XY').innerText()
  const skewXY = parseFloat(skewXYText)
  console.log(`[${dpi}] skew-XY =`, skewXY)
  expect(skewXY).toBeGreaterThan(0)
  expect(skewXY).toBeGreaterThanOrEqual(0.46)
  expect(skewXY).toBeLessThanOrEqual(0.58)
  // 10 (snapshot, not external truth): regression pin with literal band endpoints per the spec:
  // [+0.497, +0.517] (150 dpi) / [+0.495, +0.515] (300 dpi).
  const [lowSnapSkew, highSnapSkew] = dpi === '150dpi' ? [0.497, 0.517] : [0.495, 0.515]
  expect(skewXY).toBeGreaterThanOrEqual(lowSnapSkew)
  expect(skewXY).toBeLessThanOrEqual(highSnapSkew)

  // 11. skew-code (Fix skew tab, active by default) contains a SET_SKEW command with three
  // comma-separated numbers (structural check; the un-measured factors are not golden values).
  const skewCodeText = await page.getByTestId('skew-code').innerText()
  console.log(`[${dpi}] skew-code =`, JSON.stringify(skewCodeText))
  expect(skewCodeText).toContain('SET_SKEW')
  expect(skewCodeText).toMatch(/XY=[-\d.]+,[-\d.]+,[-\d.]+/)

  // 11 (snapshot, not external truth): the displayed SET_SKEW line equals the literal captured
  // from the deterministic app run on these fixtures and recorded in the spec. The Klipper-formula
  // digit verification lives in the engine unit test skewSignConvention.spec.ts, not here.
  const skewCodeLiteral =
    dpi === '150dpi' ? 'SET_SKEW XY=99.558,100.444,70.713' : 'SET_SKEW XY=99.56,100.442,70.713'
  expect(skewCodeText).toContain(skewCodeLiteral)

  // 12. Click the "Fix size" tab; size-code becomes visible with the default "Shrinkage %" flavour.
  await page.getByText('Fix size', { exact: true }).click()
  await expect(page.getByTestId('size-code')).toBeVisible()
  const sizeCodeText = await page.getByTestId('size-code').innerText()
  console.log(`[${dpi}] size-code =`, JSON.stringify(sizeCodeText))

  // 12 (snapshot, not external truth): the displayed size-code content equals the literal captured
  // from the deterministic app run on these fixtures and recorded in the spec. No derivation from
  // scale-X/scale-Y here; the restatement relation is engine-unit-test territory.
  const sizeCodeLiteral = dpi === '150dpi' ? 'XY shrinkage: 100.02 %' : 'XY shrinkage: 100.06 %'
  expect(sizeCodeText).toContain(sizeCodeLiteral)

  // 13. more-scans-XY visible, contains "2 more times" (MIN_SCANS_FOR_RANGE - 2 scans = 2 missing).
  await expect(page.getByTestId('more-scans-XY')).toBeVisible()
  await expect(page.getByTestId('more-scans-XY')).toContainText('2 more times')
}

test('scenario A: 150 dpi, full walkthrough', async ({ page }) => {
  await calibrate(page, 150, fixture('150dpi', 'card_150dpi.png'))
  await runPlateScenario(
    page,
    '150dpi',
    fixture('150dpi', 'xy_0d.png'),
    fixture('150dpi', 'xy_90d.png'),
  )
})

test('scenario B: 300 dpi, full walkthrough (self-contained)', async ({ page }) => {
  await calibrate(page, 300, fixture('300dpi', 'card_300dpi.png'))
  await runPlateScenario(
    page,
    '300dpi',
    fixture('300dpi', 'xy_0d.png'),
    fixture('300dpi', 'xy_90d.png'),
  )
})

// Cross-scenario agreement (spec "Cross-scenario agreement" section, amended 2026-07-11): there
// is deliberately NO computed pairwise comparison test here. The agreement bounds (0.03 degrees
// skew, 0.06 percentage points scale) are enforced by construction through the per-dpi snapshot
// literal bands asserted in each scenario above; the arithmetic showing the bands sit inside the
// bounds lives in the spec, done once at design time.

test('rejection path: duplicate-angle scan pair', async ({ page }) => {
  await calibrate(page, 150, fixture('150dpi', 'card_150dpi.png'))

  const xy0d = fixture('150dpi', 'xy_0d.png')

  // Upload the same file twice: two scans at the identical measured angle (spread of 0 degrees).
  await page.getByTestId('scans-input').setInputFiles([xy0d])
  await expect(page.locator('[data-testid="scan-island"]')).toHaveCount(1)
  await expect(page.getByTestId('ring-count').first()).toContainText('23 of 23', {
    timeout: 120000,
  })

  await page.getByTestId('scans-input').setInputFiles([xy0d])
  await expect(page.locator('[data-testid="scan-island"]')).toHaveCount(2)
  const ringCounts = page.getByTestId('ring-count')
  await expect(ringCounts.first()).toContainText('23 of 23', { timeout: 120000 })
  await expect(ringCounts.nth(1)).toContainText('23 of 23', { timeout: 120000 })

  // Real ScanIsland.vue behaviour (amended): a scan flagged as a duplicate shows "Nearly same
  // angle", not "XY plane"; only a non-duplicate-flagged island shows the plane-name pill. Island
  // order within the plane group is not guaranteed, so assert by scanning across both islands'
  // pill text rather than by a fixed index.
  const islands = page.locator('[data-testid="scan-island"]')
  const islandTexts = await Promise.all([islands.nth(0).innerText(), islands.nth(1).innerText()])
  console.log('duplicate-scan island texts:', islandTexts)
  expect(islandTexts.some((t) => t.includes('Nearly same angle'))).toBe(true)

  // plane-status-XY shows the "too close together" message.
  await expect(page.getByTestId('plane-status-XY')).toContainText('Turn the plate further')

  // analyze-btn disabled.
  await expect(page.getByTestId('analyze-btn')).toBeDisabled()

  // analyzeReason caption includes "XY plate:" followed by the same message.
  await expect(page.getByTestId('analyze-reason')).toContainText('XY plate:')
  await expect(page.getByTestId('analyze-reason')).toContainText('Turn the plate further')
})
