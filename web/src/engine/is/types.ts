import type { PrinterProfile } from '../gcode/profileTypes'
import type { CouponPlacement } from '../gcode/couponShell'
import {
  accelRampMm,
  fieldExtentMm,
  frameBandMm,
  INNER_MARGIN_MM,
  isCouponGeometry,
  maxPackedRampMm,
} from './couponGeometry'

export { accelRampMm }

export type IsAxis = 'x' | 'y'

export interface IsTestSpec {
  /** Cruise speeds of the measured segments, one sub-block of lines per tier. */
  speedsMmS: number[]
  linesPerSpeed: number
  /**
   * Guaranteed clean read length of each measured segment, counted AFTER the acceleration
   * ramp from the corner: the layout reserves ramp + this length per line before any
   * crossing or flow change is allowed, and the printed segment continues past it through
   * the crossing zone into the opposite band.
   */
  measuredLineMm: number
  /** In-window length of the straight run-up leg before the ringing corner; the
   *  through-band leg stretch is extra and comes free from the band width. */
  runUpMm: number
  linePitchMm: number
  axes: IsAxis[]
  accelMmS2: number
  squareCornerVelocityMmS: number
  /** How far each measured segment extends into the frame band at both ends. */
  weldMm: number
  /** Where the coupon sits on the bed: centered, or pushed to the front/back edge. */
  placement: CouponPlacement
}

export const MIN_SPEED_TIERS = 1
export const MAX_SPEED_TIERS = 3
export const MIN_LINES_PER_SPEED = 3
export const MAX_LINES_PER_SPEED = 6
/** Five wavelengths of the lowest resonance of interest (25 Hz) at the 100 mm/s default
 *  tier speed: 5 * 100 / 25 = 20 mm of clean read length. */
export const MIN_MEASURED_LINE_MM = 20
/** Below this acceleration the ringing trace is often too weak to measure. */
const LOW_ACCEL_MM_S2 = 4000
/** Default acceleration floor: the same threshold, so a default spec never starts in the
 *  low-acceleration warning zone. */
const MIN_ACCEL_MM_S2 = LOW_ACCEL_MM_S2

export function defaultIsTestSpec(profile: PrinterProfile): IsTestSpec {
  return {
    // One tier: the ringing frequency is speed-independent, so extra tiers are only
    // replicates; the replicates come from linesPerSpeed instead, which costs less
    // coupon width than a second tier's ramp and block gap.
    speedsMmS: [100],
    linesPerSpeed: 5,
    // Five ringing wavelengths of the lowest resonance of interest at the tier speed
    // (25 Hz at 100 mm/s is 4 mm per wavelength: 5 * 4 = 20 mm).
    measuredLineMm: 20,
    // Hosts the ramp to the 75 mm/s run-up speed (about 0.7 mm at 4000 mm/s^2) with
    // cruise to spare; the through-band leg stretch is extra.
    runUpMm: 8,
    // The pitch must exceed twice the expected residual ring amplitude plus the bead
    // width; the worst case is about 0.48 mm of amplitude (see RUN_UP_SPEED_MM_S), so
    // 2.5 mm keeps clear air between neighbouring traces.
    linePitchMm: 2.5,
    axes: ['x', 'y'],
    accelMmS2: Math.max(profile.printAccelMmS2, MIN_ACCEL_MM_S2),
    // Equal to the run-up speed: the corner is taken at the square corner velocity with
    // zero deceleration, so no pressure dumps at the bend, and the full 75 mm/s per-axis
    // velocity step excites the ringing (see RUN_UP_SPEED_MM_S).
    squareCornerVelocityMmS: RUN_UP_SPEED_MM_S,
    weldMm: 1,
    placement: 'center',
  }
}

/** Throws on a spec the generator cannot print; called before any G-code is emitted. */
export function validateIsSpec(spec: IsTestSpec): void {
  if (spec.speedsMmS.length < MIN_SPEED_TIERS || spec.speedsMmS.length > MAX_SPEED_TIERS) {
    throw new Error(`Between ${MIN_SPEED_TIERS} and ${MAX_SPEED_TIERS} speed tiers are required`)
  }
  if (spec.speedsMmS.some((v) => v <= 0)) throw new Error('Every speed tier must be positive')
  if (spec.linesPerSpeed < MIN_LINES_PER_SPEED || spec.linesPerSpeed > MAX_LINES_PER_SPEED) {
    throw new Error(
      `Lines per speed must be between ${MIN_LINES_PER_SPEED} and ${MAX_LINES_PER_SPEED}`,
    )
  }
  if (spec.measuredLineMm < MIN_MEASURED_LINE_MM) {
    throw new Error(`The measured line length must be at least ${MIN_MEASURED_LINE_MM} mm`)
  }
  if (spec.runUpMm <= 0) throw new Error('Run-up length must be positive')
  if (spec.linePitchMm <= 0) throw new Error('Line pitch must be positive')
  if (spec.accelMmS2 <= 0) throw new Error('Acceleration must be positive')
  if (spec.squareCornerVelocityMmS < RUN_UP_SPEED_MM_S) {
    throw new Error(
      `The square corner velocity must be at least the ${RUN_UP_SPEED_MM_S} mm/s run-up ` +
        'speed; only then is the corner taken without deceleration.',
    )
  }
  if (spec.weldMm <= 0) throw new Error('Weld length must be positive')
  if (spec.axes.length === 0) throw new Error('At least one axis must be selected')
}

