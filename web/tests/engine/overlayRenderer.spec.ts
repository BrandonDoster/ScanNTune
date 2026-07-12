// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { getCv, decodeFixtureBgr } from '../helpers/cv'
import { analyzeCoupon } from '../../src/engine/couponAnalyzer'
import { renderOverlayMat } from '../../src/engine/overlayRenderer'
import { asAligned, defaultCouponSpec } from '../../src/engine/types'

describe('overlay renderer', () => {
  it('renders a cropped BGR overlay of the coupon', async () => {
    const cv = await getCv()
    const image = decodeFixtureBgr(cv, 'TestData_2solid.png')
    const result = asAligned(analyzeCoupon(cv, image, { coupon: defaultCouponSpec() }))
    const overlay = renderOverlayMat(cv, image, result)
    try {
      expect(overlay.channels()).toBe(3)
      expect(overlay.rows).toBeGreaterThan(0)
      expect(overlay.cols).toBeGreaterThan(0)
      // Cropped to content: no larger than the full scan.
      expect(overlay.rows).toBeLessThanOrEqual(image.rows)
      expect(overlay.cols).toBeLessThanOrEqual(image.cols)
      // The crop must be a continuous Mat: a ROI clone() can keep the parent's row stride,
      // which misaligns every flat `data` read (and the ImageData handed to the UI).
      expect(overlay.isContinuous()).toBe(true)
      expect((overlay.data as Uint8Array).length).toBe(overlay.rows * overlay.cols * 3)
    } finally {
      image.delete()
      overlay.delete()
    }
  }, 60000)
})
