import { describe, it, expect } from 'vitest'
import { combineScans } from '../../src/engine/scanCombiner'
import type { CalibrationResult } from '../../src/engine/types'

// Mirrors ScanNTune.Tests/CombinerGuardTests.cs.
function scan(xAxisAngleDegrees: number, flipped: boolean): CalibrationResult {
  const rad = (xAxisAngleDegrees * Math.PI) / 180.0
  return {
    xScalePercent: 0.0,
    yScalePercent: 0.0,
    skewDegrees: 0.0,
    ringsDetected: 23,
    measuredPxPerMmX: 23.6,
    measuredPxPerMmY: 23.6,
    rmsResidualPx: 0.5,
    rings: [],
    orientation: { flipped, originX: 0.0, originY: 0.0, xAxisX: Math.cos(rad), xAxisY: Math.sin(rad) },
  }
}

describe('combiner guards', () => {
  it('flip mismatch invalidates the pair', () => {
    const r = combineScans(scan(0.0, false), scan(90.0, true))
    expect(r.flipMismatch).toBe(true)
    expect(r.rotationLooksValid).toBe(false)
  })

  it('same flip state on both scans is accepted', () => {
    const r = combineScans(scan(0.0, true), scan(90.0, true))
    expect(r.flipMismatch).toBe(false)
    expect(r.rotationLooksValid).toBe(true)
  })

  it.each([70.0, 110.0, 250.0])('far-off quarter-turn is invalid (%s)', (turn) => {
    const r = combineScans(scan(0.0, false), scan(turn, false))
    expect(r.rotationLooksValid).toBe(false)
  })

  it.each([87.0, 93.0, 273.0])('near quarter-turn is valid (%s)', (turn) => {
    const r = combineScans(scan(0.0, false), scan(turn, false))
    expect(r.rotationLooksValid).toBe(true)
  })
})
