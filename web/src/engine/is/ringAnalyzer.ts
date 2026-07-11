import { Matrix, solve, inverse } from 'ml-matrix'
import type { TracedLine } from './lineTracer'

// Fits the ringing model to a traced line and pools the per-line fits into a per-axis
// estimate, with refusal gates at every step. The stages, each an established method:
//
// 1. Detrend: a Gaussian regression filter (ISO 16610-21 profile filtering), the standard
//    surface-metrology separation of waviness from the signal band. The cutoff is placed a
//    factor 3 below the lowest search frequency, where the filter's Gaussian transmission
//    leaves the ring band untouched (transmission of the trend at 3x the cutoff is
//    0.5^9 ~ 0.2%) while absorbing scanner transport waviness and straightness drift.
// 2. Frequency seed: maximization of the periodogram evaluated on a dense frequency grid
//    (Rife & Boorstyn 1974, the maximum-likelihood frequency estimator for a sinusoid in
//    white Gaussian noise), with the direct DTFT sums handling the slightly non-uniform
//    sample times inside the acceleration ramp.
// 3. Refinement: Levenberg-Marquardt nonlinear least squares (Levenberg 1944, Marquardt
//    1963; damped Gauss-Newton with multiplicative lambda control as in Madsen, Nielsen &
//    Tingleff, "Methods for Non-Linear Least Squares Problems") over all seven model
//    parameters, with a forward-difference Jacobian and ml-matrix for the linear solves.
// 4. Uncertainty: the asymptotic covariance of the nonlinear least-squares estimate,
//    sigma^2 (J^T J)^-1 (Seber & Wild, "Nonlinear Regression", 1989), which for Gaussian
//    noise attains the Cramer-Rao bound of the damped-sinusoid model (Yao & Pandit, IEEE
//    Trans. Signal Processing 43(11), 1995).
//
// Model: lateral(t) = A * exp(-t / tauL)                                (corner settle lobe)
//                   + B * exp(-2 pi f zeta t) * cos(2 pi f sqrt(1 - zeta^2) t + phi)
//                   + C
// with t the time since the corner. The damped cosine is the free response of the
// second-order underdamped machine axis; the single-exponential lobe absorbs the corner
// overshoot settle that is not part of the resonance.

export const F_MIN_HZ = 20
export const F_MAX_HZ = 150
/** Grid step of the periodogram seed search. */
export const PERIODOGRAM_GRID_HZ = 0.5
/**
 * At-bounds margin: two periodogram grid steps. A true resonance just outside the search
 * range seeds at the range edge and the refinement follows it back to the boundary region,
 * so anything within two seed-grid steps of an edge is treated as "at the bound" rather than
 * a trustworthy interior optimum.
 */
export const BOUND_MARGIN_HZ = 2 * PERIODOGRAM_GRID_HZ
export const ZETA_MIN = 0.001
export const ZETA_MAX = 0.4
/**
 * Detection threshold: the fitted ring amplitude must exceed this multiple of the noise
 * floor RMS. The envelope of Gaussian noise is Rayleigh distributed (Rice 1944); it exceeds
 * 4 sigma with probability exp(-8) ~ 3e-4 per independent sample, so an amplitude at 4x the
 * noise RMS is a detection rather than a noise excursion, with margin over the plain
 * 3-sigma rule.
 */
export const AMPLITUDE_DETECTION_K = 4
/** Minimum coefficient of determination of the model fit on the detrended trace. */
export const MIN_R2 = 0.5
/** Minimum accepted line fits per axis before pooling is meaningful. */
export const MIN_ACCEPTED_LINES = 3
/**
 * Replicate agreement and speed invariance tolerance: the larger of 2 Hz and 5% of the
 * median frequency. Klipper-style input shapers keep their vibration suppression within
 * roughly +/-5-10% of the target frequency, so replicates scattered wider than 5% would
 * already defeat the shaper the result is meant to configure.
 */
