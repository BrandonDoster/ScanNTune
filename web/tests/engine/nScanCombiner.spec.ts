import { describe, it, expect } from 'vitest'
import {
  combineScanSet,
  normalizeAngle,
  quadrantsCovered,
  turnSpreadDegrees,
} from '../../src/engine/scanCombiner'
import { tQuantile } from '../../src/engine/studentT'
import { solveAffine } from '../../src/engine/affineSolver'
import { alignedResult } from '../helpers/results'
import type { AlignedResult, GridCorrespondence } from '../../src/engine/types'

// Ground-truth recovery for the N-scan least-squares error separation. Two generators feed it:
// synthScan builds observations from the linearized physical model (the small symmetric traceless
// scanner tensor conjugated by the placement rotation, each channel in its own unit), and
// physicalScan composes the full matrix product (scanner * rotation * mirror * printer) and
// measures it through the REAL affine solver, so the linearized model is pinned to the physics
// rather than to the solver's own design rows.

interface Printer {
  pX: number
  pY: number
  psi: number
}
interface Scanner {
  eps: number
  sigma: number
}

// Percent read by the scale channel per degree of corner-angle error (and its inverse: degrees
// read by the skew channel per percent of anisotropy); see the derivation in scanCombiner.ts.
const Q = (100 * Math.PI) / 360

function synthScan(
  thetaDegrees: number,
  printer: Printer,
  scanner: Scanner,
  flipped = false,
  noise: { x?: number; y?: number; skew?: number } = {},
): AlignedResult {
  const t = (2 * thetaDegrees * Math.PI) / 180
  const c = Math.cos(t)
  const s = Math.sin(t)
  const h = flipped ? -1 : 1
  const rad = (thetaDegrees * Math.PI) / 180
  return alignedResult({
    plane: 'XY',
    xScalePercent: printer.pX + scanner.eps * c - Q * scanner.sigma * s + (noise.x ?? 0),
    yScalePercent: printer.pY - scanner.eps * c + Q * scanner.sigma * s + (noise.y ?? 0),
    skewDegrees:
      printer.psi + h * (scanner.sigma * c + (scanner.eps / Q) * s) + (noise.skew ?? 0),
    measuredPxPerMmX: 23.6,
    measuredPxPerMmY: 23.6,
    orientation: {
      flipped,
      originX: 0,
      originY: 0,
      xAxisX: Math.cos(rad),
      xAxisY: Math.sin(rad),
    },
  })
}

// --- Physics-forward generation: exact 2x2 matrices, measured through the real affine solver. ---

type M2 = [number, number, number, number] // row-major [a, b; c, d]
function matMul(m: M2, n: M2): M2 {
  return [
    m[0] * n[0] + m[1] * n[2],
    m[0] * n[1] + m[1] * n[3],
    m[2] * n[0] + m[3] * n[2],
    m[2] * n[1] + m[3] * n[3],
  ]
}
const degToRad = (d: number) => (d * Math.PI) / 180

/** Printer distortion in the coupon frame: per-axis scale percent, corner opened by psi degrees. */
function printerMatrix(p: Printer): M2 {
  const a = degToRad(p.psi)
  return [1 + p.pX / 100, -(1 + p.pY / 100) * Math.sin(a), 0, (1 + p.pY / 100) * Math.cos(a)]
}

/** Scanner distortion in the glass frame: +/-eps percent on the axes, corner opened sigma degrees. */
function scannerMatrix(s: Scanner): M2 {
  const a = degToRad(s.sigma)
  return matMul([1 + s.eps / 100, 0, 0, 1 - s.eps / 100], [1, -Math.sin(a), 0, Math.cos(a)])
}

/**
 * One physically composed scan: the printed grid, placed at theta on the glass (mirrored first
 * when scanned face-down), seen through the scanner distortion, and measured by the real affine
 * solver exactly as the pipeline measures a scan.
 */
