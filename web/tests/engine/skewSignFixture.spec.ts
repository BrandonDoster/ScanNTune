// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { analyzeFixture, shear } from '../helpers/cv'

// Mirrors the fixture case FixtureShearReadsPositive in SkewSignConventionTests.cs: a +1 degree image
// shear of the y-up render opens the corner, so the measured angle error is positive.
describe('skew sign (fixture)', () => {
  it('a +1 degree fixture shear reads positive', async () => {
    const r = await analyzeFixture([(cv, m) => shear(cv, m, 1.0)])
    expect(Math.abs(r.skewDegrees - 1.0)).toBeLessThanOrEqual(0.1)
  }, 60000)
})
