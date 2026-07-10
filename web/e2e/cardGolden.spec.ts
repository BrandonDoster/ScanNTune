import { test, expect } from '@playwright/test'
import { fileURLToPath } from 'node:url'

// Golden webtest for scanner (card) calibration. Phase 2 implementation of
// web/e2e/flows/card-calibration-golden.md. Every golden number below is copied from
// web/e2e/golden/xy-skew-0p5/PROVENANCE.md ("Golden values and tolerances", "Card calibration" line):
// ISO/IEC 7810 ID-1 card, long side 85.60 mm, expected reported DPI within 2 percent of nominal.

const card150 = fileURLToPath(
  new URL('./golden/xy-skew-0p5/150dpi/card_150dpi.png', import.meta.url),
)
const card300 = fileURLToPath(
  new URL('./golden/xy-skew-0p5/300dpi/card_300dpi.png', import.meta.url),
)
const xy0d150 = fileURLToPath(new URL('./golden/xy-skew-0p5/150dpi/xy_0d.png', import.meta.url))

const ISO_MM = 85.6

test.beforeEach(async ({ page }) => {
  page.on('console', (msg) => console.log(`[browser:${msg.type()}]`, msg.text()))
  page.on('pageerror', (e) => console.log('[pageerror]', e.message))
  await page.addInitScript(() => localStorage.clear())
})

