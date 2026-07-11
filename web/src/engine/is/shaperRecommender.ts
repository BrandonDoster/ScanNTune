// Input shaper recommendations from a measured resonance (frequency f, damping ratio zeta).
// The shaper impulse definitions are the established ones from the input-shaping literature,
// as implemented by Klipper's shaper_defs.py: ZV from Singer & Seering, "Preshaping Command
// Inputs to Reduce System Vibration" (1990); MZV (modified zero vibration) and the
// extra-insensitive family EI, 2HUMP_EI, 3HUMP_EI from Singhose, Seering & Singer's
// extra-insensitive shaper work, all with the 5% vibration tolerance Klipper uses
// (SHAPER_VIBRATION_REDUCTION = 20). Residual vibration and the smoothing-limited maximum
// acceleration follow Klipper's shaper_calibrate.py: the residual is the classic percentage
// residual vibration of an impulse sequence exciting a damped oscillator (Singer & Seering
// eq. for V(f)), and the recommended acceleration is the largest one keeping the shaper's
// worst-case corner smoothing under Klipper's 0.12 mm target at a 5 mm/s square corner
// velocity.

export type ShaperType = 'ZV' | 'MZV' | 'EI' | '2HUMP_EI' | '3HUMP_EI'

export const SHAPER_TYPES: ShaperType[] = ['ZV', 'MZV', 'EI', '2HUMP_EI', '3HUMP_EI']

/** Klipper's SHAPER_VIBRATION_REDUCTION: the EI designs tolerate 1/20 = 5% residual. */
const VIBRATION_TOLERANCE = 1 / 20
/** Klipper's TARGET_SMOOTHING for the recommended max accel, mm. */
const TARGET_SMOOTHING_MM = 0.12
/** Square corner velocity used in the smoothing estimate, mm/s (Klipper default). */
const SCV_MM_S = 5

export interface ShaperImpulses {
  amplitudes: number[]
  timesS: number[]
}

export interface ShaperOption {
  type: ShaperType
  frequencyHz: number
  /**
   * Worst-case residual vibration over the tolerance band around the measured resonance, as
   * a fraction (0.05 = 5%). Evaluated across a band, not only at the point estimate: the
   * point residual degenerates (ZV always shows ~0% at its own design frequency) while the
   * true resonance drifts with gantry and carriage position and the measurement itself has a
   * confidence interval.
   */
  bandResidualVibration: number
  /** Largest acceleration keeping the smoothing under the target, mm/s^2. */
  maxAccelMmS2: number
  /** Corner smoothing at that acceleration, mm. */
  smoothingMm: number
}

export interface ShaperRecommendation {
  options: ShaperOption[]
  recommended: ShaperOption
}

/**
 * The impulse sequence of a shaper tuned to `frequencyHz` with the given damping ratio.
 * Amplitudes are unnormalized (the residual formula divides by their sum), times in seconds.
 */
export function shaperImpulses(
  type: ShaperType,
  frequencyHz: number,
  dampingRatio: number,
): ShaperImpulses {
  const df = Math.sqrt(1 - dampingRatio * dampingRatio)
  const td = 1 / (frequencyHz * df) // damped period
  const K = Math.exp((-dampingRatio * Math.PI) / df)
  const v = VIBRATION_TOLERANCE

  switch (type) {
    case 'ZV':
      return { amplitudes: [1, K], timesS: [0, 0.5 * td] }
    case 'MZV': {
      const Km = Math.exp((-0.75 * dampingRatio * Math.PI) / df)
      const a1 = 1 - 1 / Math.sqrt(2)
      const a2 = (Math.sqrt(2) - 1) * Km
      const a3 = a1 * Km * Km
      return { amplitudes: [a1, a2, a3], timesS: [0, 0.375 * td, 0.75 * td] }
    }
    case 'EI': {
      const a1 = 0.25 * (1 + v)
      const a2 = 0.5 * (1 - v) * K
      const a3 = a1 * K * K
      return { amplitudes: [a1, a2, a3], timesS: [0, 0.5 * td, td] }
    }
    case '2HUMP_EI': {
      const V2 = v * v
      const X = Math.pow(V2 * (Math.sqrt(1 - V2) + 1), 1 / 3)
      const a1 = (3 * X * X + 2 * X + 3 * V2) / (16 * X)
      const a2 = (0.5 - a1) * K
      const a3 = a2 * K
      const a4 = a1 * K * K * K
      return { amplitudes: [a1, a2, a3, a4], timesS: [0, 0.5 * td, td, 1.5 * td] }
    }
    case '3HUMP_EI': {
      const K2 = K * K
      const a1 = 0.0625 * (1 + 3 * v + 2 * Math.sqrt(2 * (v + 1) * v))
      const a2 = 0.25 * (1 - v) * K
      const a3 = (0.5 * (1 + v) - 2 * a1) * K2
      const a4 = a2 * K2
      const a5 = a1 * K2 * K2
      return { amplitudes: [a1, a2, a3, a4, a5], timesS: [0, 0.5 * td, td, 1.5 * td, 2 * td] }
    }
  }
}

