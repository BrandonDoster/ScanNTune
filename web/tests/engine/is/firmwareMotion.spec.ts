import { describe, expect, it } from 'vitest'
import { defaultPrinterProfile } from '../../../src/engine/gcode/profileTypes'
import type { Firmware, PrinterProfile } from '../../../src/engine/gcode/profileTypes'
import { restoreShapingCommands } from '../../../src/engine/is/firmwareMotion'

function profileWith(firmware: Firmware, extra: Partial<PrinterProfile> = {}): PrinterProfile {
  return { ...defaultPrinterProfile(), firmware, ...extra }
}

const FULL_FIELDS: Partial<PrinterProfile> = {
  inputShaperTypeX: 'mzv',
  inputShaperTypeY: 'ei',
  inputShaperFreqXHz: 52.4,
  inputShaperFreqYHz: 38.1,
  inputShaperDampingX: 0.05,
  inputShaperDampingY: 0.1,
  pressureAdvance: 0.045,
}

describe('restoreShapingCommands', () => {
  describe('Klipper', () => {
    it('restores nothing but comments when no fields are set', () => {
      const lines = restoreShapingCommands(profileWith('Klipper'))
      expect(lines).toHaveLength(2)
      expect(lines[0]).toMatch(/^; input shaping/)
      expect(lines[1]).toMatch(/^; pressure advance/)
    })

    it('emits a full SET_INPUT_SHAPER and SET_PRESSURE_ADVANCE', () => {
      const lines = restoreShapingCommands(profileWith('Klipper', FULL_FIELDS))
      expect(lines).toEqual([
        'SET_INPUT_SHAPER SHAPER_TYPE_X=mzv SHAPER_FREQ_X=52.4 DAMPING_RATIO_X=0.05 ' +
          'SHAPER_TYPE_Y=ei SHAPER_FREQ_Y=38.1 DAMPING_RATIO_Y=0.1',
        'SET_PRESSURE_ADVANCE ADVANCE=0.045',
      ])
    })

    it('emits only the known parameters and comments the missing group', () => {
      const lines = restoreShapingCommands(
        profileWith('Klipper', { inputShaperFreqXHz: 60, inputShaperTypeX: 'zv' }),
      )
      expect(lines[0]).toBe('SET_INPUT_SHAPER SHAPER_TYPE_X=zv SHAPER_FREQ_X=60')
      expect(lines[1]).toMatch(/^; pressure advance/)
    })

    it('comments the shaping when only pressure advance is known', () => {
      const lines = restoreShapingCommands(profileWith('Klipper', { pressureAdvance: 0.03 }))
      expect(lines[0]).toMatch(/^; input shaping/)
      expect(lines[1]).toBe('SET_PRESSURE_ADVANCE ADVANCE=0.03')
    })
  })

  describe('Marlin', () => {
    it('restores nothing but comments when no fields are set', () => {
      const lines = restoreShapingCommands(profileWith('Marlin'))
      expect(lines[0]).toMatch(/^; input shaping/)
      expect(lines[1]).toMatch(/^; pressure advance/)
    })

    it('collapses matching axes into a single M593', () => {
      const lines = restoreShapingCommands(
        profileWith('Marlin', {
          inputShaperFreqXHz: 45,
          inputShaperFreqYHz: 45,
          inputShaperDampingX: 0.1,
          inputShaperDampingY: 0.1,
          pressureAdvance: 0.08,
        }),
      )
      expect(lines).toEqual(['M593 F45 D0.1', 'M900 K0.08'])
    })

    it('emits per-axis M593 lines when the axes differ', () => {
      const lines = restoreShapingCommands(
        profileWith('Marlin', {
          ...FULL_FIELDS,
        }),
      )
      expect(lines).toEqual(['M593 X F52.4 D0.05', 'M593 Y F38.1 D0.1', 'M900 K0.045'])
    })

    it('emits a single axis when only one is set', () => {
      const lines = restoreShapingCommands(profileWith('Marlin', { inputShaperFreqYHz: 38 }))
      expect(lines[0]).toBe('M593 Y F38')
      expect(lines[1]).toMatch(/^; pressure advance/)
    })
  })

  describe('RepRapFirmware', () => {
    it('restores nothing but comments when no fields are set', () => {
      const lines = restoreShapingCommands(profileWith('RepRapFirmware'))
      expect(lines[0]).toMatch(/^; input shaping/)
      expect(lines[1]).toMatch(/^; pressure advance/)
    })

    it('emits M593 with type, frequency, and damping plus M572', () => {
      const lines = restoreShapingCommands(
        profileWith('RepRapFirmware', {
          inputShaperTypeX: 'ei2',
          inputShaperFreqXHz: 40,
          inputShaperDampingX: 0.1,
          pressureAdvance: 0.04,
        }),
      )
      expect(lines).toEqual(['M593 P"ei2" F40 S0.1', 'M572 D0 S0.04'])
    })

    it('emits partial parameters when only the frequency is known', () => {
      const lines = restoreShapingCommands(
        profileWith('RepRapFirmware', { inputShaperFreqXHz: 40 }),
      )
      expect(lines[0]).toBe('M593 F40')
      expect(lines[1]).toMatch(/^; pressure advance/)
    })
  })
})
