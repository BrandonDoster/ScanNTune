// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { decodeE2eFixtureBgr, getCv } from '../../helpers/cv'
import { alignPaCoupon } from '../../../src/engine/pa/fiducialAligner'
import { analyzePaCoupon } from '../../../src/engine/pa/paAnalyzer'
import { defaultPaTestSpec } from '../../../src/engine/pa/types'

// Regression test over a real flatbed scan of a printed PA coupon (default spec: 16 lines,
// PA 0 to 0.06). The expected value below is what the pipeline measured when the fixture was
// added; the tolerance is one sweep step (0.06 / 15 = 0.004), a regression bound rather than
// an accuracy claim.
const EXPECTED_PA = 0.0348
const SWEEP_STEP = 0.004

describe('real-scan PA regression', () => {
  it(
    'aligns and recovers a stable PA from the real coupon scan',
    async () => {
      const cv = await getCv()
      const spec = defaultPaTestSpec()
      const bgr = decodeE2eFixtureBgr(cv, 'pa_real_scan.png')
      try {
        const alignment = alignPaCoupon(cv, bgr, spec)
        expect(alignment.success).toBe(true)

        const started = Date.now()
        const r = analyzePaCoupon(cv, bgr, spec)
        const elapsedMs = Date.now() - started
        // Guard against a reintroduced per-pixel kernel regression: the 35 MP scan must
        // analyze well under two minutes even on slow CI.
        expect(elapsedMs).toBeLessThan(120000)

        expect(r.success).toBe(true)
        expect(r.lines).toHaveLength(spec.lineCount)
        // Every line must yield a usable width profile (a majority of finite width samples).
        for (const line of r.lines) expect(line.measured).toBe(true)

        expect(Number.isFinite(r.bestPa)).toBe(true)
        const bestPa = r.bestPa as number
        expect(bestPa).toBeGreaterThanOrEqual(spec.paStart)
        expect(bestPa).toBeLessThanOrEqual(spec.paEnd)
        expect(Math.abs(bestPa - EXPECTED_PA)).toBeLessThan(SWEEP_STEP)
      } finally {
        bgr.delete()
      }
    },
    180000,
  )
})
