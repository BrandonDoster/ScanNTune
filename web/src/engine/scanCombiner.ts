import { Matrix, inverse, solve } from 'ml-matrix'
import type { AlignedResult, CombineUncertainty, ScanSetResult } from './types'
import { xAxisAngleDegrees } from './types'
import { tQuantile } from './studentT'

// Separates the printer's error from the scanner's over N scans of one plate taken at different
// placement angles on the glass. The printer terms (scale along the coupon's two axes, skew) are
// fixed to the coupon; the scanner terms (anisotropy and shear, fixed to the glass axes) rotate
// through the coupon-frame measurements with the second harmonic of the placement angle theta.
// This is the multi-orientation least-squares error separation of Evans, Hocken and Estler,
// "Self-Calibration: Reversal, Redundancy, Error Separation and Absolute Testing", CIRP Annals
// 45(2), 1996. The scanner's small distortion is one symmetric traceless tensor with two
// components: the diagonal part (anisotropy eps, half the X-vs-Y percent difference) and the
// off-diagonal part (shear sigma, the glass corner-angle error in degrees). Conjugating that
// tensor by the placement rotation mixes the two components with the second harmonic of theta, so
// BOTH components appear in BOTH measurement channels, converted between the channels' units: a
// corner-angle error of sigma degrees is an off-diagonal tensor component of sigma * pi/360
// (radians, half-angle), which the scale channel reads as q = 100*pi/360 percent per degree;
// conversely the skew channel reads eps percent as 1/q degrees per percent. Per scan i, with
// c = cos(2 theta_i), s = sin(2 theta_i):
//   xerr_i  = pX + eps*c - q*sigma*s
//   yerr_i  = pY - eps*c + q*sigma*s
//   skew_i  = psi + h_i*(sigma*c + (1/q)*eps*s)
// Unknowns: printer scales pX, pY, printer skew psi, scanner anisotropy eps, scanner shear sigma.
// h_i is +1 for a normal scan and -1 for a mirror-flipped one: mirroring conjugates the scanner
// tensor with a reflection, which leaves the diagonal (scale) terms alone and negates the
// off-diagonal (skew) term. Least squares over the 3N observations solves the five unknowns; N = 2
// determines the printer terms exactly and reproduces the classic quarter-turn average/difference
// at theta = 0 and 90 (sigma keeps that classic convention: half the skew difference between the
// 0- and 90-degree scans, positive = glass corner opened). These coefficients are pinned by a
// physics-forward regression test that composes the full matrix product (scanner * rotation *
// mirror * printer) and measures it through the real affine solver (nScanCombiner.spec.ts). Only
// anisotropy and skew separate this way; the common isotropic scale still needs the DPI reference.

// Unit conversion between the two observation channels: an off-diagonal (shear) tensor component
// reads as q percent in the scale channel per degree of corner-angle error, and 1/q degrees in the
// skew channel per percent of anisotropy.
const Q_PERCENT_PER_DEGREE = (100 * Math.PI) / 360

// Minimum spread between placement angles (degrees of physical turn, folded so that turns equal
// modulo 180 count as the same) for the separation to be well conditioned. The scanner terms move
// with 2*theta, so the usable separation between two scans grows as sin of twice their spread; at
// 15 degrees that factor is 0.5, keeping the error amplification of the fit below 2.
export const MIN_TURN_SPREAD_DEGREES = 15.0

export function combineScanSet(scans: AlignedResult[]): ScanSetResult {
  if (scans.length < 2)
    throw new Error(`combineScanSet needs at least two scans, got ${scans.length}.`)

  const angles = scans.map((s) => normalizeAngle(xAxisAngleDegrees(s.orientation)))
  const spread = turnSpreadDegrees(angles)
  const flipMismatch = scans.some((s) => s.orientation.flipped !== scans[0].orientation.flipped)
  const spreadOk = spread >= MIN_TURN_SPREAD_DEGREES
  const rotationLooksValid = !flipMismatch && spreadOk

  const failureReason = flipMismatch
    ? 'One scan is mirror-flipped relative to the others, so the scans cannot be combined. Rescan the plate the same way up each time.'
    : !spreadOk
      ? `These scans are only ${spread.toFixed(0)} degrees apart. Turn the plate roughly a quarter turn and scan it again.`
      : null

  // When the set cannot be separated (degenerate angles, or mixed handedness), the least-squares
  // system is ill conditioned or wrongly signed. Fall back to the plain per-scan means so the
  // caller still gets numbers to display, flagged invalid with the reason above.
  const fit = rotationLooksValid ? solveErrorSeparation(scans, angles) : null

  const printerX = fit ? fit.pX : mean(scans.map((s) => s.xScalePercent))
  const printerY = fit ? fit.pY : mean(scans.map((s) => s.yScalePercent))
  const printerSkew = fit ? fit.psi : mean(scans.map((s) => s.skewDegrees))

  // Carry the detection of the weakest scan of the set, so ringsDetected (the set's worst tally)
  // always agrees with the rings array it travels with.
  const weakest = scans.reduce((w, s) => (s.ringsDetected < w.ringsDetected ? s : w))
  const combined: AlignedResult = {
    rings: weakest.rings,
    ringsDetected: weakest.ringsDetected,
    ringsExpected: scans[0].ringsExpected,
    clippedSides: [],
    aligned: true,
    failureReason: null,
    orientation: scans[0].orientation,
    plane: scans[0].plane,
    measuredPxPerMmX: mean(scans.map((s) => s.measuredPxPerMmX)),
    measuredPxPerMmY: mean(scans.map((s) => s.measuredPxPerMmY)),
    skewDegrees: printerSkew,
    rmsResidualPx: Math.max(...scans.map((s) => s.rmsResidualPx)),
    xScalePercent: printerX,
    yScalePercent: printerY,
  }

  return {
    combined,
    // The diagnostic reports the scanner's X-vs-Y percent difference (2*eps) and its shear angle,
    // matching the classic quarter-turn half-difference figures at theta = 0 and 90.
    scanner: fit
      ? { anisotropyPercent: 2 * fit.eps, skewDegrees: fit.sigma }
      : { anisotropyPercent: 0, skewDegrees: 0 },
    scans,
    scanAnglesDegrees: angles,
    angleSpreadDegrees: spread,
    rotationLooksValid,
    flipMismatch,
    failureReason,
    uncertainty: fit?.uncertainty ?? null,
  }
}

