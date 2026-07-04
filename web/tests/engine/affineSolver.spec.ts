import { describe, it, expect } from 'vitest'
import { solveAffine } from '../../src/engine/affineSolver'
import type { GridCorrespondence } from '../../src/engine/types'

// Mirrors ScanNTune.Tests/AffineSolverTests.cs.
const Kx = 10.1 // true px/mm along X
const Ky = 9.9 // true px/mm along Y
const Pitch = 25.0

function perfectGrid(): GridCorrespondence[] {
  const pts: GridCorrespondence[] = []
  for (let i = 0; i < 5; i++) {
    for (let j = 0; j < 5; j++) {
      const nx = i * Pitch
      const ny = j * Pitch
      pts.push({ col: i, row: j, nominalXmm: nx, nominalYmm: ny, measuredXpx: nx * Kx, measuredYpx: ny * Ky })
    }
  }
  return pts
}

describe('AffineSolver', () => {
  it('robust fit resists one outlier', () => {
    const pts = perfectGrid()
    const bad = pts[7]
    pts[7] = { ...bad, measuredXpx: bad.measuredXpx + 30.0, measuredYpx: bad.measuredYpx + 25.0 }

    const robust = solveAffine(pts)
    const plain = solveAffine(pts, { robust: false })

    expect(Math.abs(robust.scaleXPxPerMm - Kx)).toBeLessThanOrEqual(0.03)
    expect(Math.abs(robust.scaleYPxPerMm - Ky)).toBeLessThanOrEqual(0.03)
    expect(Math.abs(robust.skewDegrees)).toBeLessThanOrEqual(0.05)
    expect(Math.abs(plain.scaleXPxPerMm - Kx)).toBeGreaterThan(
      Math.abs(robust.scaleXPxPerMm - Kx) + 0.02,
    )
  })

  it('robust fit resists a high-leverage corner outlier', () => {
    const pts = perfectGrid()
    const bad = pts[24]
    pts[24] = { ...bad, measuredXpx: bad.measuredXpx - 28.0, measuredYpx: bad.measuredYpx + 26.0 }

    const robust = solveAffine(pts)

    expect(Math.abs(robust.scaleXPxPerMm - Kx)).toBeLessThanOrEqual(0.03)
    expect(Math.abs(robust.scaleYPxPerMm - Ky)).toBeLessThanOrEqual(0.03)
    expect(Math.abs(robust.skewDegrees)).toBeLessThanOrEqual(0.05)
  })

  it('robust reweighting leaves near-clean data close to plain LS', () => {
    const pts = perfectGrid()
    for (let k = 0; k < pts.length; k++) {
      const p = pts[k]
      const dx = 0.4 * (((k * 7) % 5) - 2)
      const dy = 0.4 * (((k * 3) % 5) - 2)
      pts[k] = { ...p, measuredXpx: p.measuredXpx + dx, measuredYpx: p.measuredYpx + dy }
    }

    const robust = solveAffine(pts)
    const plain = solveAffine(pts, { robust: false })

    expect(Math.abs(robust.scaleXPxPerMm - plain.scaleXPxPerMm)).toBeLessThanOrEqual(0.05)
    expect(Math.abs(robust.scaleYPxPerMm - plain.scaleYPxPerMm)).toBeLessThanOrEqual(0.05)
    expect(Math.abs(robust.skewDegrees - plain.skewDegrees)).toBeLessThanOrEqual(0.05)
  })

  it('clean data matches plain least squares', () => {
    const pts = perfectGrid()
    const robust = solveAffine(pts)
    const plain = solveAffine(pts, { robust: false })

    expect(Math.abs(robust.scaleXPxPerMm - plain.scaleXPxPerMm)).toBeLessThanOrEqual(1e-9)
    expect(Math.abs(robust.scaleYPxPerMm - plain.scaleYPxPerMm)).toBeLessThanOrEqual(1e-9)
    expect(Math.abs(robust.skewDegrees - plain.skewDegrees)).toBeLessThanOrEqual(1e-9)
  })
})
