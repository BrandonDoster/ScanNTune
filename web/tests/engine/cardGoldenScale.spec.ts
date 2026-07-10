// @vitest-environment node
import { fileURLToPath } from 'node:url'
import { describe, it, expect } from 'vitest'
import { getCv, decodePngFileBgr } from '../helpers/cv'
import { measureCard } from '../../src/engine/cardEdgeMeasurer'

// The same physical card scanned at 150 and 300 dpi on the same scanner must measure px/mm in an
// exact 1:2 proportion; any departure is a dpi-dependent localization bias of the edge measurer.
// These golden scans are tracked in the repo (unlike the wider Data/ corpus), so this pins the
// dpi invariance of the sub-pixel stage in CI. The 300 dpi scan is the one validated against an
// external caliper measurement of the card.

const LONG_MM = 85.6

const goldenDir = fileURLToPath(new URL('../../e2e/golden/xy-skew-0p5', import.meta.url))

function measure(cv: Awaited<ReturnType<typeof getCv>>, path: string, dpi: number) {
  const img = decodePngFileBgr(cv, path)
  try {
    const r = measureCard(cv, img, LONG_MM, dpi)
    expect(r.success).toBe(true)
    return r
  } finally {
    img.delete()
  }
}

describe('golden card scans measure dpi-proportionally', () => {
  it('150 and 300 dpi cards agree on px/mm in exact 1:2 ratio', async () => {
    const cv = await getCv()
    const r150 = measure(cv, `${goldenDir}/150dpi/card_150dpi.png`, 150)
    const r300 = measure(cv, `${goldenDir}/300dpi/card_300dpi.png`, 300)
    const ratio = r300.pxPerMm / r150.pxPerMm
    console.log(
      `pxPerMm 150 = ${r150.pxPerMm.toFixed(5)} 300 = ${r300.pxPerMm.toFixed(5)} ` +
        `ratio = ${ratio.toFixed(6)}`,
    )
    // Each scan must sit near its nominal resolution (a sanity bound, not the bias test).
    expect(Math.abs(r150.pxPerMm / (150 / 25.4) - 1)).toBeLessThan(0.02)
    expect(Math.abs(r300.pxPerMm / (300 / 25.4) - 1)).toBeLessThan(0.02)
    // The bias test: the ratio must be 2 to within 5e-4 relative.
    expect(Math.abs(ratio / 2 - 1)).toBeLessThan(5e-4)
  }, 300000)
})
