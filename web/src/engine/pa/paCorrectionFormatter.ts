import type { Correction } from '../types'
import type { Firmware } from './types'
import { paCommand } from './gcodeGenerator'

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
