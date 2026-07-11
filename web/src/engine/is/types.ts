import type { PrinterProfile } from '../gcode/profileTypes'
import type { CouponPlacement } from '../gcode/couponShell'
import {
  accelRampMm,
  APPROACH_MM,
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
  /** In-window length of the straight approach leg before the ringing corner; the
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

export const MIN_SPEED_TIERS = 2
export const MAX_SPEED_TIERS = 3
export const MIN_LINES_PER_SPEED = 3
export const MAX_LINES_PER_SPEED = 6
export const MIN_MEASURED_LINE_MM = 40
/** Below this acceleration the ringing trace is often too weak to measure. */
const LOW_ACCEL_MM_S2 = 4000
/** Default acceleration floor: the same threshold, so a default spec never starts in the
 *  low-acceleration warning zone. */
const MIN_ACCEL_MM_S2 = LOW_ACCEL_MM_S2

export function defaultIsTestSpec(profile: PrinterProfile): IsTestSpec {
  return {
    // Two tiers: the ringing frequency is speed-independent, so tiers are replicates, and
    // the 300 mm/s wavelength would cost clean read length for no extra information.
    speedsMmS: [100, 200],
    linesPerSpeed: 3,
    // Five ringing wavelengths at the worst case (25 Hz at 200 mm/s is 8 mm/period).
    measuredLineMm: 40,
    // Composition: about 0.5 mm ramp to the 50 mm/s run-up speed, a short cruise, then the
    // 5 mm corner approach at 20 mm/s.
    runUpMm: 8,
    linePitchMm: 2.5,
    axes: ['x', 'y'],
    accelMmS2: Math.max(profile.printAccelMmS2, MIN_ACCEL_MM_S2),
    // A 90 degree corner taken at junction speed v is a velocity impulse of sqrt(2) * v on
    // the frame, so a higher square corner velocity both strengthens the ringing
    // excitation and collapses the dwell time and pressure dump at the corner.
    squareCornerVelocityMmS: 25,
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
  if (spec.runUpMm <= APPROACH_MM) {
    throw new Error(`The run-up must be longer than the ${APPROACH_MM} mm corner approach`)
  }
  if (spec.linePitchMm <= 0) throw new Error('Line pitch must be positive')
  if (spec.accelMmS2 <= 0) throw new Error('Acceleration must be positive')
  if (spec.squareCornerVelocityMmS <= APPROACH_SPEED_MM_S) {
    throw new Error(
      `The square corner velocity must exceed the ${APPROACH_SPEED_MM_S} mm/s corner ` +
        'approach speed; only then is the corner taken without deceleration.',
    )
  }
  if (spec.weldMm <= 0) throw new Error('Weld length must be positive')
  if (spec.axes.length === 0) throw new Error('At least one axis must be selected')
}

/**
 * Feedrate of the run-up leg, fixed across all tiers. Melt pressure with pressure advance
 * off scales with speed, so the leg approaches slowly; the ringing excitation is the
 * acceleration ramp from the corner up to the tier speed inside the measured segment, not
 * the approach speed. This mirrors how Klipper's ringing tower excites its corners.
 */
export const RUN_UP_SPEED_MM_S = 50

/**
 * Feedrate of the corner approach, the last APPROACH_MM of every run-up leg. It sits
 * below the square corner velocity (validated), so the planner takes the corner without
 * decelerating and the pressure dump K * (v_in - v_corner) is zero by construction; the
 * slow full-flow stretch also lets the higher run-up pressure relax along the leg instead
 * of at the bend.
 */
export const APPROACH_SPEED_MM_S = 20

/**
 * Warns (does not throw) on spec combinations that weaken the ringing signal. The run-up
 * leg only needs to reach the fixed approach speed before the corner. The acceleration
 * ramp from the square corner velocity to each tier speed is reserved by the layout in
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
  // The run-up must reach its speed AND brake back down to the approach speed before the
  // corner approach begins: v^2 / 2a up plus (v^2 - v_approach^2) / 2a down.
  const rampUpMm = accelRampMm(RUN_UP_SPEED_MM_S, spec.accelMmS2)
  const decelMm = rampUpMm - accelRampMm(APPROACH_SPEED_MM_S, spec.accelMmS2)
  if (rampUpMm + decelMm > spec.runUpMm - APPROACH_MM) {
    warnings.push(
      `The ${spec.runUpMm} mm run-up is too short to reach the ${RUN_UP_SPEED_MM_S} mm/s ` +
        `run-up speed and slow back to the ${APPROACH_SPEED_MM_S} mm/s corner approach at ` +
        `${spec.accelMmS2} mm/s^2. Lengthen the run-up.`,
    )
  }
  return warnings
}

/**
 * Shrinks the spec until the coupon fits the configured bed: the highest speed tier is
 * dropped first (never below two tiers), then the measured lines are shortened toward the
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
