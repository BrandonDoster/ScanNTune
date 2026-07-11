import type { PrinterProfile } from '../gcode/profileTypes'
import type { CouponPlacement } from '../gcode/couponShell'
import { FRAME_BAND_MM, isCouponGeometry } from './couponGeometry'

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
export const MIN_MEASURED_LINE_MM = 60
/** Default acceleration bounds: high enough to ring the frame, low enough for any printer. */
const MIN_ACCEL_MM_S2 = 3000
const MAX_ACCEL_MM_S2 = 6000

export function defaultIsTestSpec(profile: PrinterProfile): IsTestSpec {
  return {
    speedsMmS: [100, 200, 300],
    linesPerSpeed: 5,
    measuredLineMm: 110,
    runUpMm: 20,
    linePitchMm: 2.5,
    axes: ['x', 'y'],
    accelMmS2: Math.min(Math.max(profile.printAccelMmS2, MIN_ACCEL_MM_S2), MAX_ACCEL_MM_S2),
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
  if (spec.measuredLineMm <= 0) throw new Error('Measured line length must be positive')
  if (spec.runUpMm <= 0) throw new Error('Run-up length must be positive')
  if (spec.linePitchMm <= 0) throw new Error('Line pitch must be positive')
  if (spec.accelMmS2 <= 0) throw new Error('Acceleration must be positive')
  if (spec.squareCornerVelocityMmS <= 0) {
    throw new Error('Square corner velocity must be positive')
  }
  if (spec.weldMm <= 0) throw new Error('Weld length must be positive')
  if (spec.axes.length === 0) throw new Error('At least one axis must be selected')
}

/** Distance needed to reach `speedMmS` from rest at `accelMmS2`: v^2 / (2a). */
export function accelRampMm(speedMmS: number, accelMmS2: number): number {
  return (speedMmS * speedMmS) / (2 * accelMmS2)
}

/**
 * Warns (does not throw) for every speed tier the run-up leg is too short to reach before
 * the ringing corner; a corner taken below the commanded speed rings weaker than intended.
 */
export function rampWarnings(spec: IsTestSpec): string[] {
  const warnings: string[] = []
  for (const speed of spec.speedsMmS) {
    const ramp = accelRampMm(speed, spec.accelMmS2)
    if (ramp > spec.runUpMm) {
      warnings.push(
        `The ${spec.runUpMm} mm run-up is too short to reach ${speed} mm/s at ` +
          `${spec.accelMmS2} mm/s^2; the corner is taken below the commanded speed. ` +
          'Lengthen the run-up or raise the acceleration.',
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
    // measured line each constrained bed dimension allows and take the tighter one.
    const limits: number[] = []
    if (fitted.axes.includes('y')) {
      limits.push(profile.bedWidthMm - 2 * FRAME_BAND_MM + 2 * fitted.weldMm)
    }
    if (fitted.axes.includes('x')) {
      limits.push(profile.bedDepthMm - 2 * FRAME_BAND_MM + 2 * fitted.weldMm)
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
