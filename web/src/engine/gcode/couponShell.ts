import type { FilamentProfile, PrinterProfile } from './profileTypes'
import { substituteSlicerVariables } from '../pa/slicerVariables'
import { COLD_PRINT_WARNING, motionLimitCommands, startGcodeHeats } from './emitter'

/** A profile and filament with slicer variables substituted, plus the substitution report. */
export interface PreparedProfile {
  profile: PrinterProfile
  filament: FilamentProfile
  unknownVariables: string[]
  warnings: string[]
}

/**
 * Substitute slicer placeholder variables in the profile's start/pause/end G-code and the
 * filament's start/end G-code, deduplicate the unresolved placeholders and warnings across
 * the blocks, and warn when the start G-code sets no temperatures. When `includePause` is
 * false the pause G-code is left verbatim and its placeholders are not reported (the coupon
 * never emits it).
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
  const filamentStart = substituteSlicerVariables(filament.startGcode, profile, filament)
  const filamentEnd = substituteSlicerVariables(filament.endGcode, profile, filament)
  const substituted: PrinterProfile = {
    ...profile,
    startGcode: start.gcode,
    pauseGcode: pause.gcode,
    endGcode: end.gcode,
  }
  const substitutedFilament: FilamentProfile = {
    ...filament,
    startGcode: filamentStart.gcode,
    endGcode: filamentEnd.gcode,
  }
  const blocks = [start, pause, end, filamentStart, filamentEnd]
  const unknownVariables = [...new Set(blocks.flatMap((b) => b.unknown))]
  const warnings = [...new Set(blocks.flatMap((b) => b.warnings))]
  if (!startGcodeHeats(start.gcode)) warnings.push(COLD_PRINT_WARNING)
  return { profile: substituted, filament: substitutedFilament, unknownVariables, warnings }
}

export type CouponPlacement = 'center' | 'front' | 'back'

/** Clearance from the bed edge for the 'front'/'back' placements. */
export const EDGE_MARGIN_MM = 10

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
 * Shared coupon preamble: header comments, the (already substituted) printer start G-code
 * followed by the filament's start G-code in slicer order, relative extrusion and absolute
 * positioning restated in case the start G-code changed them, and the firmware's motion
 * limit commands (overridable via `motionLines`).
 */
export function setupPreamble(
  profile: PrinterProfile,
  filament: FilamentProfile,
  headerComments: string[],
  opts?: { motionLines?: string[] },
): string[] {
  return [
    ...headerComments,
    ...profile.startGcode.split('\n'),
    ...gcodeBlockLines(filament.startGcode),
    'M83',
    'G90',
    ...(opts?.motionLines ?? motionLimitCommands(profile)),
  ]
}

/**
 * Shared coupon teardown: the (already substituted) filament end G-code followed by the
 * printer's end G-code, in slicer order.
 */
export function teardownLines(profile: PrinterProfile, filament: FilamentProfile): string[] {
  return [...gcodeBlockLines(filament.endGcode), ...profile.endGcode.split('\n')]
}

/** The block's lines, or nothing at all when the block is empty or whitespace. */
function gcodeBlockLines(block: string): string[] {
  return block.trim() === '' ? [] : block.split('\n')
}
