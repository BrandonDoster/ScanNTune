// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { getCv } from '../../helpers/cv'
import { renderPaScan } from '../../helpers/paRender'
import { rgbaToBgrMat } from '../../../src/engine/imageData'
import { alignPaCoupon, mmToPx } from '../../../src/engine/pa/fiducialAligner'
import { defaultPaTestSpec, couponGeometry } from '../../../src/engine/pa/types'
import type { PaTestSpec } from '../../../src/engine/pa/types'

describe('alignPaCoupon', () => {
  const spec = defaultPaTestSpec()
  const g = couponGeometry(spec)

  async function alignRender(rotationDegrees: number, flipped: boolean) {
    const cv = await getCv()
    const img = rgbaToBgrMat(cv, renderPaScan({ truePa: 0.03, rotationDegrees, flipped }))
    try {
      return alignPaCoupon(cv, img, spec)
    } finally {
      img.delete()
    }
  }

  it.each([
    [0, false],
    [90, false],
    [180, false],
    [7, false], // slight skew on the scanner glass
    [0, true],
    [90, true],
  ])(
    'aligns rotation %d flipped %s',
    async (rot, flip) => {
      const al = await alignRender(rot as number, flip as boolean)
      expect(al.success).toBe(true)
      expect(al.flipped).toBe(flip)
      // Projecting the nominal fiducials must reproduce their pairwise
      // distances at a consistent scale (the render is 12 px/mm).
      const p0 = mmToPx(al, g.fiducials[0].xMm, g.fiducials[0].yMm)
      const p1 = mmToPx(al, g.fiducials[1].xMm, g.fiducials[1].yMm)
      const dNominal = Math.hypot(
        g.fiducials[0].xMm - g.fiducials[1].xMm,
        g.fiducials[0].yMm - g.fiducials[1].yMm,
      )
      const scale = Math.hypot(p0.x - p1.x, p0.y - p1.y) / dNominal
      expect(scale).toBeGreaterThan(11)
      expect(scale).toBeLessThan(13)
    },
    120000,
  )

  it(
    'aligns light lines on a dark base with a light scanner lid',
    async () => {
      const cv = await getCv()
      const img = rgbaToBgrMat(
        cv,
        renderPaScan({ truePa: 0.03, baseGray: 40, lineGray: 220, backgroundGray: 245 }),
      )
      try {
        const al = alignPaCoupon(cv, img, spec)
        expect(al.success).toBe(true)
        const p0 = mmToPx(al, g.fiducials[0].xMm, g.fiducials[0].yMm)
        const p1 = mmToPx(al, g.fiducials[1].xMm, g.fiducials[1].yMm)
        const dNominal = Math.hypot(
          g.fiducials[0].xMm - g.fiducials[1].xMm,
          g.fiducials[0].yMm - g.fiducials[1].yMm,
        )
        const scale = Math.hypot(p0.x - p1.x, p0.y - p1.y) / dNominal
        expect(scale).toBeGreaterThan(11)
        expect(scale).toBeLessThan(13)
      } finally {
        img.delete()
      }
    },
    120000,
  )

  it(
    'fails with a reason when no coupon is present',
    async () => {
      const cv = await getCv()
      const blank = new cv.Mat(400, 400, cv.CV_8UC3, new cv.Scalar(128, 128, 128, 255))
      try {
        const al = alignPaCoupon(cv, blank, spec)
        expect(al.success).toBe(false)
        expect(al.failureReason).toBeTruthy()
      } finally {
        blank.delete()
      }
    },
    60000,
  )

  it(
    'fails with a reason when the coupon base is square (ambiguous fiducial arms)',
    async () => {
      // baseWidthMm = 2*slowSegmentMm + fastSegmentMm + 2*marginMm
      // baseHeightMm = (lineCount - 1) * linePitchMm + 2*marginMm
      // Choose a spec where these are equal, making the two fiducial arms equal in length.
      const squareSpec: PaTestSpec = {
        ...defaultPaTestSpec(),
        lineCount: 16,
        linePitchMm: 4,
        marginMm: 8,
        slowSegmentMm: 20,
        fastSegmentMm: 20,
      }
      const squareG = couponGeometry(squareSpec)
      expect(squareG.baseWidthMm).toBeCloseTo(squareG.baseHeightMm, 6)

      const cv = await getCv()
      const img = rgbaToBgrMat(
        cv,
        renderPaScan({ truePa: 0.03, spec: squareSpec }),
      )
      try {
        const al = alignPaCoupon(cv, img, squareSpec)
        expect(al.success).toBe(false)
        expect(al.failureReason).toBeTruthy()
      } finally {
        img.delete()
      }
    },
    120000,
  )
})
