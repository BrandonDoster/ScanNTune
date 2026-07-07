import { describe, expect, it } from 'vitest'
import {
  defaultPrinterProfile,
  defaultPaTestSpec,
  paValueForLine,
  couponGeometry,
  edgeShiftRange,
} from '../../../src/engine/pa/types'

describe('pa types', () => {
  it('steps PA linearly across lines', () => {
    const spec = defaultPaTestSpec()
    expect(paValueForLine(spec, 0)).toBeCloseTo(spec.paStart, 10)
    expect(paValueForLine(spec, spec.lineCount - 1)).toBeCloseTo(spec.paEnd, 10)
    expect(paValueForLine(spec, 5) - paValueForLine(spec, 4)).toBeCloseTo(
      (spec.paEnd - spec.paStart) / (spec.lineCount - 1),
      10,
    )
  })

  it('derives coupon geometry containing all lines plus margin', () => {
    const spec = defaultPaTestSpec()
    const g = couponGeometry(spec)
    const lineLen = 2 * spec.slowSegmentMm + spec.fastSegmentMm
    expect(g.baseWidthMm).toBeCloseTo(lineLen + 2 * spec.marginMm, 10)
    expect(g.baseHeightMm).toBeCloseTo((spec.lineCount - 1) * spec.linePitchMm + 2 * spec.marginMm, 10)
    // three fiducial holes, none at the origin corner (min-x, min-y)
    expect(g.fiducials).toHaveLength(3)
    const originX = g.fiducialInsetMm + g.fiducialSizeMm / 2
    const originY = g.fiducialInsetMm + g.fiducialSizeMm / 2
    for (const f of g.fiducials) {
      expect(f.xMm === originX && f.yMm === originY).toBe(false)
    }
    // transitions sit at slow/fast boundaries in line-local x
    expect(g.transitionXsMm).toEqual([spec.slowSegmentMm, spec.slowSegmentMm + spec.fastSegmentMm])
  })

  it('provides sane printer defaults', () => {
    const p = defaultPrinterProfile()
    expect(p.firmware).toBe('Klipper')
    expect(p.nozzleDiameterMm).toBeCloseTo(0.4)
    expect(p.filamentDiameterMm).toBeCloseTo(1.75)
    expect(p.bedWidthMm).toBeGreaterThan(100)
  })

  describe('edgeShiftRange', () => {
    it('returns null when the best line is not null but sits mid-sweep', () => {
      const spec = defaultPaTestSpec()
      const mid = Math.floor(spec.lineCount / 2)
      expect(edgeShiftRange(spec, mid)).toBeNull()
    })

    it('returns null when there is no best line', () => {
      expect(edgeShiftRange(defaultPaTestSpec(), null)).toBeNull()
    })

    it('shifts the range around the first line when it is the optimum', () => {
      const spec = defaultPaTestSpec()
      const shift = edgeShiftRange(spec, 0)
      expect(shift).not.toBeNull()
      const range = spec.paEnd - spec.paStart
      const centre = paValueForLine(spec, 0)
      expect(shift!.start).toBeCloseTo(Math.max(0, centre - range / 2), 10)
      expect(shift!.end - shift!.start).toBeCloseTo(range, 10)
    })

    it('shifts the range around the last line when it is the optimum', () => {
      const spec = defaultPaTestSpec()
      const shift = edgeShiftRange(spec, spec.lineCount - 1)
      expect(shift).not.toBeNull()
      const range = spec.paEnd - spec.paStart
      const centre = paValueForLine(spec, spec.lineCount - 1)
      expect(shift!.start).toBeCloseTo(Math.max(0, centre - range / 2), 10)
      expect(shift!.end - shift!.start).toBeCloseTo(range, 10)
    })

    it('derives from the spec passed in, not any external live state', () => {
      const analyzedSpec = { ...defaultPaTestSpec(), paStart: 0.02, paEnd: 0.08, lineCount: 5 }
      const shift = edgeShiftRange(analyzedSpec, 0)
      expect(shift).toEqual({ start: 0, end: 0.06 })
    })
  })
})
