import { describe, expect, it } from 'vitest'
import { defaultPrinterProfile } from '../../../src/engine/gcode/profileTypes'
import type { Firmware, PrinterProfile } from '../../../src/engine/gcode/profileTypes'
import {
  isMotionLimitCommands,
  restoreShapingCommands,
} from '../../../src/engine/is/firmwareMotion'

function profileWith(firmware: Firmware): PrinterProfile {
  return { ...defaultPrinterProfile(), firmware }
}

describe('isMotionLimitCommands', () => {
  it('uses native square corner velocity semantics on Klipper', () => {
    expect(isMotionLimitCommands(profileWith('Klipper'), 4000, 25)).toEqual([
      'SET_VELOCITY_LIMIT ACCEL=4000 SQUARE_CORNER_VELOCITY=25 MINIMUM_CRUISE_RATIO=0',
    ])
  })
  it('emits Marlin classic jerk and the equivalent junction deviation on separate lines', () => {
    // junction_deviation_mm = 0.4 * jerk^2 / accel (documented Marlin conversion):
    // 0.4 * 25^2 / 4000 = 0.0625 mm; on its own M205 line so a classic build rejecting J
    // keeps the X/Y jerk values.
    expect(isMotionLimitCommands(profileWith('Marlin'), 4000, 25)).toEqual([
      'M204 P4000 T4000',
      'M205 X25 Y25',
      `M205 J${((0.4 * 25 * 25) / 4000).toFixed(3)}`,
    ])
  })
  it('emits RepRapFirmware per-axis jerk in mm/min matching the corner velocity', () => {
    // Classic jerk: a 90 degree corner at 25 mm/s is a 25 mm/s per-axis velocity change,
    // in M566 units 1500 mm/min.
    expect(isMotionLimitCommands(profileWith('RepRapFirmware'), 4000, 25)).toEqual([
      'M204 P4000 T4000',
      'M566 X1500 Y1500',
    ])
  })
})

describe('restoreShapingCommands', () => {
  const firmwares: Firmware[] = ['Klipper', 'Marlin', 'RepRapFirmware']

  it.each(firmwares)('emits only the restore comments for %s', (firmware) => {
    const lines = restoreShapingCommands(profileWith(firmware))
    expect(lines).toHaveLength(2)
    expect(lines[0]).toMatch(/^; input shaping resumes/)
    expect(lines[1]).toMatch(/^; pressure advance resumes/)
  })
})