/** Runs the full card-calibration walkthrough (spec steps 1-11) for one DPI scenario. */
async function runScenario(
  page: import('@playwright/test').Page,
  nominalDpi: number,
  cardFile: string,
) {
  // 1. Navigate to the app root.
  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'Skew/shrinkage calibration' })).toBeVisible()

  // 2. Click calibrate-btn -> scanner calibration page.
  await page.getByTestId('calibrate-btn').click()
  await expect(page.getByLabel('Measured long side (mm)')).toBeVisible()
  await expect(page.getByLabel('Scan resolution (dpi)')).toBeVisible()
  await expect(page.getByTestId('back-btn')).toBeVisible()

  // 3. Fill measured long side with the ISO/IEC 7810 external truth.
  await page.getByLabel('Measured long side (mm)').fill(ISO_MM.toFixed(2))
  // No warning text under the field: the isoSanityWarn note must stay silent for 85.60 mm exactly.
  await expect(page.getByText('Double-check your measurement.')).toHaveCount(0)

  // 4. Fill DPI; the upload zone must become enabled (no "enter measurement/DPI first" caption).
  await page.getByLabel('Scan resolution (dpi)').fill(String(nominalDpi))
  await expect(
    page.getByText('Enter your measurement and a DPI of at least 50 first.'),
  ).toHaveCount(0)

  // 5. Upload the card scan through the real file input.
  await page.getByTestId('card-input').setInputFiles(cardFile)
  await expect(page.getByTestId('calibration-result')).toBeVisible({ timeout: 120000 })

  // 6. Read pxpermm. External truth: hardcoded literal band [5.7874, 6.0236] (150 dpi) /
  // [11.5748, 12.0472] (300 dpi) per the spec; the 2-percent-around-nominal derivation is
  // documented in the spec, not computed here.
  const pxPerMm = parseFloat(await page.getByTestId('pxpermm').innerText())
  const [lowPxPerMm, highPxPerMm] = nominalDpi === 150 ? [5.7874, 6.0236] : [11.5748, 12.0472]
  console.log(`[${nominalDpi} dpi] pxPerMm =`, pxPerMm, 'expected in', [lowPxPerMm, highPxPerMm])
  expect(pxPerMm).toBeGreaterThanOrEqual(lowPxPerMm)
  expect(pxPerMm).toBeLessThanOrEqual(highPxPerMm)

  // 6 (snapshot, not external truth): regression pin on today's measured px/mm for this exact
  // fixture: literal band [5.90359, 5.90759] (150 dpi) / [11.80470, 11.80870] (300 dpi) per the spec.
  const [lowSnapPx, highSnapPx] = nominalDpi === 150 ? [5.90359, 5.90759] : [11.8047, 11.8087]
  expect(pxPerMm).toBeGreaterThanOrEqual(lowSnapPx)
  expect(pxPerMm).toBeLessThanOrEqual(highSnapPx)

  // 7. The "effective dpi" tile is a redundant display of the same figure: assert it separately.
  // External truth: hardcoded literal band [147, 153] (150 dpi) / [294, 306] (300 dpi) per the spec.
  const effectiveDpi = parseFloat(await page.getByTestId('effective-dpi').innerText())
  console.log(`[${nominalDpi} dpi] effectiveDpi =`, effectiveDpi)
  const [lowDpi, highDpi] = nominalDpi === 150 ? [147, 153] : [294, 306]
  expect(effectiveDpi).toBeGreaterThanOrEqual(lowDpi)
  expect(effectiveDpi).toBeLessThanOrEqual(highDpi)

  // 7 (snapshot, not external truth): effective dpi displayed is exactly the nominal dpi.
  expect(effectiveDpi).toBe(nominalDpi)

  // 7 (snapshot, not external truth): the "vs nominal" tile equals the literal captured from the
  // deterministic app run on this fixture and recorded in the spec. No formula in the test; the
  // px/mm to "vs nominal" relation is engine-unit-test territory.
  const vsNominalLiteral = nominalDpi === 150 ? '+0.001 %' : '-0.037 %'
  const vsNominalText = (await page.getByTestId('vs-nominal').innerText()).trim()
  console.log(`[${nominalDpi} dpi] vs-nominal =`, JSON.stringify(vsNominalText))
  expect(vsNominalText).toContain(vsNominalLiteral)

  // 8. The "Detected NN.NN mm" text must show the "matches your 85.60 mm" branch (sizeCheckOk).
  await expect(page.getByText(`matches your ${ISO_MM.toFixed(2)} mm.`)).toBeVisible()

  // 8 (amended, new assertion): parse the "NN.NN" number out of "Detected NN.NN mm" and assert it
  // is within 0.30 mm of the 85.60 mm ISO/IEC 7810 truth, not just that the "matches" text rendered.
  const detectedText = await page.getByText(/^Detected \d+\.\d+ mm/).innerText()
  const detectedMatch = detectedText.match(/Detected ([\d.]+) mm/)
  expect(detectedMatch).not.toBeNull()
  const detectedMm = parseFloat(detectedMatch![1])
  console.log(`[${nominalDpi} dpi] detectedMm =`, detectedMm)
  expect(detectedMm).toBeGreaterThanOrEqual(85.3)
  expect(detectedMm).toBeLessThanOrEqual(85.9)

  // 9. saved testid visible with the persisted-calibration text.
  await expect(page.getByTestId('saved')).toBeVisible()
  await expect(page.getByTestId('saved')).toContainText('Saved, used for every scan')

  // 10. No error state: the card-error alert must not be showing.
  await expect(page.getByTestId('card-error')).toHaveCount(0)

  // 11. Back to the scan page: calibration persisted, status line shows "<nominalDpi> dpi".
  await page.getByTestId('back-btn').click()
  await expect(page.getByTestId('calibration-status-line')).toContainText(`${nominalDpi} dpi`)
}

test('scenario A: 150 dpi card calibration, full walkthrough', async ({ page }) => {
  await runScenario(page, 150, card150)
})

test('scenario B: 300 dpi card calibration, full walkthrough', async ({ page }) => {
  await runScenario(page, 300, card300)
})

test('rejection path: a non-card plate scan is rejected with card-error', async ({ page }) => {
  await page.goto('/')
  await page.getByTestId('calibrate-btn').click()
  await page.getByLabel('Measured long side (mm)').fill(ISO_MM.toFixed(2))
  await page.getByLabel('Scan resolution (dpi)').fill('150')

  // Upload a plate scan (not a card) as the card-input file.
  await page.getByTestId('card-input').setInputFiles(xy0d150)

  // calibration-result never appears; an error alert appears with non-empty text.
  await expect(page.getByTestId('calibration-result')).toHaveCount(0)
  await expect(page.getByTestId('card-error')).toBeVisible({ timeout: 120000 })
  const errorText = await page.getByTestId('card-error').innerText()
  expect(errorText.trim().length).toBeGreaterThan(0)
})