/** Two-scan convenience over combineScanSet, kept for the classic quarter-turn pair. */
export function combineScans(scanA: AlignedResult, scanB: AlignedResult): ScanSetResult {
  return combineScanSet([scanA, scanB])
}

interface SeparationFit {
  pX: number
  pY: number
  psi: number
  eps: number
  sigma: number
  uncertainty: CombineUncertainty | null
}

/** Confidence level of the reported range half-widths. */
export const RANGE_CONFIDENCE_LEVEL = 0.95

/**
 * Minimum scans of a plate for a confidence range: N = 4 is the first set where the skew channel
 * keeps a usable effective degree of freedom (about 1.7 by the hat-matrix trace at typical angle
 * spreads) after the five fitted unknowns take their share.
 */
export const MIN_SCANS_FOR_RANGE = 4

// The observation vector mixes two channels with different units and different noise levels: per
// scan, two scale rows (percent) and one skew row (degrees). Row layout below: scan i contributes
// rows 3i and 3i+1 (scale) and row 3i+2 (skew).
const isSkewRow = (rowIndex: number): boolean => rowIndex % 3 === 2

// Least squares over the 3N observations for the five unknowns [pX, pY, psi, eps, sigma]: an
// ordinary least-squares fit first; with enough scans, a refit by feasible generalized least
// squares (iterated Aitken estimator with grouped variances), so the percent and degree channels
// are weighted by their own noise instead of pooled across units, with each channel's residual
// variance normalized by its hat-matrix-trace effective degrees of freedom.
function solveErrorSeparation(scans: AlignedResult[], anglesDegrees: number[]): SeparationFit {
  const n = scans.length
  const rows: number[][] = []
  const obs: number[] = []
  for (let i = 0; i < n; i++) {
    const t = (2 * anglesDegrees[i] * Math.PI) / 180
    const c = Math.cos(t)
    const s = Math.sin(t)
    const h = scans[i].orientation.flipped ? -1 : 1
    rows.push([1, 0, 0, c, -Q_PERCENT_PER_DEGREE * s])
    obs.push(scans[i].xScalePercent)
    rows.push([0, 1, 0, -c, Q_PERCENT_PER_DEGREE * s])
    obs.push(scans[i].yScalePercent)
    rows.push([0, 0, 1, (h * s) / Q_PERCENT_PER_DEGREE, h * c])
    obs.push(scans[i].skewDegrees)
  }
  const design = new Matrix(rows)
  const y = Matrix.columnVector(obs)
  let beta = solve(design, y, true)
  let uncertainty: CombineUncertainty | null = null

  if (n >= MIN_SCANS_FOR_RANGE) {
    // Numerical floor only: an exactly zero residual (synthetic input) would make the channel
    // weight infinite. Far below any measurable variance, so it never influences a real fit.
    const VARIANCE_FLOOR = 1e-24
    let s2Scale = 1
    let s2Skew = 1

    // One weighted fit at the current channel variances. Solved through the square-root-weight
    // scaled system, whose normal-matrix inverse is exactly the GLS covariance (X^T W X)^-1 with
    // W = diag(1/s2_channel). Each channel's residual degrees of freedom come from the hat-matrix
    // trace (Seber and Lee, Linear Regression Analysis): with row leverage
    // h_i = w_i * x_i^T (X^T W X)^-1 x_i, dof_channel = n_channel - sum of h_i over the channel's
    // rows. The leverages sum to the parameter count (tr(H) = 5), so the two dofs sum to 3N - 5.
    const weightedFit = () => {
      const w = rows.map((_, i) => 1 / (isSkewRow(i) ? s2Skew : s2Scale))
      const designW = new Matrix(rows.map((row, i) => row.map((v) => v * Math.sqrt(w[i]))))
      const yW = Matrix.columnVector(obs.map((v, i) => v * Math.sqrt(w[i])))
      beta = solve(designW, yW, true)
      const covariance = inverse(designW.transpose().mmul(designW))
      let traceScale = 0
      let traceSkew = 0
      rows.forEach((row, i) => {
        let h = 0
        for (let a = 0; a < row.length; a++)
          for (let b = 0; b < row.length; b++) h += row[a] * covariance.get(a, b) * row[b]
        h *= w[i]
        if (isSkewRow(i)) traceSkew += h
        else traceScale += h
      })
      return { covariance, dofScale: 2 * n - traceScale, dofSkew: n - traceSkew }
    }

    // Feasible generalized least squares with grouped variances (iterated Aitken estimator, a
    // MINQUE/REML-type moment correction): fit with the current channel weights, re-estimate each
    // channel's residual variance as its RSS over its effective degrees of freedom, and repeat
    // until the variances stabilize. Iterating matters because the channels share the eps and
    // sigma unknowns: a single OLS-seeded pass lets a noisy channel contaminate the other
    // channel's residuals through them.
    let fit = weightedFit()
    for (let iter = 0; iter < 50; iter++) {
      const residuals = Matrix.sub(y, design.mmul(beta)).to1DArray()
      let rssScale = 0
      let rssSkew = 0
      residuals.forEach((r, i) => (isSkewRow(i) ? (rssSkew += r * r) : (rssScale += r * r)))
      const nextScale = Math.max(rssScale / Math.max(fit.dofScale, 1e-6), VARIANCE_FLOOR)
      const nextSkew = Math.max(rssSkew / Math.max(fit.dofSkew, 1e-6), VARIANCE_FLOOR)
      const converged =
        Math.abs(nextScale - s2Scale) <= 1e-12 * s2Scale &&
        Math.abs(nextSkew - s2Skew) <= 1e-12 * s2Skew
      s2Scale = nextScale
      s2Skew = nextSkew
      fit = weightedFit()
      if (converged) break
    }

    // 95% range half-width per figure: Student-t critical value at the figure's dominant channel's
    // effective degrees of freedom times its standard error. (A Satterthwaite 1946 combination of
    // the channel dofs would refine the shared eps/sigma influence; the dominant-channel dof is
    // the simple established choice.) The typical four-scan set leaves the skew channel about 1.7
    // effective dof, so the gate asks for at least one degree of freedom per channel; the t
    // interval is defined for any positive dof and is honestly wide when the dof is small.
    if (fit.dofScale >= 1 && fit.dofSkew >= 1) {
      const p = 0.5 + RANGE_CONFIDENCE_LEVEL / 2
      const tScale = tQuantile(p, fit.dofScale)
      const tSkew = tQuantile(p, fit.dofSkew)
      const figure = (index: number, t: number) => {
        const standardError = Math.sqrt(fit.covariance.get(index, index))
        return { standardError, rangeHalfWidth: t * standardError }
      }
      uncertainty = {
        scaleX: figure(0, tScale),
        scaleY: figure(1, tScale),
        skew: figure(2, tSkew),
        scaleDof: fit.dofScale,
        skewDof: fit.dofSkew,
        confidenceLevel: RANGE_CONFIDENCE_LEVEL,
        scanCount: n,
      }
    }
  }

  const [pX, pY, psi, eps, sigma] = beta.to1DArray()
  return { pX, pY, psi, eps, sigma, uncertainty }
}

