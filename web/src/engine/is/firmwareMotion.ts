import type { PrinterProfile } from '../gcode/profileTypes'

export function disableShapingCommands(profile: PrinterProfile): string[] {
  if (profile.firmware === 'Marlin') {
    return ['M593 F0', 'M900 K0']
  }
  if (profile.firmware === 'RepRapFirmware') {
    return ['M593 P"none"', 'M572 D0 S0']
  }
  return ['SET_INPUT_SHAPER SHAPER_FREQ_X=0 SHAPER_FREQ_Y=0', 'SET_PRESSURE_ADVANCE ADVANCE=0']
}

export function isMotionLimitCommands(
  profile: PrinterProfile,
  accelMmS2: number,
  squareCornerVelocityMmS: number,
): string[] {
  if (profile.firmware === 'Marlin') {
    return [`M204 P${accelMmS2} T${accelMmS2}`, `M205 X${squareCornerVelocityMmS} Y${squareCornerVelocityMmS}`]
  }
  if (profile.firmware === 'RepRapFirmware') {
    return [`M204 P${accelMmS2} T${accelMmS2}`, `M566 X${squareCornerVelocityMmS * 60} Y${squareCornerVelocityMmS * 60}`]
  }
  return [`SET_VELOCITY_LIMIT ACCEL=${accelMmS2} SQUARE_CORNER_VELOCITY=${squareCornerVelocityMmS} MINIMUM_CRUISE_RATIO=0`]
}

/**
 * Comment lines noting that the printer's own input shaper and pressure advance settings come
 * back with the next firmware restart or saved configuration; nothing is re-applied in G-code.
 */
export function restoreShapingCommands(_profile: PrinterProfile): string[] {
  return [
    '; input shaping resumes with the next firmware restart or saved configuration',
    '; pressure advance resumes with the next firmware restart or saved configuration',
  ]
}