/**
 * Residual vibration fraction of the impulse sequence exciting a damped oscillator at
 * `testFrequencyHz` with `testDampingRatio` (Singer & Seering's residual vibration formula,
 * the same estimate Klipper's shaper_calibrate.py evaluates over a measured spectrum).
 */
export function residualVibration(
  impulses: ShaperImpulses,
  testFrequencyHz: number,
  testDampingRatio: number,
): number {
  const { amplitudes: A, timesS: T } = impulses
  const invD = 1 / A.reduce((a, b) => a + b, 0)
  const omega = 2 * Math.PI * testFrequencyHz
  const damping = testDampingRatio * omega
  const omegaD = omega * Math.sqrt(1 - testDampingRatio * testDampingRatio)
  const tEnd = T[T.length - 1]
  let s = 0
  let c = 0
  for (let i = 0; i < A.length; i++) {
    const w = A[i] * Math.exp(-damping * (tEnd - T[i]))
    s += w * Math.sin(omegaD * T[i])
    c += w * Math.cos(omegaD * T[i])
  }
  return Math.sqrt(s * s + c * c) * invD
}

/**
 * The shaper's corner smoothing at a given acceleration: the largest of the 90-degree and
 * 180-degree corner position offsets the shaper's time spread produces, exactly as Klipper's
 * shaper_calibrate.py _get_shaper_smoothing estimates it. Klipper's semantics, verified
 * against the upstream source: ts is the amplitude-weighted MEAN impulse time (the shaper's
 * time shift), each impulse contributes with dt = T[i] - ts, and only impulses at or after
 * ts contribute to the 90-degree velocity term (the gate is T[i] >= ts, not the train
 * midpoint).
 */
export function shaperSmoothingMm(impulses: ShaperImpulses, accelMmS2: number): number {
  const { amplitudes: A, timesS: T } = impulses
  const invD = 1 / A.reduce((a, b) => a + b, 0)
  const halfAccel = accelMmS2 / 2
  const ts = A.reduce((acc, a, i) => acc + a * T[i], 0) * invD
  let offset90 = 0
  let offset180 = 0
  for (let i = 0; i < A.length; i++) {
    const dt = T[i] - ts
    if (T[i] >= ts) offset90 += A[i] * (SCV_MM_S + halfAccel * dt) * dt
    offset180 += A[i] * halfAccel * dt * dt
  }
  offset90 *= invD * Math.sqrt(2)
  offset180 *= invD
  return Math.max(offset90, offset180)
}

/** Largest acceleration keeping the smoothing under the target, found by bisection. */
export function shaperMaxAccel(impulses: ShaperImpulses): number {
  let lo = 0
  let hi = 1e5
  if (shaperSmoothingMm(impulses, hi) <= TARGET_SMOOTHING_MM) return hi
  for (let i = 0; i < 60; i++) {
    const mid = (lo + hi) / 2
    if (shaperSmoothingMm(impulses, mid) <= TARGET_SMOOTHING_MM) lo = mid
    else hi = mid
  }
  return lo
}

/** Sample count across the tolerance band for the worst-case residual (the residual curves
 *  of these shapers are smooth in frequency, so a modest grid resolves their maxima). */
