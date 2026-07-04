import { describe, it, expect } from 'vitest'
import { solveAffine } from '../../src/engine/affineSolver'
import { skewCorrection, KLIPPER, MARLIN, REPRAP } from '../../src/engine/correctionFormatter'
import { defaultCouponSpec } from '../../src/engine/types'
import type { GridCorrespondence } from '../../src/engine/types'

// Mirrors the non-image tests in ScanNTune.Tests/SkewSignConventionTests.cs (the fixture-based
// FixtureShearReadsPositive lands in the OpenCV phase).
const ShearDeg = 1.0
const PxPerMm = 10.0
const PitchMm = 25.0
const shearTan = Math.tan((ShearDeg * Math.PI) / 180.0)

// A perfect 5x5 grid printed by a machine that shears x' = x + t*y, then imaged: y flipped (image
// rows grow downward) and optionally x-mirrored (a face-down scan).
function shearedGrid(mirrorX: boolean): GridCorrespondence[] {
  const extentMm = 4 * PitchMm
  const pts: GridCorrespondence[] = []
  for (let i = 0; i < 5; i++) {
    for (let j = 0; j < 5; j++) {
      const nx = i * PitchMm
      const ny = j * PitchMm
      const printedX = nx + shearTan * ny
      const imgX = mirrorX ? extentMm - printedX : printedX
      const imgY = extentMm - ny
      pts.push({
        col: i,
        row: j,
        nominalXmm: nx,
        nominalYmm: ny,
        measuredXpx: imgX * PxPerMm,
        measuredYpx: imgY * PxPerMm,
      })
    }
  }
  return pts
}

function firstLine(code: string): string {
  return code.split('\n')[0]
}

function parseAfterPrefix(code: string, prefix: string): number {
  const line = firstLine(code)
  expect(line.startsWith(prefix)).toBe(true)
  return parseFloat(line.substring(prefix.length))
}

describe('skew sign convention', () => {
  it('+X shear reads negative in the image frame', () => {
    const m = solveAffine(shearedGrid(false))
    expect(Math.abs(m.skewDegrees - -ShearDeg)).toBeLessThanOrEqual(0.001)
  })

  it('+X shear reads negative in a mirrored image frame', () => {
    const m = solveAffine(shearedGrid(true))
    expect(Math.abs(m.skewDegrees - -ShearDeg)).toBeLessThanOrEqual(0.001)
  })

  it('Klipper correction cancels the measured shear', () => {
    const c = skewCorrection(KLIPPER, -ShearDeg, defaultCouponSpec())
    const line = firstLine(c.code)
    const prefix = 'SET_SKEW XY='
    expect(line.startsWith(prefix)).toBe(true)
    const xy = line
      .substring(prefix.length)
      .split(',')
      .map((s) => parseFloat(s))
    expect(xy).toHaveLength(3)
    const [ac, bd, ad] = xy

    const side = Math.sqrt(2 * ac * ac + 2 * bd * bd - 4 * ad * ad) / 2.0
    const factor = Math.tan(Math.PI / 2 - Math.acos((ac * ac - side * side - ad * ad) / (2 * side * ad)))

    expect(ac).toBeGreaterThan(bd)
    expect(Math.abs(factor - shearTan)).toBeLessThanOrEqual(0.001)
  })

  it('Marlin emits a positive factor for a +X shear', () => {
    const marlin = skewCorrection(MARLIN, -ShearDeg, defaultCouponSpec())
    const marlinI = parseAfterPrefix(marlin.code, 'M852 I')
    expect(Math.abs(marlinI - shearTan)).toBeLessThanOrEqual(1e-6)
  })

  it('RepRap emits a negative factor for a +X shear', () => {
    const rrf = skewCorrection(REPRAP, -ShearDeg, defaultCouponSpec())
    const rrfX = parseAfterPrefix(rrf.code, 'M556 S100 X')
    expect(Math.abs(rrfX - -100.0 * shearTan)).toBeLessThanOrEqual(1e-3)
  })
})