const AGREEMENT_REL = 0.05
const AGREEMENT_MIN_HZ = 2
/**
 * Confidence gate: the pooled 95% confidence halfwidth must stay under 10% of the
 * frequency. The EI shaper family suppresses vibration below its 5% tolerance only within
 * roughly +/-10-15% of its target frequency, so a wider interval cannot guarantee the true
 * resonance lies inside the configured shaper's stopband.
 */
const MAX_CI95_REL = 0.1
/** Normal-consistency factor for the MAD (sigma = 1.4826 * MAD for Gaussian data). */
const MAD_TO_SIGMA = 1.4826
/** Asymptotic standard error of the median is 1.2533 * sigma / sqrt(n) for Gaussian data. */
const MEDIAN_EFFICIENCY = 1.2533

export interface RingModelParams {
  lobeAmpMm: number
  lobeTauS: number
  ringAmpMm: number
  frequencyHz: number
  dampingRatio: number
  phaseRad: number
  offsetMm: number
}

export interface LineFit {
  accepted: boolean
  refusalReason: string | null
  params: RingModelParams | null
  r2: number
  noiseRmsMm: number
  /** Cramer-Rao standard error of the frequency, Hz (asymptotic NLS covariance). */
  frequencySeHz: number | null
}

export interface AxisPool {
  accepted: boolean
  refusals: string[]
  frequencyHz: number | null
  dampingRatio: number | null
  /** 95% confidence halfwidth of the pooled frequency, Hz. */
  frequencyCi95Hz: number | null
  amplitudeMm: number | null
  linesUsed: number
}

/** The ringing model evaluated at time t (seconds since the corner). */
export function ringModel(p: RingModelParams, t: number): number {
  const omega = 2 * Math.PI * p.frequencyHz
  const damped = omega * Math.sqrt(Math.max(0, 1 - p.dampingRatio * p.dampingRatio))
  return (
    p.lobeAmpMm * Math.exp(-t / Math.max(p.lobeTauS, 1e-6)) +
    p.ringAmpMm * Math.exp(-omega * p.dampingRatio * t) * Math.cos(damped * t + p.phaseRad) +
    p.offsetMm
  )
}

/**
 * Gaussian regression filter trend (ISO 16610-21 style, zeroth order): a Gaussian-weighted
 * moving average with per-sample weight normalization (the regression form, which keeps the
 * trend unbiased at the profile ends). `cutoffS` is the period at which the trend's
 * transmission is 50%; alpha = sqrt(ln 2 / pi) per the standard.
 */
export function gaussianTrend(tS: Float64Array, y: Float64Array, cutoffS: number): Float64Array {
  const n = y.length
  const alpha = Math.sqrt(Math.log(2) / Math.PI)
  const denom = alpha * cutoffS
  const trend = new Float64Array(n)
  for (let i = 0; i < n; i++) {
    let w = 0
    let s = 0
    for (let j = 0; j < n; j++) {
      const u = (tS[j] - tS[i]) / denom
      const wk = Math.exp(-Math.PI * u * u)
      w += wk
      s += wk * y[j]
    }
    trend[i] = s / w
  }
  return trend
}

/** Periodogram-maximization frequency seed (Rife & Boorstyn 1974) on a dense grid. */
function seedFrequency(tS: Float64Array, y: Float64Array): { fHz: number; phase: number; amp: number } {
  const n = y.length
  let bestF = F_MIN_HZ
  let bestP = -1
  let bestRe = 0
  let bestIm = 0
  for (let f = F_MIN_HZ; f <= F_MAX_HZ; f += PERIODOGRAM_GRID_HZ) {
    const w = 2 * Math.PI * f
    let re = 0
    let im = 0
    for (let k = 0; k < n; k++) {
      re += y[k] * Math.cos(w * tS[k])
      im -= y[k] * Math.sin(w * tS[k])
    }
    const p = re * re + im * im
    if (p > bestP) {
      bestP = p
      bestF = f
      bestRe = re
      bestIm = im
    }
  }
  return {
    fHz: bestF,
    phase: Math.atan2(bestIm, bestRe),
    amp: (2 * Math.sqrt(bestP)) / n,
  }
}

const PARAM_COUNT = 7

