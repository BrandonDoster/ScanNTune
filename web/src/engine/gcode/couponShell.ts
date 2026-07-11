import type { FilamentProfile, PrinterProfile } from './profileTypes'
import { substituteSlicerVariables } from '../pa/slicerVariables'
import { COLD_PRINT_WARNING, motionLimitCommands, startGcodeHeats } from './emitter'

/** A profile with slicer variables substituted, plus the substitution report. */
export interface PreparedProfile {
  profile: PrinterProfile
  unknownVariables: string[]
  warnings: string[]
}

/**
 * Substitute slicer placeholder variables in the profile's start/pause/end G-code, deduplicate
 * the unresolved placeholders and warnings across the three blocks, and warn when the start
 * G-code sets no temperatures. When `includePause` is false the pause G-code is left verbatim
 * and its placeholders are not reported (the coupon never emits it).
 */
export function prepareProfile(
  profile: PrinterProfile,
  filament: FilamentProfile,
  opts?: { includePause?: boolean },
): PreparedProfile {
  const start = substituteSlicerVariables(profile.startGcode, profile, filament)
  const pause =
    (opts?.includePause ?? true)
      ? substituteSlicerVariables(profile.pauseGcode, profile, filament)
      : { gcode: profile.pauseGcode, unknown: [] as string[], warnings: [] as string[] }
  const end = substituteSlicerVariables(profile.endGcode, profile, filament)
  const substituted: PrinterProfile = {
    ...profile,
    startGcode: start.gcode,
    pauseGcode: pause.gcode,
    endGcode: end.gcode,
  }
  const unknownVariables = [...new Set([...start.unknown, ...pause.unknown, ...end.unknown])]
  const warnings = [...new Set([...start.warnings, ...pause.warnings, ...end.warnings])]
  if (!startGcodeHeats(start.gcode)) warnings.push(COLD_PRINT_WARNING)
  return { profile: substituted, unknownVariables, warnings }
}

export type CouponPlacement = 'center' | 'front' | 'back'

/**
 * Bed origin (min-x, min-y) of the coupon: centered on X, placed on Y per `placement`
 * ('front'/'back' sit `edgeMarginMm` from the bed edge). Throws when the coupon overhangs
 * the configured bed.
 */
export function couponOrigin(
  profile: PrinterProfile,
  couponWidthMm: number,
  couponHeightMm: number,
  placement: CouponPlacement = 'center',
  edgeMarginMm = 0,
): { ox: number; oy: number } {
  const ox = (profile.bedWidthMm - couponWidthMm) / 2
  const oy =
    placement === 'front'
      ? edgeMarginMm
      : placement === 'back'
        ? profile.bedDepthMm - couponHeightMm - edgeMarginMm
        : (profile.bedDepthMm - couponHeightMm) / 2
  if (ox < 0 || oy < 0) throw new Error('Coupon does not fit on the configured bed')
  return { ox, oy }
}

/**
 * Shared coupon preamble: header comments, the (already substituted) start G-code, relative
 * extrusion and absolute positioning restated in case the start G-code changed them, and the
 * firmware's motion limit commands (overridable via `motionLines`).
 */
export function setupPreamble(
  profile: PrinterProfile,
  headerComments: string[],
  opts?: { motionLines?: string[] },
): string[] {
  return [
    ...headerComments,
    ...profile.startGcode.split('\n'),
    'M83',
    'G90',
    ...(opts?.motionLines ?? motionLimitCommands(profile)),
  ]
}
