// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { getCv } from '../../helpers/cv'
import { renderEmScan } from '../../helpers/emRender'
import { rgbaToBgrMat } from '../../../src/engine/imageData'
import { alignEmCoupon, mmToPx } from '../../../src/engine/em/fiducialAligner'
import { defaultEmTestSpec, emCouponGeometry } from '../../../src/engine/em/types'
import { defaultPrinterProfile } from '../../../src/engine/pa/types'

const spec = defaultEmTestSpec(defaultPrinterProfile())
const g = emCouponGeometry(spec)

// Forward model of emRender's coupon-frame to scan-pixel mapping, so tests can compute where a
// coupon-frame point actually landed in the rendered image.
function renderedPx(
  xMm: number,
  yMm: number,
  pxPerMm: number,
  marginMm: number,
  rotationDegrees: number,
  quarterTurns: number,
  flipped: boolean,
): { x: number; y: number } {
  const w0 = g.couponWidthMm + 2 * marginMm
  const h0 = g.couponHeightMm + 2 * marginMm
  const rad = ((rotationDegrees + quarterTurns * 90) * Math.PI) / 180
  const cos = Math.cos(rad)
  const sin = Math.sin(rad)
  const wMm = Math.abs(cos) * w0 + Math.abs(sin) * h0
  const hMm = Math.abs(sin) * w0 + Math.abs(cos) * h0
  let mx = xMm + marginMm
  if (flipped) mx = w0 - mx
  const my = yMm + marginMm
  const mpx = mx - w0 / 2
  const mpy = my - h0 / 2
  const dx = cos * mpx - sin * mpy
  const dy = sin * mpx + cos * mpy
  return { x: (wMm / 2 + dx) * pxPerMm, y: (hMm / 2 + dy) * pxPerMm }
}

describe('alignEmCoupon', () => {
  it(
    'aligns the default render and maps the fiducial centers to their rendered positions',
    async () => {
      const cv = await getCv()
      const pxPerMm = 12
      const marginMm = 8
      const img = rgbaToBgrMat(cv, renderEmScan({ spec, trueWidthMm: 0.42, pxPerMm, marginMm }))
      try {
        const al = alignEmCoupon(cv, img, spec)
        expect(al.success).toBe(true)
        expect(al.failureReason).toBeNull()
        expect(al.flipped).toBe(false)
        expect(al.rotationQuarterTurns).toBe(0)
        for (const f of g.fiducials) {
          const expected = renderedPx(f.xMm, f.yMm, pxPerMm, marginMm, 0, 0, false)
          const actual = mmToPx(al, f.xMm, f.yMm)
          expect(Math.hypot(actual.x - expected.x, actual.y - expected.y)).toBeLessThan(1.5)
        }
      } finally {
        img.delete()
      }
    },
    120000,
  )

  it.each([
    [0, false],
    [1, false],
    [2, false],
    [3, false],
    [0, true],
    [1, true],
    [2, true],
    [3, true],
  ])(
    'aligns quarterTurns %d flipped %s with 2 degrees of skew',
    async (quarterTurns, flipped) => {
      const cv = await getCv()
      const pxPerMm = 8
      const marginMm = 8
      const rotationDegrees = 2
      const img = rgbaToBgrMat(
        cv,
        renderEmScan({
          spec,
          trueWidthMm: 0.42,
          pxPerMm,
          marginMm,
          rotationDegrees,
          quarterTurns: quarterTurns as 0 | 1 | 2 | 3,
          flipped: flipped as boolean,
        }),
      )
      try {
        const al = alignEmCoupon(cv, img, spec)
        expect(al.success).toBe(true)
        expect(al.flipped).toBe(flipped)
        expect(al.rotationQuarterTurns).toBe(
          (((quarterTurns as number) + (flipped ? 2 : 0)) % 4 + 4) % 4,
        )
        for (const f of g.fiducials) {
          const expected = renderedPx(
            f.xMm,
            f.yMm,
            pxPerMm,
            marginMm,
            rotationDegrees,
            quarterTurns as number,
            flipped as boolean,
          )
          const actual = mmToPx(al, f.xMm, f.yMm)
          expect(Math.hypot(actual.x - expected.x, actual.y - expected.y)).toBeLessThan(1.5)
        }
      } finally {
        img.delete()
      }
    },
    120000,
  )

  it(
    'aligns an inverted-polarity scan (light plastic on a dark background)',
    async () => {
      const cv = await getCv()
      const pxPerMm = 8
      const marginMm = 8
      const img = rgbaToBgrMat(
        cv,
        renderEmScan({
          spec,
          trueWidthMm: 0.42,
          pxPerMm,
          marginMm,
          plasticGray: 245,
          backgroundGray: 40,
        }),
      )
      try {
        const al = alignEmCoupon(cv, img, spec)
        expect(al.success).toBe(true)
        expect(al.flipped).toBe(false)
        for (const f of g.fiducials) {
          const expected = renderedPx(f.xMm, f.yMm, pxPerMm, marginMm, 0, 0, false)
          const actual = mmToPx(al, f.xMm, f.yMm)
          expect(Math.hypot(actual.x - expected.x, actual.y - expected.y)).toBeLessThan(1.5)
        }
      } finally {
        img.delete()
      }
    },
    120000,
  )

  it(
    'fails with a user-worded reason on a blank image',
    async () => {
      const cv = await getCv()
      const blank = new cv.Mat(400, 400, cv.CV_8UC3, new cv.Scalar(128, 128, 128, 255))
      try {
        const al = alignEmCoupon(cv, blank, spec)
        expect(al.success).toBe(false)
        expect(al.failureReason).toBeTruthy()
        expect(al.affine).toBeNull()
      } finally {
        blank.delete()
      }
    },
    60000,
  )
})
