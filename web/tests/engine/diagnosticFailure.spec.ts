// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { getCv, blankBgr } from '../helpers/cv'
import { analyzeCoupon } from '../../src/engine/couponAnalyzer'
import { ScanAnalysisError, defaultCouponSpec } from '../../src/engine/types'

// Mirrors ScanNTune.Tests/DiagnosticFailureTests.cs.
describe('diagnostic failure', () => {
  it('a blank scan throws ScanAnalysisError carrying the detected rings', async () => {
    const cv = await getCv()
    const blank = blankBgr(cv, 600)
    try {
      let thrown: unknown
      try {
        analyzeCoupon(cv, blank, { coupon: defaultCouponSpec() })
      } catch (e) {
        thrown = e
      }
      expect(thrown).toBeInstanceOf(ScanAnalysisError)
      expect((thrown as ScanAnalysisError).detectedRings).toBeDefined()
    } finally {
      blank.delete()
    }
  }, 60000)
})
