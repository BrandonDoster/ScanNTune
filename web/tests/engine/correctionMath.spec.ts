import { describe, it, expect } from 'vitest'
import {
  sizeCorrection,
  SHRINKAGE,
  STEPS_PER_MM,
  ROTATION_DISTANCE,
  SCALE,
} from '../../src/engine/correctionFormatter'

// Mirrors ScanNTune.Tests/CorrectionMathTests.cs.
describe('correction math', () => {
  it.each([SHRINKAGE, STEPS_PER_MM, ROTATION_DISTANCE, SCALE])(
    'guards implausible scale (%s)',
    (flavour) => {
      const c = sizeCorrection(flavour, 100.0, 100.0, 80.0, 80.0)
      expect(c.code).toContain('out of range')
      expect(c.code).not.toContain('M92')
      expect(c.code).not.toContain('%')
    },
  )

  it('plausible scale passes the guard', () => {
    const c = sizeCorrection(SHRINKAGE, 1.5, 1.5, null, null)
    expect(c.code).toContain('%')
  })

  it('steps/mm uses the exact ratio', () => {
    const c = sizeCorrection(STEPS_PER_MM, 2.0, 2.0, 80.0, 80.0)
    expect(c.code.startsWith('M92 X78.431 Y78.431')).toBe(true)
  })

  it('scale % uses the exact ratio', () => {
    const c = sizeCorrection(SCALE, 2.0, 2.0, null, null)
    expect(c.code).toBe('X 98.04 %   Y 98.04 %')
  })

  it('shrinkage and rotation distance stay exact', () => {
    const shrink = sizeCorrection(SHRINKAGE, 2.0, 2.0, null, null)
    const rot = sizeCorrection(ROTATION_DISTANCE, 2.0, 2.0, 32.0, 32.0)
    expect(shrink.code).toBe('XY shrinkage: 102.00 %')
    expect(rot.code).toBe('X 32.6400   Y 32.6400')
  })

  it('steps/mm hint does not claim Klipper support', () => {
    const c = sizeCorrection(STEPS_PER_MM, 1.0, 1.0, 80.0, 80.0)
    expect(c.hint).not.toContain('Klipper steps')
    expect(c.hint).toContain('Marlin')
    expect(c.hint).toContain('Rotation distance')
  })
})
