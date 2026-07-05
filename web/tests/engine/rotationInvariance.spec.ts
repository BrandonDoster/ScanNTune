// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { analyzeFixture, rotate, stretchX } from '../helpers/cv'
import { xAxisAngleDegrees } from '../../src/engine/types'

// Mirrors ScanNTune.Tests/RotationInvarianceTests.cs.
function angleDifference(a: number, b: number): number {
  return ((a - b + 540.0) % 360.0) - 180.0
}

describe('rotation invariance', () => {
  it.each([
    [0, 0.0],
    [90, 90.0],
    [180, 180.0],
    [270, 270.0],
  ])('orientation tracks a %s degree rotation', async (rotationDegrees, expectedXAngle) => {
    const r = await analyzeFixture([(cv, m) => rotate(cv, m, rotationDegrees)])
    expect(r.ringsDetected).toBe(23)
    expect(
      Math.abs(angleDifference(xAxisAngleDegrees(r.orientation), expectedXAngle)),
    ).toBeLessThanOrEqual(2.0)
  }, 60000)

  it('labelling is rotation-invariant for an anisotropic coupon', async () => {
    const at0 = await analyzeFixture([(cv, m) => stretchX(cv, m, 1.02)])
    const at90 = await analyzeFixture([(cv, m) => stretchX(cv, m, 1.02), (cv, m) => rotate(cv, m, 90)])
    const at270 = await analyzeFixture([(cv, m) => stretchX(cv, m, 1.02), (cv, m) => rotate(cv, m, 270)])

    expect(at0.xScalePercent).toBeGreaterThan(0.5)
    expect(Math.abs(at90.xScalePercent - at0.xScalePercent)).toBeLessThanOrEqual(0.15)
    expect(Math.abs(at270.xScalePercent - at0.xScalePercent)).toBeLessThanOrEqual(0.15)
    expect(Math.abs(at90.yScalePercent - at0.yScalePercent)).toBeLessThanOrEqual(0.15)
  }, 60000)
})