function vectorToParams(v: number[]): RingModelParams {
  return {
    lobeAmpMm: v[0],
    lobeTauS: v[1],
    ringAmpMm: v[2],
    frequencyHz: v[3],
    dampingRatio: v[4],
    phaseRad: v[5],
    offsetMm: v[6],
  }
}

function residuals(v: number[], tS: Float64Array, y: Float64Array): Float64Array {
  const p = vectorToParams(v)
  const r = new Float64Array(y.length)
  for (let i = 0; i < y.length; i++) r[i] = y[i] - ringModel(p, tS[i])
  return r
}

function ssr(r: Float64Array): number {
  let s = 0
  for (let i = 0; i < r.length; i++) s += r[i] * r[i]
  return s
}

/**
 * Levenberg-Marquardt refinement of all model parameters (multiplicative lambda control,
 * forward-difference Jacobian). Returns the refined parameter vector and the Jacobian at the
 * solution for the covariance estimate.
 */
function levenbergMarquardt(
  v0: number[],
  tS: Float64Array,
  y: Float64Array,
): { v: number[]; jacobian: Matrix; ssr: number } {
  let v = v0.slice()
  let r = residuals(v, tS, y)
  let cost = ssr(r)
  let lambda = 1e-3
  let jac = numericJacobian(v, tS, y)

  for (let iter = 0; iter < 200; iter++) {
    const J = jac
    const JtJ = J.transpose().mmul(J)
    const Jtr = J.transpose().mmul(Matrix.columnVector(Array.from(r)))
    // Marquardt scaling: damp by lambda times the diagonal of JtJ.
    const damped = JtJ.clone()
    for (let i = 0; i < PARAM_COUNT; i++) {
      damped.set(i, i, JtJ.get(i, i) * (1 + lambda) + 1e-12)
    }
    let step: number[]
    try {
      step = solve(damped, Jtr).to1DArray()
    } catch {
      // A singular normal matrix at this damping: raise lambda and retry next iteration.
      lambda *= 10
      if (lambda > 1e12) break
      continue
    }
    const trial = v.map((vi, i) => vi + step[i])
    const rTrial = residuals(trial, tS, y)
    const costTrial = ssr(rTrial)
    if (costTrial < cost) {
      const improvement = (cost - costTrial) / Math.max(cost, 1e-300)
      v = trial
      r = rTrial
      cost = costTrial
      lambda = Math.max(lambda / 10, 1e-12)
      jac = numericJacobian(v, tS, y)
      if (improvement < 1e-10) break
    } else {
      lambda *= 10
      if (lambda > 1e12) break
    }
  }
  return { v, jacobian: jac, ssr: cost }
}

// Forward-difference Jacobian of the model (not the residual: d r / d p = -d model / d p,
// and the sign cancels in the normal equations as written above with r = y - model).
function numericJacobian(v: number[], tS: Float64Array, y: Float64Array): Matrix {
  const n = y.length
  const base = residuals(v, tS, y)
  const J = Matrix.zeros(n, PARAM_COUNT)
  for (let j = 0; j < PARAM_COUNT; j++) {
    const h = Math.max(1e-7, Math.abs(v[j]) * 1e-6)
    const vh = v.slice()
    vh[j] += h
    const rh = residuals(vh, tS, y)
    for (let i = 0; i < n; i++) J.set(i, j, (base[i] - rh[i]) / h)
  }
  return J
}

/** RMS of a slice. */
function rms(y: Float64Array, from: number, to: number): number {
  let s = 0
  let c = 0
  for (let i = from; i < to; i++) {
    s += y[i] * y[i]
    c++
  }
  return c > 0 ? Math.sqrt(s / c) : 0
}

function medianOf(values: number[]): number {
  const sorted = values.slice().sort((a, b) => a - b)
  const n = sorted.length
  if (n === 0) return 0
  return n % 2 === 1 ? sorted[(n - 1) / 2] : (sorted[n / 2 - 1] + sorted[n / 2]) / 2
}

