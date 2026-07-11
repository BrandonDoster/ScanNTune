import { describe, expect, it } from 'vitest'
import { defaultPrinterProfile } from '../../../src/engine/gcode/profileTypes'
import {
  accelRampMm,
  defaultIsTestSpec,
  fitSpecToBed,
  rampWarnings,
  validateIsSpec,
} from '../../../src/engine/is/types'
import { isCouponGeometry } from '../../../src/engine/is/couponGeometry'

describe('defaultIsTestSpec', () => {
  it('uses the documented defaults', () => {
    const spec = defaultIsTestSpec(defaultPrinterProfile())
    expect(spec.speedsMmS).toEqual([100, 200, 300])
    expect(spec.linesPerSpeed).toBe(5)
    expect(spec.measuredLineMm).toBe(110)
    expect(spec.runUpMm).toBe(20)
    expect(spec.linePitchMm).toBe(2.5)
    expect(spec.axes).toEqual(['x', 'y'])
    expect(spec.squareCornerVelocityMmS).toBe(5)
    expect(spec.weldMm).toBe(1)
    expect(spec.placement).toBe('center')
  })
  it('clamps the profile acceleration into [3000, 6000]', () => {
    const p = defaultPrinterProfile()
    expect(defaultIsTestSpec({ ...p, printAccelMmS2: 1000 }).accelMmS2).toBe(3000)
    expect(defaultIsTestSpec({ ...p, printAccelMmS2: 10000 }).accelMmS2).toBe(6000)
    expect(defaultIsTestSpec({ ...p, printAccelMmS2: 4500 }).accelMmS2).toBe(4500)
  })
})

describe('validateIsSpec', () => {
  const spec = defaultIsTestSpec(defaultPrinterProfile())
  it('accepts the default spec', () => {
    expect(() => validateIsSpec(spec)).not.toThrow()
  })
  it('throws on fewer than 2 or more than 3 speed tiers', () => {
    expect(() => validateIsSpec({ ...spec, speedsMmS: [100] })).toThrow(/speed tiers/)
    expect(() => validateIsSpec({ ...spec, speedsMmS: [50, 100, 200, 300] })).toThrow(
      /speed tiers/,
    )
  })
  it('throws on non-positive values', () => {
    expect(() => validateIsSpec({ ...spec, speedsMmS: [0, 100] })).toThrow(/positive/)
    expect(() => validateIsSpec({ ...spec, runUpMm: -1 })).toThrow(/positive/)
    expect(() => validateIsSpec({ ...spec, linePitchMm: 0 })).toThrow(/positive/)
    expect(() => validateIsSpec({ ...spec, accelMmS2: 0 })).toThrow(/positive/)
    expect(() => validateIsSpec({ ...spec, squareCornerVelocityMmS: 0 })).toThrow(/positive/)
    expect(() => validateIsSpec({ ...spec, weldMm: 0 })).toThrow(/positive/)
  })
  it('throws on lines per speed outside 4 to 6', () => {
    expect(() => validateIsSpec({ ...spec, linesPerSpeed: 3 })).toThrow(/Lines per speed/)
    expect(() => validateIsSpec({ ...spec, linesPerSpeed: 7 })).toThrow(/Lines per speed/)
  })
  it('throws when the measured line is shorter than the 60 mm floor', () => {
    expect(() => validateIsSpec({ ...spec, measuredLineMm: 59 })).toThrow(/at least 60 mm/)
    expect(() => validateIsSpec({ ...spec, measuredLineMm: 60 })).not.toThrow()
  })
  it('throws on empty axes', () => {
    expect(() => validateIsSpec({ ...spec, axes: [] })).toThrow(/axis/)
  })
})

describe('rampWarnings', () => {
  const spec = defaultIsTestSpec(defaultPrinterProfile())
  it('is silent when every tier reaches speed inside the run-up', () => {
    // 300^2 / (2 * 3000) = 15 mm, inside the 20 mm run-up.
    expect(rampWarnings({ ...spec, accelMmS2: 3000 })).toEqual([])
  })
  it('warns for a tier whose ramp exceeds the run-up', () => {
    // 300^2 / (2 * 2000) = 22.5 mm, beyond the 20 mm run-up; lower tiers still fit.
    const warnings = rampWarnings({ ...spec, accelMmS2: 2000 })
    expect(warnings).toHaveLength(1)
    expect(warnings[0]).toContain('300 mm/s')
  })
  it('computes the ramp distance v^2 / (2a)', () => {
    expect(accelRampMm(100, 5000)).toBeCloseTo(1.0, 9)
  })
})

describe('fitSpecToBed', () => {
  const spec = defaultIsTestSpec(defaultPrinterProfile())
  it('leaves the default spec unchanged on a 180x180 bed', () => {
    const p = { ...defaultPrinterProfile(), bedWidthMm: 180, bedDepthMm: 180 }
    const { spec: fitted, notes } = fitSpecToBed(spec, p)
    expect(fitted).toEqual(spec)
    expect(notes).toEqual([])
  })
  it('drops the 300 tier before shortening lines', () => {
    // At 60 mm lines with 6 lines per tier the field width, not the measured span, drives
    // the footprint, so removing the top tier alone brings the coupon onto an 84 mm bed.
    const wide = { ...spec, measuredLineMm: 60, linesPerSpeed: 6 }
    const p = { ...defaultPrinterProfile(), bedWidthMm: 84, bedDepthMm: 84 }
    const { spec: fitted, notes } = fitSpecToBed(wide, p)
    expect(fitted.speedsMmS).toEqual([100, 200])
    expect(fitted.measuredLineMm).toBe(60)
    expect(notes).toHaveLength(1)
    expect(notes[0]).toContain('300 mm/s')
  })
  it('shortens the measured lines on a smaller bed, keeping at least 2 tiers', () => {
    const p = { ...defaultPrinterProfile(), bedWidthMm: 130, bedDepthMm: 130 }
    const { spec: fitted, notes } = fitSpecToBed(spec, p)
    expect(fitted.speedsMmS).toEqual([100, 200])
    expect(fitted.measuredLineMm).toBe(108)
    expect(notes).toHaveLength(2)
    const g = isCouponGeometry(fitted)
    expect(g.couponWidthMm).toBeLessThanOrEqual(130)
    expect(g.couponHeightMm).toBeLessThanOrEqual(130)
  })
  it('never shortens below the 60 mm floor and throws when the bed is genuinely too small', () => {
    const p = { ...defaultPrinterProfile(), bedWidthMm: 70, bedDepthMm: 70 }
    expect(() => fitSpecToBed(spec, p)).toThrow(/does not fit/)
  })
})