function physicalScan(
  thetaDegrees: number,
  flipped: boolean,
  printer: Printer,
  scanner: Scanner,
): AlignedResult {
  const mirror: M2 = flipped ? [1, 0, 0, -1] : [1, 0, 0, 1]
  const t = degToRad(thetaDegrees)
  const rotation: M2 = [Math.cos(t), -Math.sin(t), Math.sin(t), Math.cos(t)]
  const total = matMul(
    scannerMatrix(scanner),
    matMul(rotation, matMul(mirror, printerMatrix(printer))),
  )
  const pxPerMm = 23.6
  const points: GridCorrespondence[] = []
  for (let row = 0; row < 5; row++)
    for (let col = 0; col < 5; col++) {
      const x = col * 25
      const y = row * 25
      points.push({
        col,
        row,
        nominalXmm: x,
        nominalYmm: y,
        measuredXpx: pxPerMm * (total[0] * x + total[1] * y),
        measuredYpx: pxPerMm * (total[2] * x + total[3] * y),
      })
    }
  const m = solveAffine(points)
  const norm = Math.hypot(m.a, m.c)
  return alignedResult({
    plane: 'XY',
    xScalePercent: (m.scaleXPxPerMm / pxPerMm - 1) * 100,
    yScalePercent: (m.scaleYPxPerMm / pxPerMm - 1) * 100,
    skewDegrees: m.skewDegrees,
    measuredPxPerMmX: m.scaleXPxPerMm,
    measuredPxPerMmY: m.scaleYPxPerMm,
    orientation: {
      flipped: m.a * m.d - m.b * m.c < 0,
      originX: 0,
      originY: 0,
      xAxisX: m.a / norm,
      xAxisY: m.c / norm,
    },
  })
}

const PRINTER: Printer = { pX: 0.31, pY: -0.42, psi: 0.12 }
const SCANNER: Scanner = { eps: 0.85, sigma: 0.06 }

// Deterministic standard-normal generator: mulberry32 PRNG feeding a Box-Muller transform.
function seededGaussian(seed: number): () => number {
  let a = seed >>> 0
  const uniform = () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
  return () => {
    const u = Math.max(uniform(), 1e-12)
    const v = uniform()
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v)
  }
}

