// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { renderPaScan } from '../../helpers/paRender'
import { defaultPaTestSpec, couponGeometry } from '../../../src/engine/pa/types'

function grayAt(img: { data: Uint8Array | Uint8ClampedArray; width: number }, x: number, y: number): number {
  const i = (y * img.width + x) * 4
  return img.data[i]
}

describe('renderPaScan', () => {
  it(
    'renders base, background, holes, and lines at the right tones',
    () => {
      const spec = defaultPaTestSpec()
      const g = couponGeometry(spec)
      const pxPerMm = 12
      const img = renderPaScan({ truePa: 0.03, pxPerMm, noiseSigma: 0 })
      // Image is base size plus a border of background.
      expect(img.width).toBeGreaterThan(g.baseWidthMm * pxPerMm)
      // Center of the coupon margin: base tone.
      const border = Math.round((img.width - g.baseWidthMm * pxPerMm) / 2)
      expect(grayAt(img, border + Math.round(2 * pxPerMm), Math.round(img.height / 2))).toBeGreaterThan(180)
      // A fiducial hole center: background tone.
      const f = g.fiducials[0]
      const hx = border + Math.round(f.xMm * pxPerMm)
      const hy = border + Math.round(f.yMm * pxPerMm)
      expect(Math.abs(grayAt(img, hx, hy) - 120)).toBeLessThan(20)
      // A line midpoint: dark line tone.
      const lx = border + Math.round((g.lineStartXMm + 40) * pxPerMm)
      const ly = border + Math.round(g.lineStartYMm(8) * pxPerMm)
      expect(grayAt(img, lx, ly)).toBeLessThan(90)
    },
    60000,
  )

  it(
    'bulges lines whose PA is far from truePa and keeps the matching line uniform',
    () => {
      const spec = defaultPaTestSpec()
      const g = couponGeometry(spec)
      const pxPerMm = 12
      // truePa exactly on line 8 of the default sweep
      const truePa = 0 + (0.06 * 8) / 15
      const img = renderPaScan({ truePa, pxPerMm, noiseSigma: 0 })
      const border = Math.round((img.width - g.baseWidthMm * pxPerMm) / 2)
      // Measure dark-pixel column height at the first transition x for line 0
      // (max PA error) and line 8 (zero error).
      function darkColumnHeight(lineIndex: number, xMm: number): number {
        const cx = border + Math.round((g.lineStartXMm + xMm) * pxPerMm)
        const cy = border + Math.round(g.lineStartYMm(lineIndex) * pxPerMm)
        let count = 0
        for (let dy = -15; dy <= 15; dy++) {
          if (grayAt(img, cx, cy + dy) < 128) count++
        }
        return count
      }
      const uniform = darkColumnHeight(8, g.transitionXsMm[0])
      const bulged = darkColumnHeight(0, g.transitionXsMm[0] + 0.5)
      expect(bulged).toBeGreaterThan(uniform + 2)
    },
    60000,
  )
})
