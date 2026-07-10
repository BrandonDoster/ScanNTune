// @vitest-environment node
import { existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, it, expect } from 'vitest'
import { getCv, decodePngFileBgr } from '../helpers/cv'
import { measureCard } from '../../src/engine/cardEdgeMeasurer'

// The same physical card scanned on the same scanner at 150, 300 and 600 dpi must measure spans in
// exact 1:2:4 proportion; any dpi-dependent departure is a localization bias of the edge measurer,
// not a property of the card. The scans live in the untracked Data/ corpus (they never enter the
// repo), so the suite is skipped where the corpus is absent (CI).

const LONG_MM = 85.6

const dataDir = fileURLToPath(new URL('../../../Data', import.meta.url))
const scans: Array<{ dpi: number; path: string }> = [
  { dpi: 150, path: `${dataDir}/150DPI/Card_150DPI.png` },
  { dpi: 300, path: `${dataDir}/300DPI/Card_300DPI.png` },
  { dpi: 600, path: `${dataDir}/600DPI/600DPI_Cardscan.png` },
]
const corpusPresent = scans.every((s) => existsSync(s.path))

describe.skipIf(!corpusPresent)(
  'card span proportionality across real 150/300/600 dpi scans (needs the local Data/ corpus)',
  () => {
    it('measures spans in 1:2:4 proportion within 0.001', async () => {
      const cv = await getCv()
      const spans = new Map<number, number>()
      for (const scan of scans) {
        const img = decodePngFileBgr(cv, scan.path)
        try {
          const r = measureCard(cv, img, LONG_MM, scan.dpi)
          expect(r.success).toBe(true)
          spans.set(scan.dpi, r.measuredWidthPx)
        } finally {
          img.delete()
        }
      }
      const r1 = spans.get(300)! / spans.get(150)!
      const r2 = spans.get(600)! / spans.get(300)!
      console.log(
        `spans px: ${scans.map((s) => `${s.dpi}:${spans.get(s.dpi)!.toFixed(3)}`).join(' ')} ` +
          `ratios 300/150 = ${r1.toFixed(5)} 600/300 = ${r2.toFixed(5)}`,
      )
      expect(Math.abs(r1 - 2)).toBeLessThan(0.001)
      expect(Math.abs(r2 - 2)).toBeLessThan(0.001)
    }, 300000)
  },
)
