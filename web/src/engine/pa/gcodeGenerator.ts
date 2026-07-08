import type { FilamentProfile, PrinterProfile, PaTestSpec } from './types'
import { couponGeometry, KLIPPER_DEFAULT_SMOOTH_TIME, paValueForLine } from './types'
import { substituteSlicerVariables } from './slicerVariables'
import {
  BASE_LAYERS,
  COLD_PRINT_WARNING,
  type Emitter,
  basePerimeters,
  extrude,
  motionLimitCommands,
  PERIMETER_LOOPS,
  rasterBase,
  retract,
  startGcodeHeats,
  travel,
} from '../gcode/emitter'

export { extrusionMm } from '../gcode/emitter'

export function paCommand(firmware: PrinterProfile['firmware'], value: number): string {
  const v = value.toFixed(4)
  if (firmware === 'Marlin') return `M900 K${v}`
  if (firmware === 'RepRapFirmware') return `M572 D0 S${v}`
  return `SET_PRESSURE_ADVANCE ADVANCE=${v}`
}

/** Klipper-only: set the fixed advance K together with a swept smooth time. */
export function smoothTimeCommand(fixedAdvance: number, smoothTime: number): string {
  return `SET_PRESSURE_ADVANCE ADVANCE=${fixedAdvance.toFixed(4)} SMOOTH_TIME=${smoothTime.toFixed(4)}`
}

/** The per-line parameter command for the spec's sweep kind. */
function sweepCommand(profile: PrinterProfile, spec: PaTestSpec, value: number): string {
  if (spec.sweep === 'smoothTime') return smoothTimeCommand(spec.fixedAdvance as number, value)
  return paCommand(profile.firmware, value)
}

export function generatePaGcode(
  profile: PrinterProfile,
  filament: FilamentProfile,
  spec: PaTestSpec,
): string {
  return generatePaGcodeWithReport(profile, filament, spec).gcode
}

/**
 * Generate the PA test G-code, substituting slicer placeholder variables in the profile's
 * start/pause/end G-code, and report any placeholders that were left verbatim.
 */
export function generatePaGcodeWithReport(
  profile: PrinterProfile,
  filament: FilamentProfile,
  spec: PaTestSpec,
): { gcode: string; unknownVariables: string[]; warnings: string[] } {
  if (spec.fastSpeedMmS <= spec.slowSpeedMmS) {
    throw new Error('Fast speed must exceed slow speed')
  }
  if (spec.sweep === 'smoothTime') {
    if (profile.firmware !== 'Klipper') {
      throw new Error(
        'Smooth time calibration requires Klipper; Marlin and RepRapFirmware have no equivalent setting.',
      )
    }
    if (!Number.isFinite(spec.fixedAdvance)) {
      throw new Error('A smooth time sweep needs a fixed pressure advance value (fixedAdvance).')
    }
  }
  const start = substituteSlicerVariables(profile.startGcode, profile, filament)
  const pause = substituteSlicerVariables(profile.pauseGcode, profile, filament)
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
  return { gcode: emitPaGcode(substituted, filament, spec), unknownVariables, warnings }
}

function emitPaGcode(profile: PrinterProfile, filament: FilamentProfile, spec: PaTestSpec): string {
  const g = couponGeometry(spec)
  // Center the coupon on the bed.
  const ox = (profile.bedWidthMm - g.baseWidthMm) / 2
  const oy = (profile.bedDepthMm - g.baseHeightMm) / 2
  if (ox < 0 || oy < 0) {
    throw new Error('Coupon does not fit on the configured bed')
  }
  const holes = g.fiducials.map((f) => ({
    x0: ox + f.xMm - g.fiducialSizeMm / 2,
    y0: oy + f.yMm - g.fiducialSizeMm / 2,
    x1: ox + f.xMm + g.fiducialSizeMm / 2,
    y1: oy + f.yMm + g.fiducialSizeMm / 2,
  }))

  const e: Emitter = { lines: [], x: 0, y: 0 }
  const L = e.lines
  L.push('; ScanNTune pressure advance test')
  L.push('; fiducial holes preserved')
  L.push(...profile.startGcode.split('\n'))
  L.push('M83') // relative extrusion, restated in case start gcode changed it
  L.push('G90')
  L.push(...motionLimitCommands(profile))

  // Base layers: perimeter loops first, then serpentine infill inset behind them.
  const infillInset = PERIMETER_LOOPS * spec.lineWidthMm
  const infillHoles = holes.map((h) => ({
    x0: h.x0 - infillInset,
    y0: h.y0 - infillInset,
    x1: h.x1 + infillInset,
    y1: h.y1 + infillInset,
  }))
  for (let layer = 0; layer < BASE_LAYERS; layer++) {
    const z = profile.layerHeightMm * (layer + 1)
    L.push(`G1 Z${z.toFixed(3)} F600`)
    basePerimeters(e, profile, filament, spec.lineWidthMm, ox, oy, g.baseWidthMm, g.baseHeightMm, holes)
    rasterBase(
      e,
      profile,
      filament,
      spec.lineWidthMm,
      ox + infillInset,
      oy + infillInset,
      g.baseWidthMm - 2 * infillInset,
      g.baseHeightMm - 2 * infillInset,
      layer === 0,
      infillHoles,
    )
  }

  // Filament change to the contrasting color.
  retract(e, profile, 1)
  L.push(...profile.pauseGcode.split('\n'))
  // Printers whose PAUSE/M600 macro already retracts may see a small blob at the prime
  // line start; set retractMm to 0 in the profile if that happens.
  L.push('; if your pause macro already retracts, set retractMm to 0 in the profile')
  retract(e, profile, -1)

  // Prime line along the bottom base edge, outside the measured region.
  const z3 = profile.layerHeightMm * (BASE_LAYERS + 1)
  L.push(`G1 Z${z3.toFixed(3)} F600`)
  L.push(
    spec.sweep === 'smoothTime'
      ? smoothTimeCommand(spec.fixedAdvance as number, KLIPPER_DEFAULT_SMOOTH_TIME)
      : paCommand(profile.firmware, 0),
  )
  travel(e, profile, ox + 2, oy + 1.5)
  extrude(e, profile, filament, spec.lineWidthMm, ox + g.baseWidthMm - 2, oy + 1.5, spec.slowSpeedMmS)

  // Test lines.
  for (let i = 0; i < spec.lineCount; i++) {
    L.push(sweepCommand(profile, spec, paValueForLine(spec, i)))
    const y = oy + g.lineStartYMm(i)
    const x0 = ox + g.lineStartXMm
    retract(e, profile, 1)
    travel(e, profile, x0, y)
    retract(e, profile, -1)
    extrude(e, profile, filament, spec.lineWidthMm, x0 + spec.slowSegmentMm, y, spec.slowSpeedMmS)
    extrude(
      e,
      profile,
      filament,
      spec.lineWidthMm,
      x0 + spec.slowSegmentMm + spec.fastSegmentMm,
      y,
      spec.fastSpeedMmS,
    )
    extrude(
      e,
      profile,
      filament,
      spec.lineWidthMm,
      x0 + 2 * spec.slowSegmentMm + spec.fastSegmentMm,
      y,
      spec.slowSpeedMmS,
    )
  }

  retract(e, profile, 1)
  L.push(...profile.endGcode.split('\n'))
  return L.join('\n') + '\n'
}
