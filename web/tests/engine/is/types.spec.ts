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
    expect(spec.measuredLineMm).toBe(60)
    expect(spec.runUpMm).toBe(20)
    expect(spec.linePitchMm).toBe(2.5)
    expect(spec.axes).toEqual(['x', 'y'])
    expect(spec.squareCornerVelocityMmS).toBe(5)
    expect(spec.weldMm).toBe(1)
    expect(spec.placement).toBe('center')
  })
  it('floors the profile acceleration at 3000 and never caps it', () => {
    const p = defaultPrinterProfile()
    expect(defaultIsTestSpec({ ...p, printAccelMmS2: 2000 }).accelMmS2).toBe(3000)
    expect(defaultIsTestSpec({ ...p, printAccelMmS2: 20000 }).accelMmS2).toBe(20000)
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
  it('throws when the measured line is shorter than the 40 mm floor', () => {
    expect(() => validateIsSpec({ ...spec, measuredLineMm: 39 })).toThrow(/at least 40 mm/)
    expect(() => validateIsSpec({ ...spec, measuredLineMm: 40 })).not.toThrow()
  })
  it('throws on empty axes', () => {
    expect(() => validateIsSpec({ ...spec, axes: [] })).toThrow(/axis/)
  })
})

describe('rampWarnings', () => {
  const spec = defaultIsTestSpec(defaultPrinterProfile())
  it('is silent at a healthy acceleration', () => {
    expect(rampWarnings({ ...spec, accelMmS2: 4000 })).toEqual([])
  })
  it('warns when the acceleration is below 4000 mm/s^2', () => {
    const warnings = rampWarnings({ ...spec, accelMmS2: 3000 })
    expect(warnings).toHaveLength(1)
    expect(warnings[0]).toContain('Low acceleration')
  })
  it('warns when the run-up is too short for the fixed approach speed', () => {
    // 50^2 / (2 * 4000) = 0.3125 mm, beyond a 0.2 mm run-up.
    const warnings = rampWarnings({ ...spec, accelMmS2: 4000, runUpMm: 0.2 })
    expect(warnings).toHaveLength(1)
    expect(warnings[0]).toContain('run-up')
    expect(warnings[0]).toContain('50 mm/s')
  })
  it('warns for a tier whose acceleration ramp outruns the measured line', () => {
    // (300^2 - 5^2) / (2 * 600) = 75.0 mm, beyond the 60 mm measured line; the 100 and
    // 200 mm/s tiers still reach their speed, and the low-accel warning also fires.
    const warnings = rampWarnings({ ...spec, accelMmS2: 600 })
    expect(warnings).toHaveLength(2)
    expect(warnings[0]).toContain('Low acceleration')
    expect(warnings[1]).toContain('300 mm/s')
    expect(warnings[1]).toContain('measured')
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
    const p = { ...defaultPrinterProfile(), bedWidthMm: 80, bedDepthMm: 80 }
    const { spec: fitted, notes } = fitSpecToBed(spec, p)
    expect(fitted.speedsMmS).toEqual([100, 200])
    expect(fitted.measuredLineMm).toBe(58)
    expect(notes).toHaveLength(2)
    const g = isCouponGeometry(fitted)
    expect(g.couponWidthMm).toBeLessThanOrEqual(80)
    expect(g.couponHeightMm).toBeLessThanOrEqual(80)
  })
  it('never shortens below the 40 mm floor and throws when the bed is genuinely too small', () => {
    const p = { ...defaultPrinterProfile(), bedWidthMm: 70, bedDepthMm: 70 }
    expect(() => fitSpecToBed(spec, p)).toThrow(/does not fit/)
  })
})