/** Signed-free turn from A's +X to B's +X, folded into [0, 360). */
export function turnBetween(angleADegrees: number, angleBDegrees: number): number {
  const diff = (angleBDegrees - angleADegrees) % 360.0
  return diff < 0 ? diff + 360.0 : diff
}

/** Folds an angle into [0, 360). */
export function normalizeAngle(degrees: number): number {
  const a = degrees % 360.0
  return a < 0 ? a + 360.0 : a
}

/**
 * Largest pairwise separation between placement angles in the error-separation sense: the scanner
 * terms repeat every 180 degrees of physical turn, so the separation between two angles is their
 * distance on the doubled-angle circle, halved. Result in degrees, 0 (all angles equal modulo 180)
 * to 90 (a quarter turn apart).
 */
export function turnSpreadDegrees(anglesDegrees: number[]): number {
  let max = 0
  for (let i = 0; i < anglesDegrees.length; i++) {
    for (let j = i + 1; j < anglesDegrees.length; j++) {
      const d = Math.abs(((anglesDegrees[j] - anglesDegrees[i]) * 2) % 360)
      const circular = Math.min(d, 360 - d) / 2
      if (circular > max) max = circular
    }
  }
  return max
}

/** How many of the four cardinal turn directions (nearest 90-degree step) the scans cover. */
export function quadrantsCovered(anglesDegrees: number[]): number {
  const seen = new Set<number>()
  for (const a of anglesDegrees) seen.add(Math.round(normalizeAngle(a) / 90) % 4)
  return seen.size
}

function mean(values: number[]): number {
  return values.reduce((sum, v) => sum + v, 0) / values.length
}
