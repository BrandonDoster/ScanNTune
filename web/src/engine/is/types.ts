import type { PrinterProfile } from '../gcode/profileTypes'
import type { CouponPlacement } from '../gcode/couponShell'
import { accelRampMm, frameBandMm, isCouponGeometry } from './couponGeometry'

export { accelRampMm }

export type IsAxis = 'x' | 'y'

export interface IsTestSpec {
  /** Cruise speeds of the measured segments, one sub-block of lines per tier. */
  speedsMmS: number[]
  linesPerSpeed: number
  measuredLineMm: number
  /** Length of the straight approach leg before the ringing corner. */
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
export const MIN_LINES_PER_SPEED = 4
export const MAX_LINES_PER_SPEED = 6
export const MIN_MEASURED_LINE_MM = 40
/** Default acceleration floor: high enough to ring the frame on any printer. */
const MIN_ACCEL_MM_S2 = 3000
/** Below this acceleration the ringing trace is often too weak to measure. */
const LOW_ACCEL_MM_S2 = 4000

export function defaultIsTestSpec(profile: PrinterProfile): IsTestSpec {
  return {
    speedsMmS: [100, 200, 300],
    linesPerSpeed: 5,
    measuredLineMm: 60,
    runUpMm: 20,
    linePitchMm: 2.5,
    axes: ['x', 'y'],
    accelMmS2: Math.max(profile.printAccelMmS2, MIN_ACCEL_MM_S2),
    squareCornerVelocityMmS: 5,
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
  if (spec.squareCornerVelocityMmS <= 0) {
    throw new Error('Square corner velocity must be positive')
  }
  if (spec.weldMm <= 0) throw new Error('Weld length must be positive')
  if (spec.axes.length === 0) throw new Error('At least one axis must be selected')
}

/**
 * Feedrate of the run-up leg, fixed across all tiers. Melt pressure with pressure advance
 * off scales with speed, and the planner drops to the square corner velocity at the sharp
 * corner, so a fast approach dumps its stored pressure there as a blob. The ringing
 * excitation is the acceleration ramp from the square corner velocity up to the tier speed
 * inside the measured segment, not the approach speed, so a slow approach removes the
 * corner pressure dump without touching the excitation; this mirrors how Klipper's ringing
 * tower excites its corners.
 */
export const RUN_UP_SPEED_MM_S = 50

/**
 * Warns (does not throw) on spec combinations that weaken the ringing signal. The run-up
 * leg only needs to reach the fixed approach speed before the corner. The acceleration
 * ramp to each tier speed lives in the measured segment itself (it always did: the corner
 * is taken at the square corner velocity), so a tier whose ramp outruns the measured line
 * never reaches its commanded speed at all.
 */
export function rampWarnings(spec: IsTestSpec): string[] {
  const warnings: string[] = []
  if (spec.accelMmS2 < LOW_ACCEL_MM_S2) {
    warnings.push(
      'Low acceleration weakens the ringing signal; the test works best at the ' +
        "printer's true maximum acceleration.",
    )
  }
  if (accelRampMm(RUN_UP_SPEED_MM_S, spec.accelMmS2) > spec.runUpMm) {
    warnings.push(
      `The ${spec.runUpMm} mm run-up is too short to reach the ${RUN_UP_SPEED_MM_S} mm/s ` +
        `approach speed at ${spec.accelMmS2} mm/s^2. Lengthen the run-up.`,
    )
  }
  for (const speed of spec.speedsMmS) {
    // Ramp from the square corner velocity to the tier speed: (v^2 - scv^2) / (2a).
    const ramp =
      accelRampMm(speed, spec.accelMmS2) -
      accelRampMm(spec.squareCornerVelocityMmS, spec.accelMmS2)
    if (ramp >= spec.measuredLineMm) {
      warnings.push(
        `The ${speed} mm/s tier needs ${ramp.toFixed(1)} mm to reach its speed at ` +
          `${spec.accelMmS2} mm/s^2, longer than the ${spec.measuredLineMm} mm measured ` +
          'line; the tier never reaches the commanded speed. Raise the acceleration or ' +
          'remove the tier.',
      )
    }
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
    // A measured span fixes the coupon size along its travel direction; solve the longest
    // measured line each constrained bed dimension allows and take the tighter one. The
    // band width depends on the speed tiers, not the line length, so it is a constant here.
    const band = frameBandMm(fitted)
    const limits: number[] = []
    if (fitted.axes.includes('y')) {
      limits.push(profile.bedWidthMm - 2 * band + 2 * fitted.weldMm)
    }
    if (fitted.axes.includes('x')) {
      limits.push(profile.bedDepthMm - 2 * band + 2 * fitted.weldMm)
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