/** Analyzes one traced line: detrend, seed, LM fit, and the per-line refusal gates. */
export function analyzeTracedLine(line: TracedLine): LineFit {
  const tS = line.tS
  const n = tS.length

  // Detrend with the Gaussian regression filter; the cutoff period sits a factor 3 below the
  // lowest search frequency so the trend cannot eat the ring band.
  const cutoffS = 3 / F_MIN_HZ
  const trend = gaussianTrend(tS, line.lateralMm, cutoffS)
  const y = new Float64Array(n)
  for (let i = 0; i < n; i++) y[i] = line.lateralMm[i] - trend[i]

  const noiseRmsMm = rms(y, line.noiseWindowStart, n)

  // Seeds: periodogram frequency/phase/amplitude, nominal damping, small lobe.
  const seed = seedFrequency(tS, y)
  const v0 = [
    y[0] - seed.amp * Math.cos(seed.phase), // lobe amplitude
    0.02, // lobe time constant, s
    seed.amp,
    seed.fHz,
    0.05,
    seed.phase,
    0,
  ]

  const fit = levenbergMarquardt(v0, tS, y)
  const params = vectorToParams(fit.v)
  // A cosine fit is sign-ambiguous (B, phi) <-> (-B, phi + pi); normalize to positive amplitude.
  if (params.ringAmpMm < 0) {
    params.ringAmpMm = -params.ringAmpMm
    params.phaseRad += Math.PI
  }

  let sst = 0
  const mean = Array.from(y).reduce((a, b) => a + b, 0) / n
  for (let i = 0; i < n; i++) sst += (y[i] - mean) * (y[i] - mean)
  const r2 = sst > 0 ? 1 - fit.ssr / sst : 0

  const refuse = (reason: string): LineFit => ({
    accepted: false,
    refusalReason: reason,
    params,
    r2,
    noiseRmsMm,
    frequencySeHz: null,
  })

  // Gate order matters: an amplitude below the detection threshold means there is no ring to
  // fit, so it must be reported as such before any fit-quality verdict.
  if (!(params.ringAmpMm >= AMPLITUDE_DETECTION_K * noiseRmsMm) || !(params.ringAmpMm > 0)) {
    return refuse(
      'The ringing amplitude on this line is below the detection threshold (4 times the noise floor). ' +
        'The print shows too little ringing to measure; raise the corner speed or the acceleration and reprint.',
    )
  }
  if (r2 < MIN_R2) {
    return refuse(
      'The ringing model does not fit the traced line (low coefficient of determination). ' +
        'The trace may be corrupted by print defects or scan artifacts.',
    )
  }
  if (
    params.frequencyHz <= F_MIN_HZ + BOUND_MARGIN_HZ ||
    params.frequencyHz >= F_MAX_HZ - BOUND_MARGIN_HZ
  ) {
    return refuse(
      `The fitted frequency sits at the edge of the ${F_MIN_HZ} to ${F_MAX_HZ} Hz search range, ` +
        'so it cannot be trusted. The true resonance likely lies outside the measurable range.',
    )
  }
  if (params.dampingRatio <= ZETA_MIN || params.dampingRatio >= ZETA_MAX) {
    return refuse(
      'The fitted damping ratio sits at the edge of the physically plausible range, so the fit cannot be trusted.',
    )
  }

  // Cramer-Rao standard error of the frequency from the asymptotic NLS covariance
  // sigma^2 (J^T J)^-1 at the solution.
  let frequencySeHz: number | null = null
  const dof = n - PARAM_COUNT
  if (dof > 0) {
    const sigma2 = fit.ssr / dof
    try {
      const cov = inverse(fit.jacobian.transpose().mmul(fit.jacobian)).mul(sigma2)
      const varF = cov.get(3, 3)
      if (varF > 0 && Number.isFinite(varF)) frequencySeHz = Math.sqrt(varF)
    } catch {
      // A singular information matrix leaves the CRB undefined; the pooled MAD-based
      // uncertainty still applies, so the fit is kept with a null per-line standard error.
      frequencySeHz = null
    }
  }

  return { accepted: true, refusalReason: null, params, r2, noiseRmsMm, frequencySeHz }
}

