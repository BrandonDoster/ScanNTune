// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { analyzeFixture, flipY, rotate, shear, stretchX, type Transform } from '../helpers/cv'

// Mirrors ScanNTune.Tests/FlipInvarianceTests.cs.
describe('flip invariance', () => {
  it.each([
    [false, 0],
    [false, 90],
    [false, 270],
    [true, 0],
    [true, 90],
    [true, 180],
    [true, 270],
  ])('labels survive flip=%s rotation=%s', async (flip, rotation) => {
    const pipe: Transform[] = [(cv, m) => stretchX(cv, m, 1.02)]
    if (flip) pipe.push((cv, m) => flipY(cv, m))
    pipe.push((cv, m) => rotate(cv, m, rotation))

    const r = await analyzeFixture(pipe)
    expect(r.xScalePercent).toBeGreaterThan(0.5)
    expect(r.yScalePercent).toBeLessThan(-0.5)
  }, 60000)

  it('skew sign survives a flip', async () => {
    const normal = await analyzeFixture([(cv, m) => shear(cv, m, 1.0)])
    const flipped = await analyzeFixture([(cv, m) => shear(cv, m, 1.0), (cv, m) => flipY(cv, m)])

    expect(Math.abs(normal.skewDegrees)).toBeGreaterThan(0.5)
    expect(Math.abs(flipped.skewDegrees - normal.skewDegrees)).toBeLessThanOrEqual(0.2)
  }, 60000)
})
