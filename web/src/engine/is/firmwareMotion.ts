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

const SHAPING_FALLBACK =
  '; input shaping resumes with the next firmware restart or saved configuration'
const PA_FALLBACK =
  '; pressure advance resumes with the next firmware restart or saved configuration'

function hasValue(value: number | undefined): value is number {
  return value !== undefined && Number.isFinite(value)
}

function hasText(value: string | undefined): value is string {
  return value !== undefined && value.trim() !== ''
}

/** True when the profile carries any input shaper setting to restore. */
function hasShaperFields(profile: PrinterProfile): boolean {
  return (
    hasText(profile.inputShaperTypeX) ||
    hasText(profile.inputShaperTypeY) ||
    hasValue(profile.inputShaperFreqXHz) ||
    hasValue(profile.inputShaperFreqYHz) ||
    hasValue(profile.inputShaperDampingX) ||
    hasValue(profile.inputShaperDampingY)
  )
}

function klipperShaperCommand(profile: PrinterProfile): string {
  const params: string[] = []
  if (hasText(profile.inputShaperTypeX)) params.push(`SHAPER_TYPE_X=${profile.inputShaperTypeX.trim()}`)
  if (hasValue(profile.inputShaperFreqXHz)) params.push(`SHAPER_FREQ_X=${profile.inputShaperFreqXHz}`)
  if (hasValue(profile.inputShaperDampingX)) params.push(`DAMPING_RATIO_X=${profile.inputShaperDampingX}`)
  if (hasText(profile.inputShaperTypeY)) params.push(`SHAPER_TYPE_Y=${profile.inputShaperTypeY.trim()}`)
  if (hasValue(profile.inputShaperFreqYHz)) params.push(`SHAPER_FREQ_Y=${profile.inputShaperFreqYHz}`)
  if (hasValue(profile.inputShaperDampingY)) params.push(`DAMPING_RATIO_Y=${profile.inputShaperDampingY}`)
  return `SET_INPUT_SHAPER ${params.join(' ')}`
}

function marlinShaperCommands(profile: PrinterProfile): string[] {
  const freqX = profile.inputShaperFreqXHz
  const freqY = profile.inputShaperFreqYHz
  const dampX = profile.inputShaperDampingX
  const dampY = profile.inputShaperDampingY
  const axesMatch =
    hasValue(freqX) && hasValue(freqY) && freqX === freqY && dampX === dampY
  if (axesMatch) {
    return [marlinAxisCommand(null, freqX, dampX)]
  }
  const lines: string[] = []
  if (hasValue(freqX) || hasValue(dampX)) lines.push(marlinAxisCommand('X', freqX, dampX))
  if (hasValue(freqY) || hasValue(dampY)) lines.push(marlinAxisCommand('Y', freqY, dampY))
  return lines
}

function marlinAxisCommand(
  axis: 'X' | 'Y' | null,
  freqHz: number | undefined,
  damping: number | undefined,
): string {
  const parts = ['M593']
  if (axis !== null) parts.push(axis)
  if (hasValue(freqHz)) parts.push(`F${freqHz}`)
  if (hasValue(damping)) parts.push(`D${damping}`)
  return parts.join(' ')
}

function rrfShaperCommand(profile: PrinterProfile): string {
  const type = hasText(profile.inputShaperTypeX)
    ? profile.inputShaperTypeX
    : profile.inputShaperTypeY
  const freq = hasValue(profile.inputShaperFreqXHz)
    ? profile.inputShaperFreqXHz
    : profile.inputShaperFreqYHz
  const damping = hasValue(profile.inputShaperDampingX)
    ? profile.inputShaperDampingX
    : profile.inputShaperDampingY
  const parts = ['M593']
  if (hasText(type)) parts.push(`P"${type.trim()}"`)
  if (hasValue(freq)) parts.push(`F${freq}`)
  if (hasValue(damping)) parts.push(`S${damping}`)
  return parts.join(' ')
}

/**
 * Commands re-applying the printer's own input shaper and pressure advance after the test print.
 * Only the settings stored in the profile are emitted; a missing group falls back to a comment
 * explaining that the firmware's saved configuration takes over again.
 */
export function restoreShapingCommands(profile: PrinterProfile): string[] {
  const lines: string[] = []
  const shaper = hasShaperFields(profile)
  const pa = hasValue(profile.pressureAdvance)

  if (profile.firmware === 'Marlin') {
    if (shaper) lines.push(...marlinShaperCommands(profile))
    else lines.push(SHAPING_FALLBACK)
    if (pa) lines.push(`M900 K${profile.pressureAdvance}`)
    else lines.push(PA_FALLBACK)
    return lines
  }
  if (profile.firmware === 'RepRapFirmware') {
    if (shaper) lines.push(rrfShaperCommand(profile))
    else lines.push(SHAPING_FALLBACK)
    if (pa) lines.push(`M572 D0 S${profile.pressureAdvance}`)
    else lines.push(PA_FALLBACK)
    return lines
  }
  if (shaper) lines.push(klipperShaperCommand(profile))
  else lines.push(SHAPING_FALLBACK)
  if (pa) lines.push(`SET_PRESSURE_ADVANCE ADVANCE=${profile.pressureAdvance}`)
  else lines.push(PA_FALLBACK)
  return lines
}
