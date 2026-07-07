import type { Correction } from '../types'
import type { Firmware } from './types'
import { paCommand, smoothTimeCommand } from './gcodeGenerator'

export function paCorrection(firmware: Firmware, paValue: number): Correction {
  const v = paValue.toFixed(4)
  if (firmware === 'Marlin') {
    return {
      code: paCommand(firmware, paValue),
      hint: 'Run once, then save to EEPROM with M500. Or set LIN_ADVANCE_K in Configuration_adv.h.',
    }
  }
  if (firmware === 'RepRapFirmware') {
    return {
      code: paCommand(firmware, paValue),
      hint: 'Add to config.g to make it permanent.',
    }
  }
  return {
    code: paCommand(firmware, paValue),
    hint: 'For a permanent setting, add the line below to the [extruder] section of printer.cfg.',
    secondaryCaption: 'printer.cfg',
    secondaryCode: `pressure_advance: ${v}`,
  }
}

/** Klipper-only smooth time result: the live command plus the printer.cfg line. */
export function smoothTimeCorrection(
  firmware: Firmware,
  paValue: number,
  smoothTime: number,
): Correction {
  if (firmware !== 'Klipper') {
    throw new Error('Smooth time calibration applies to Klipper only.')
  }
  return {
    code: smoothTimeCommand(paValue, smoothTime),
    hint: 'For a permanent setting, add the line below to the [extruder] section of printer.cfg.',
    secondaryCaption: 'printer.cfg',
    secondaryCode: `pressure_advance_smooth_time: ${smoothTime.toFixed(4)}`,
  }
}