describe('N-scan least-squares error separation', () => {
  it('two scans at exactly 0 and 90 reproduce the classic average/difference formulas', () => {
    const a = synthScan(0, PRINTER, SCANNER)
    const b = synthScan(90, PRINTER, SCANNER)
    const r = combineScanSet([a, b])
    expect(r.combined.xScalePercent).toBeCloseTo(0.5 * (a.xScalePercent + b.xScalePercent), 12)
    expect(r.combined.yScalePercent).toBeCloseTo(0.5 * (a.yScalePercent + b.yScalePercent), 12)
    expect(r.combined.skewDegrees).toBeCloseTo(0.5 * (a.skewDegrees + b.skewDegrees), 12)
    expect(r.scanner.anisotropyPercent).toBeCloseTo(
      0.5 * (a.xScalePercent - b.xScalePercent + (b.yScalePercent - a.yScalePercent)),
      12,
    )
    expect(r.scanner.skewDegrees).toBeCloseTo(0.5 * (a.skewDegrees - b.skewDegrees), 12)
    expect(r.rotationLooksValid).toBe(true)
    expect(r.uncertainty).toBeNull()
  })

  it('recovers ground truth from three scans at non-quarter turns', () => {
    const scans = [0, 50, 110].map((t) => synthScan(t, PRINTER, SCANNER))
    const r = combineScanSet(scans)
    // Three scans leave the skew channel without residual degrees of freedom, so no range yet.
    expect(r.uncertainty).toBeNull()
    expect(r.combined.xScalePercent).toBeCloseTo(PRINTER.pX, 9)
    expect(r.combined.yScalePercent).toBeCloseTo(PRINTER.pY, 9)
    expect(r.combined.skewDegrees).toBeCloseTo(PRINTER.psi, 9)
    expect(r.scanner.anisotropyPercent).toBeCloseTo(2 * SCANNER.eps, 9)
    expect(r.scanner.skewDegrees).toBeCloseTo(SCANNER.sigma, 9)
    expect(r.rotationLooksValid).toBe(true)
  })

  it('recovers ground truth from many scans at arbitrary angles', () => {
    const scans = [3, 47, 96, 139, 187, 232, 284, 331].map((t) => synthScan(t, PRINTER, SCANNER))
    const r = combineScanSet(scans)
    expect(r.combined.xScalePercent).toBeCloseTo(PRINTER.pX, 9)
    expect(r.combined.yScalePercent).toBeCloseTo(PRINTER.pY, 9)
    expect(r.combined.skewDegrees).toBeCloseTo(PRINTER.psi, 9)
    expect(r.scanner.anisotropyPercent).toBeCloseTo(2 * SCANNER.eps, 9)
    expect(r.scanner.skewDegrees).toBeCloseTo(SCANNER.sigma, 9)
  })

  // The decisive regression test for the design rows: nothing here is generated from the solver's
  // own model. Non-cardinal angles matter: at exact quarter turns the scanner terms cancel in
  // pairs and even wrongly signed coupling rows degenerate to a plain mean, hiding the defect.
  it.each([false, true])(
    'physics-forward: recovers the printer terms through the real affine solver (flipped=%s)',
    (flipped) => {
      // Small (realistic) scanner errors: the linearized model is exact only to first order, so
      // the recovery tolerance below reflects the quadratic truncation, not fit quality.
      const printer: Printer = { pX: 0.12, pY: -0.2, psi: 0.03 }
      const scanner: Scanner = { eps: 0.1, sigma: 0.02 }
      const scans = [10, 40, 75, 120, 155].map((t) => physicalScan(t, flipped, printer, scanner))
      const r = combineScanSet(scans)
      expect(r.rotationLooksValid).toBe(true)
      expect(r.flipMismatch).toBe(false)
      // The printer skew must come back with the affine solver's measured sign and magnitude.
      expect(r.combined.skewDegrees).toBeCloseTo(printer.psi, 4)
      expect(r.combined.xScalePercent).toBeCloseTo(printer.pX, 3)
      expect(r.combined.yScalePercent).toBeCloseTo(printer.pY, 3)
      expect(r.scanner.anisotropyPercent).toBeCloseTo(2 * scanner.eps, 3)
      // The scanner shear diagnostic keeps the classic quarter-turn sign: positive = glass corner
      // opened, equal to half the skew difference between a 0- and a 90-degree scan.
      expect(r.scanner.skewDegrees).toBeCloseTo(scanner.sigma, 3)
    },
  )

  it('recovers the printer terms from an all-mirrored scan set', () => {
    const scans = [10, 75, 140].map((t) => synthScan(t, PRINTER, SCANNER, true))
    const r = combineScanSet(scans)
    expect(r.flipMismatch).toBe(false)
    expect(r.rotationLooksValid).toBe(true)
    expect(r.combined.xScalePercent).toBeCloseTo(PRINTER.pX, 9)
    expect(r.combined.yScalePercent).toBeCloseTo(PRINTER.pY, 9)
    expect(r.combined.skewDegrees).toBeCloseTo(PRINTER.psi, 9)
  })

  it('a set of nearly equal angles (modulo 180) is invalid with means as fallback', () => {
    const scans = [0, 4, 182].map((t) => synthScan(t, PRINTER, SCANNER))
    const r = combineScanSet(scans)
    expect(r.rotationLooksValid).toBe(false)
    expect(r.failureReason).toMatch(/degrees apart/)
    const meanX = scans.reduce((s, x) => s + x.xScalePercent, 0) / scans.length
    expect(r.combined.xScalePercent).toBeCloseTo(meanX, 12)
    expect(r.uncertainty).toBeNull()
  })

  it('a mixed-handedness set is a flip mismatch with a failure reason', () => {
    const r = combineScanSet([
      synthScan(0, PRINTER, SCANNER, false),
      synthScan(90, PRINTER, SCANNER, true),
    ])
    expect(r.flipMismatch).toBe(true)
    expect(r.rotationLooksValid).toBe(false)
    expect(r.failureReason).toMatch(/mirror/)
  })

  it('uncertainty needs at least four scans (skew channel degrees of freedom)', () => {
    const three = combineScanSet([0, 50, 110].map((t) => synthScan(t, PRINTER, SCANNER)))
    expect(three.uncertainty).toBeNull()
    const four = combineScanSet([0, 50, 110, 160].map((t) => synthScan(t, PRINTER, SCANNER)))
    expect(four.uncertainty).not.toBeNull()
    expect(four.uncertainty!.confidenceLevel).toBe(0.95)
    expect(four.uncertainty!.scanCount).toBe(4)
  })

  it('uncertainty is near zero on noise-free input and grows with noise', () => {
    const clean = combineScanSet([0, 50, 110, 160].map((t) => synthScan(t, PRINTER, SCANNER)))
    expect(clean.uncertainty).not.toBeNull()
    expect(clean.uncertainty!.scaleX.standardError).toBeLessThan(1e-9)
    expect(clean.uncertainty!.skew.standardError).toBeLessThan(1e-9)
    expect(clean.uncertainty!.scaleX.rangeHalfWidth).toBeLessThan(1e-9)

    const noises = [0.05, -0.04, 0.03, -0.02]
    const noisy = combineScanSet(
      [0, 50, 110, 160].map((t, i) =>
        synthScan(t, PRINTER, SCANNER, false, { x: noises[i], y: -noises[i], skew: noises[i] }),
      ),
    )
    expect(noisy.uncertainty!.scaleX.standardError).toBeGreaterThan(
      clean.uncertainty!.scaleX.standardError,
    )
    expect(noisy.uncertainty!.scaleX.standardError).toBeLessThan(0.2)
    expect(noisy.uncertainty!.skew.standardError).toBeGreaterThan(0)
    // The range half-width is the t critical value at the channel's hat-trace effective dof times
    // the standard error.
    expect(noisy.uncertainty!.scaleX.rangeHalfWidth).toBeCloseTo(
      tQuantile(0.975, noisy.uncertainty!.scaleDof) * noisy.uncertainty!.scaleX.standardError,
      12,
    )
    expect(noisy.uncertainty!.skew.rangeHalfWidth).toBeCloseTo(
      tQuantile(0.975, noisy.uncertainty!.skewDof) * noisy.uncertainty!.skew.standardError,
      12,
    )
    // The noisy fit must still land near the truth.
    expect(noisy.combined.xScalePercent).toBeCloseTo(PRINTER.pX, 1)
    expect(noisy.combined.skewDegrees).toBeCloseTo(PRINTER.psi, 1)
  })

  it('the skew range keeps its own units: large scale noise does not inflate it', () => {
    // Big percent-channel noise, tiny degree-channel noise. A pooled residual variance would smear
    // the scale noise into the skew standard error; the grouped-variance fit must not.
    const angles = [0, 30, 60, 90, 120, 150]
    const scaleNoise = [0.6, -0.5, 0.4, -0.55, 0.45, -0.35]
    const skewNoise = [0.002, -0.0015, 0.001, -0.002, 0.0018, -0.001]
    const r = combineScanSet(
      angles.map((t, i) =>
        synthScan(t, PRINTER, SCANNER, false, {
          x: scaleNoise[i],
          y: -scaleNoise[i],
          skew: skewNoise[i],
        }),
      ),
    )
    expect(r.uncertainty).not.toBeNull()
    expect(r.uncertainty!.scaleX.rangeHalfWidth).toBeGreaterThan(0.1)
    expect(r.uncertainty!.skew.rangeHalfWidth).toBeLessThan(0.05)
  })

  it.each([4, 5, 6, 8])(
    'the channel effective dofs partition the total residual dof 3N - 5 (N = %s)',
    (count) => {
      const angles = Array.from({ length: count }, (_, i) => (i * 180) / count + 3)
      const gauss = seededGaussian(7)
      const r = combineScanSet(
        angles.map((t) =>
          synthScan(t, PRINTER, SCANNER, false, {
            x: 0.05 * gauss(),
            y: 0.05 * gauss(),
            skew: 0.02 * gauss(),
          }),
        ),
      )
      const u = r.uncertainty!
      expect(u.scaleDof).toBeGreaterThan(0)
      expect(u.skewDof).toBeGreaterThan(0)
      expect(u.scaleDof + u.skewDof).toBeCloseTo(3 * count - 5, 9)
    },
  )

  it('the 95% range covers the ground truth in the large majority of seeded noisy sets', () => {
    const angles = [0, 30, 60, 90, 120, 150]
    const seeds = Array.from({ length: 40 }, (_, i) => i + 1)
    let covered = 0
    let total = 0
    for (const seed of seeds) {
      const gauss = seededGaussian(seed)
      const r = combineScanSet(
        angles.map((t) =>
          synthScan(t, PRINTER, SCANNER, false, {
            x: 0.05 * gauss(),
            y: 0.05 * gauss(),
            skew: 0.02 * gauss(),
          }),
        ),
      )
      const u = r.uncertainty!
      const checks: Array<[number, number, number]> = [
        [r.combined.xScalePercent, PRINTER.pX, u.scaleX.rangeHalfWidth],
        [r.combined.yScalePercent, PRINTER.pY, u.scaleY.rangeHalfWidth],
        [r.combined.skewDegrees, PRINTER.psi, u.skew.rangeHalfWidth],
      ]
      for (const [estimate, truth, half] of checks) {
        total++
        if (Math.abs(estimate - truth) <= half) covered++
      }
    }
    // Nominal coverage is 95%; demand a comfortable majority so the test is stable across seeds.
    expect(covered / total).toBeGreaterThanOrEqual(0.85)
  })

  it('reports the measured angles and their spread', () => {
    const r = combineScanSet([synthScan(2, PRINTER, SCANNER), synthScan(92, PRINTER, SCANNER)])
    expect(r.scanAnglesDegrees[0]).toBeCloseTo(2, 6)
    expect(r.scanAnglesDegrees[1]).toBeCloseTo(92, 6)
    expect(r.angleSpreadDegrees).toBeCloseTo(90, 6)
  })

  it('refuses fewer than two scans', () => {
    expect(() => combineScanSet([synthScan(0, PRINTER, SCANNER)])).toThrow(/at least two/)
  })
})