/**
 * Cruise speed of the run-up leg, fixed across all tiers, and the size of the ringing
 * excitation. It equals the default square corner velocity, so the planner takes the 90
 * degree corner at the full run-up speed with zero deceleration: the pressure dump
 * K * (v_in - v_corner) is zero by construction and the bead stays continuous. The
 * excitation is the per-axis velocity step at the corner (the run-up axis stops, the
 * measured axis starts, each by 75 mm/s); the residual ring amplitude is approximately
 * delta-v over omega: 0.48 mm at 25 Hz down to 0.20 mm at 60 Hz, which stays several
 * scanner pixels at 600 dpi.
 */
export const RUN_UP_SPEED_MM_S = 75

/**
 * Warns (does not throw) on spec combinations that weaken the ringing signal. The run-up
 * leg only needs to reach the run-up speed before the corner: it cruises straight into
 * the bend at the square corner velocity, so there is no deceleration term. The
 * acceleration ramp from the corner to each tier speed is reserved by the layout in
 * front of the clean read length, so a long ramp grows the coupon instead of eating the
 * measured line; no per-tier warning is needed for it.
 */
export function rampWarnings(spec: IsTestSpec): string[] {
  const warnings: string[] = []
  if (spec.accelMmS2 < LOW_ACCEL_MM_S2) {
    warnings.push(
      'Low acceleration weakens the ringing signal; the test works best at the ' +
        "printer's true maximum acceleration.",
    )
  }
  // The run-up must reach its cruise speed before the corner: v^2 / 2a from rest.
  const rampUpMm = accelRampMm(RUN_UP_SPEED_MM_S, spec.accelMmS2)
  if (rampUpMm > spec.runUpMm) {
    warnings.push(
      `The ${spec.runUpMm} mm run-up is too short to reach the ${RUN_UP_SPEED_MM_S} mm/s ` +
        `run-up speed at ${spec.accelMmS2} mm/s^2. Lengthen the run-up.`,
    )
  }
  return warnings
}

/**
 * Shrinks the spec until the coupon fits the configured bed: the highest speed tier is
 * dropped first (never below a single tier), then the measured lines are shortened toward the
 * minimum length. Throws when the bed cannot host even the smallest coupon. Every
 * reduction is described in a user-worded note.
 */
export function fitSpecToBed(
  spec: IsTestSpec,
  profile: PrinterProfile,
): { spec: IsTestSpec; notes: string[] } {
  const fits = (s: IsTestSpec): boolean => {
    const g = isCouponGeometry(s)
    return g.couponWidthMm <= profile.bedWidthMm && g.couponHeightMm <= profile.bedDepthMm
  }
  const notes: string[] = []
  let fitted = spec

  while (!fits(fitted) && fitted.speedsMmS.length > MIN_SPEED_TIERS) {
    const dropped = Math.max(...fitted.speedsMmS)
    fitted = { ...fitted, speedsMmS: fitted.speedsMmS.filter((v) => v !== dropped) }
    notes.push(
      `The ${dropped} mm/s speed tier was removed because the full coupon does not fit ` +
        'the configured bed.',
    )
  }

  if (!fits(fitted)) {
    // Invert the interior formulas of isCouponGeometry for the clean read length L: along
    // a group's measured direction the interior is margin + maxPackedRampMm + L, plus the
    // crossing terms (margin + field + run-up) when both axes are present. The band width
    // and the packed ramp depend on the speed tiers, not on L, so they are constants
    // here; solve the longest L each constrained bed dimension allows and take the
    // tighter one.
    const band = frameBandMm(fitted)
    const field = fieldExtentMm(fitted)
    const both = fitted.axes.length === 2
    const crossTerm = both ? INNER_MARGIN_MM + field + fitted.runUpMm : 0
    const fixed = 2 * band + INNER_MARGIN_MM + maxPackedRampMm(fitted) + crossTerm
    const limits: number[] = []
    if (fitted.axes.includes('y')) {
      limits.push(profile.bedWidthMm - fixed)
    }
    if (fitted.axes.includes('x')) {
      limits.push(profile.bedDepthMm - fixed)
    }
    const target = Math.max(MIN_MEASURED_LINE_MM, Math.floor(Math.min(...limits)))
    if (target < fitted.measuredLineMm) {
      notes.push(
        `The measured lines were shortened from ${fitted.measuredLineMm} mm to ${target} mm ` +
          'so the coupon fits the configured bed.',
      )
      fitted = { ...fitted, measuredLineMm: target }
    }
  }

  if (!fits(fitted)) {
    throw new Error('The coupon does not fit the configured bed even at the shortest line length')
  }
  return { spec: fitted, notes }
}