const BAND_SAMPLES = 33
/**
 * Floor of the tolerance band half-width as a fraction of the measured frequency. This is
 * the +/-5% modeling-error insensitivity band the EI family is designed for (Singhose's
 * extra-insensitive shapers), and roughly the spread Klipper's spectrum-integrated selection
 * effectively covers; a real machine's resonance also drifts about this much with gantry and
 * carriage position.
 */
const BAND_HALF_WIDTH_MIN = 0.05

/** Worst-case residual vibration of the impulse train over the given frequency band. */
export function worstBandResidual(
  impulses: ShaperImpulses,
  frequencyHz: number,
  dampingRatio: number,
  bandHalfWidth: number,
): number {
  let worst = 0
  for (let i = 0; i < BAND_SAMPLES; i++) {
    const f = frequencyHz * (1 - bandHalfWidth + (2 * bandHalfWidth * i) / (BAND_SAMPLES - 1))
    worst = Math.max(worst, residualVibration(impulses, f, dampingRatio))
  }
  return worst
}

/**
 * All shaper options at the measured resonance, plus the recommendation. Each shaper is tuned
 * to the measured frequency (with a single measured resonance the optimal shaper frequency is
 * the resonance itself: every design places its vibration null there). Robustness is judged
 * over a tolerance BAND around the measurement, half-width max(5%, the 95% confidence
 * interval as a fraction of the frequency): the point residual would always crown ZV with ~0%
 * even though ZV loses its suppression fastest when the true resonance sits anywhere else in
 * the band. Selection: among the shapers whose worst-case band residual is within the 5%
 * tolerance, take the one permitting the highest acceleration (the least smoothing); if none
 * qualifies, take the lowest worst-case residual.
 */
export function recommendShapers(
  frequencyHz: number,
  dampingRatio: number,
  frequencyCi95Hz = 0,
): ShaperRecommendation {
  const bandHalfWidth = Math.max(BAND_HALF_WIDTH_MIN, frequencyCi95Hz / frequencyHz)
  const options: ShaperOption[] = SHAPER_TYPES.map((type) => {
    const impulses = shaperImpulses(type, frequencyHz, dampingRatio)
    const maxAccel = shaperMaxAccel(impulses)
    return {
      type,
      frequencyHz,
      bandResidualVibration: worstBandResidual(impulses, frequencyHz, dampingRatio, bandHalfWidth),
      maxAccelMmS2: maxAccel,
      smoothingMm: shaperSmoothingMm(impulses, maxAccel),
    }
  })
  const within = options.filter((o) => o.bandResidualVibration <= VIBRATION_TOLERANCE)
  const recommended =
    within.length > 0
      ? within.reduce((best, o) => (o.maxAccelMmS2 > best.maxAccelMmS2 ? o : best))
      : options.reduce((best, o) =>
          o.bandResidualVibration < best.bandResidualVibration ? o : best,
        )
  return { options, recommended }
}

/** Klipper configuration snippet for a per-axis recommendation. */
export function formatKlipperShaper(axis: 'x' | 'y', option: ShaperOption): string {
  const f = option.frequencyHz.toFixed(1)
  const type = option.type.toLowerCase()
  return `shaper_freq_${axis}: ${f}\nshaper_type_${axis}: ${type}`
}

/**
 * Marlin ZV input shaping command (M593). Marlin implements the ZV shaper only, so the
 * frequency and the measured damping ratio are emitted regardless of the recommended type.
 */
export function formatMarlinShaper(axis: 'x' | 'y', frequencyHz: number, dampingRatio: number): string {
  return `M593 ${axis.toUpperCase()} F${frequencyHz.toFixed(1)} D${dampingRatio.toFixed(3)}`
}

/** RepRapFirmware input shaping command (M593 with a shaper type). */
export function formatRrfShaper(option: ShaperOption): string {
  const typeMap: Record<ShaperType, string> = {
    ZV: 'zvd',
    MZV: 'mzv',
    EI: 'ei2',
    '2HUMP_EI': 'ei3',
    '3HUMP_EI': 'ei3',
  }
  return `M593 P"${typeMap[option.type]}" F${option.frequencyHz.toFixed(1)}`
}
