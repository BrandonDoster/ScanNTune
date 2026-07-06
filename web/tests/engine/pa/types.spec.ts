import { describe, expect, it } from 'vitest'
import {
  defaultPrinterProfile,
  defaultPaTestSpec,
  paValueForLine,
  couponGeometry,
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
    for (const f of g.fiducials) {
      expect(f.xMm === g.fiducialInsetMm && f.yMm === g.fiducialInsetMm).toBe(false)
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
})