/**
 * Pools the per-line fits of one axis: replicate-agreement and speed-invariance gates, median
 * frequency and damping, and the confidence gate on the pooled frequency.
 */
export function poolAxisFits(fits: LineFit[], speedsMmS: number[], lineSpeeds: number[]): AxisPool {
  const refusals: string[] = []
  const accepted: { fit: LineFit; speed: number }[] = []
  for (let i = 0; i < fits.length; i++) {
    if (fits[i].accepted) accepted.push({ fit: fits[i], speed: lineSpeeds[i] })
    else if (fits[i].refusalReason) refusals.push(fits[i].refusalReason!)
  }

  const refuse = (reason: string): AxisPool => ({
    accepted: false,
    refusals: [...new Set([reason, ...refusals])],
    frequencyHz: null,
    dampingRatio: null,
    frequencyCi95Hz: null,
    amplitudeMm: null,
    linesUsed: accepted.length,
  })

  if (accepted.length < MIN_ACCEPTED_LINES) {
    return refuse(
      `Only ${accepted.length} of the axis's lines produced a usable ringing fit (at least ` +
        `${MIN_ACCEPTED_LINES} are needed for a trustworthy estimate).`,
    )
  }

  const freqs = accepted.map((a) => a.fit.params!.frequencyHz)
  const fMedian = medianOf(freqs)
  const tolerance = Math.max(AGREEMENT_MIN_HZ, AGREEMENT_REL * fMedian)

  // Speed invariance: the ringing frequency is a machine property, independent of the print
  // speed, so the per-tier medians must agree. A disagreement flags a wavelength misreading
  // (for example aliasing at one tier). Checked before the replicate gate: a tier mismatch
  // also widens the overall spread, and the tier-specific reason is the actionable one.
  if (speedsMmS.length > 1) {
    const tierMedians: number[] = []
    for (const v of speedsMmS) {
      const tier = accepted.filter((a) => a.speed === v).map((a) => a.fit.params!.frequencyHz)
      if (tier.length > 0) tierMedians.push(medianOf(tier))
    }
    if (tierMedians.length > 1 && Math.max(...tierMedians) - Math.min(...tierMedians) > tolerance) {
      return refuse(
        'The speed tiers disagree on the ringing frequency. A true machine resonance is ' +
          'speed-independent, so the measurement cannot be trusted; the trace of one tier was ' +
          'probably misread.',
      )
    }
  }

  // Replicate agreement: the robust spread of the per-line frequencies.
  const mad = medianOf(freqs.map((f) => Math.abs(f - fMedian)))
  const robustSigma = MAD_TO_SIGMA * mad
  if (robustSigma > tolerance) {
    return refuse(
      'The lines of this axis disagree on the ringing frequency (the replicate spread exceeds ' +
        'the shaper tolerance). The print or scan is too inconsistent to trust a single value.',
    )
  }

  // Pooled uncertainty: the larger of the replicate-based standard error of the median and the
  // Cramer-Rao-based one, each shrunk by sqrt(n) for the pooling.
  const n = accepted.length
  const seReplicate = (MEDIAN_EFFICIENCY * robustSigma) / Math.sqrt(n)
  const crbSes = accepted.map((a) => a.fit.frequencySeHz).filter((s): s is number => s !== null)
  const seCrb = crbSes.length > 0 ? medianOf(crbSes) / Math.sqrt(n) : 0
  const se = Math.max(seReplicate, seCrb)
  const ci95 = 1.96 * se
  if (ci95 > MAX_CI95_REL * fMedian) {
    return refuse(
      'The pooled frequency estimate is too uncertain to configure an input shaper: its 95% ' +
        'confidence interval is wider than the stopband of the shaper it would set. Reprint or ' +
        'rescan the coupon.',
    )
  }

  return {
    accepted: true,
    refusals,
    frequencyHz: fMedian,
    dampingRatio: medianOf(accepted.map((a) => a.fit.params!.dampingRatio)),
    frequencyCi95Hz: ci95,
    amplitudeMm: medianOf(accepted.map((a) => a.fit.params!.ringAmpMm)),
    linesUsed: n,
  }
}