describe('Student-t quantile', () => {
  it('matches tabulated two-sided 95% critical values', () => {
    expect(tQuantile(0.975, 2)).toBeCloseTo(4.30265, 4)
    expect(tQuantile(0.975, 5)).toBeCloseTo(2.57058, 4)
  })

  it('is symmetric and centered', () => {
    expect(tQuantile(0.5, 7)).toBe(0)
    expect(tQuantile(0.025, 5)).toBeCloseTo(-2.57058, 4)
  })
})

describe('angle helpers', () => {
  it('turn spread folds angles modulo 180', () => {
    expect(turnSpreadDegrees([0, 180])).toBeCloseTo(0, 9)
    expect(turnSpreadDegrees([0, 90])).toBeCloseTo(90, 9)
    expect(turnSpreadDegrees([10, 55])).toBeCloseTo(45, 9)
    expect(turnSpreadDegrees([0, 7])).toBeCloseTo(7, 9)
    expect(turnSpreadDegrees([350, 5])).toBeCloseTo(15, 9)
  })

  it('quadrant coverage counts distinct nearest cardinal directions', () => {
    expect(quadrantsCovered([5, 50])).toBe(2)
    expect(quadrantsCovered([5, 95])).toBe(2)
    expect(quadrantsCovered([5, 95, 185])).toBe(3)
    expect(quadrantsCovered([5, 95, 185, 275])).toBe(4)
    expect(quadrantsCovered([360.0, 269.5, 0.2, 89.2, 180.6, 270.5, 2.1, 270.0])).toBe(4)
  })

  it('normalizeAngle folds into [0, 360) including 360 itself', () => {
    expect(normalizeAngle(360)).toBe(0)
    expect(normalizeAngle(-90)).toBe(270)
    expect(normalizeAngle(0.2)).toBeCloseTo(0.2, 12)
  })
})
