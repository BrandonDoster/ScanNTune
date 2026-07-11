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
    expect(spec.speedsMmS).toEqual([100, 200])
    expect(spec.linesPerSpeed).toBe(3)
    expect(spec.measuredLineMm).toBe(40)
    expect(spec.runUpMm).toBe(8)
    expect(spec.linePitchMm).toBe(2.5)
    expect(spec.axes).toEqual(['x', 'y'])
    expect(spec.squareCornerVelocityMmS).toBe(25)
    expect(spec.weldMm).toBe(1)
    expect(spec.placement).toBe('center')
  })
  it('floors the profile acceleration at the low-signal threshold and never caps it', () => {
    // The floor equals the low-acceleration warning threshold, so a default spec never
    // starts inside its own warning zone.
    const p = defaultPrinterProfile()
    expect(defaultIsTestSpec({ ...p, printAccelMmS2: 2000 }).accelMmS2).toBe(4000)
    expect(rampWarnings(defaultIsTestSpec({ ...p, printAccelMmS2: 2000 }))).toEqual([])
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
    expect(() => validateIsSpec({ ...spec, weldMm: 0 })).toThrow(/positive/)
  })
  it('throws when the run-up cannot host the corner approach', () => {
    expect(() => validateIsSpec({ ...spec, runUpMm: 5 })).toThrow(/approach/)
    expect(() => validateIsSpec({ ...spec, runUpMm: 6 })).not.toThrow()
  })
  it('throws when the square corner velocity does not exceed the approach speed', () => {
    // The zero-deceleration corner property only holds above the 20 mm/s approach speed.
    expect(() => validateIsSpec({ ...spec, squareCornerVelocityMmS: 20 })).toThrow(
      /approach speed/,
    )
    expect(() => validateIsSpec({ ...spec, squareCornerVelocityMmS: 0 })).toThrow(
      /approach speed/,
    )
    expect(() => validateIsSpec({ ...spec, squareCornerVelocityMmS: 21 })).not.toThrow()
  })
  it('throws on lines per speed outside 3 to 6', () => {
    expect(() => validateIsSpec({ ...spec, linesPerSpeed: 2 })).toThrow(/Lines per speed/)
    expect(() => validateIsSpec({ ...spec, linesPerSpeed: 7 })).toThrow(/Lines per speed/)
  })
  it('throws when the clean read length is shorter than the 40 mm floor', () => {
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
  it('warns when the run-up cannot host the ramp to 50 plus the decel to 20 plus the approach', () => {
    // At 4000 mm/s^2 the budget before the 5 mm approach is 50^2 / 8000 = 0.3125 mm up
    // plus (50^2 - 20^2) / 8000 = 0.2625 mm down, 0.575 mm in total. A 5.5 mm run-up
    // leaves only 0.5 mm: it would have passed the ramp-up check alone, so this pins the
    // deceleration term.
    const warnings = rampWarnings({ ...spec, accelMmS2: 4000, runUpMm: 5.5 })
    expect(warnings).toHaveLength(1)
    expect(warnings[0]).toContain('run-up')
    expect(warnings[0]).toContain('50 mm/s')
    expect(warnings[0]).toContain('20 mm/s')
    expect(rampWarnings({ ...spec, accelMmS2: 4000, runUpMm: 5.6 })).toEqual([])
  })
  it('does not warn about tier ramps: the layout reserves them before the read window', () => {
    // At 1000 mm/s^2 the 200 mm/s tier needs a 19.7 mm ramp; the geometry allocates it in
    // front of the clean read length, so only the low-acceleration warning fires (the
    // 8 mm run-up still hosts its 1.25 mm ramp-up plus 1.05 mm decel plus the approach).
    const warnings = rampWarnings({ ...spec, accelMmS2: 1000 })
    expect(warnings).toHaveLength(1)
    expect(warnings[0]).toContain('Low acceleration')
  })
  it('computes the ramp distance v^2 / (2a)', () => {
    expect(accelRampMm(100, 5000)).toBeCloseTo(1.0, 9)
  })
})

describe('fitSpecToBed', () => {
  const spec = defaultIsTestSpec(defaultPrinterProfile())
  it('leaves the default spec unchanged on the default 220 mm bed and on a 120 mm bed', () => {
    for (const bed of [220, 120]) {
      const p = { ...defaultPrinterProfile(), bedWidthMm: bed, bedDepthMm: bed }
      const { spec: fitted, notes } = fitSpecToBed(spec, p)
      expect(fitted).toEqual(spec)
      expect(notes).toEqual([])
    }
  })
  it('drops the fastest tier before shortening lines', () => {
    // A three-tier variant overflows a 120 mm bed; dropping the 300 mm/s tier shrinks the
    // field, the packed diagonal, and the band, back onto it at full read length.
    const three = { ...spec, speedsMmS: [100, 200, 300] }
    const p = { ...defaultPrinterProfile(), bedWidthMm: 120, bedDepthMm: 120 }
    const { spec: fitted, notes } = fitSpecToBed(three, p)
    expect(fitted.speedsMmS).toEqual([100, 200])
    expect(fitted.measuredLineMm).toBe(40)
    expect(notes).toHaveLength(1)
    expect(notes[0]).toContain('300 mm/s')
  })
  it('shortens the clean read length when tiers cannot be dropped, maximally', () => {
    const long = { ...spec, measuredLineMm: 60 }
    const p = { ...defaultPrinterProfile(), bedWidthMm: 120, bedDepthMm: 120 }
    const { spec: fitted, notes } = fitSpecToBed(long, p)
    expect(fitted.speedsMmS).toEqual([100, 200])
    expect(fitted.measuredLineMm).toBeLessThan(60)
    expect(fitted.measuredLineMm).toBeGreaterThanOrEqual(40)
    expect(notes).toHaveLength(1)
    const g = isCouponGeometry(fitted)
    expect(g.couponWidthMm).toBeLessThanOrEqual(120)
    expect(g.couponHeightMm).toBeLessThanOrEqual(120)
    // The solved length is maximal: one more millimetre would overflow the bed.
    const g1 = isCouponGeometry({ ...fitted, measuredLineMm: fitted.measuredLineMm + 1 })
    expect(Math.max(g1.couponWidthMm, g1.couponHeightMm)).toBeGreaterThan(120)
  })
  it('never shortens below the 40 mm floor and throws when the bed is genuinely too small', () => {
    const p = { ...defaultPrinterProfile(), bedWidthMm: 100, bedDepthMm: 100 }
    expect(() => fitSpecToBed(spec, p)).toThrow(/does not fit/)
  })
})
