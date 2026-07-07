import { describe, expect, it } from 'vitest'
import { substituteSlicerVariables } from '../../../src/engine/pa/slicerVariables'
import { defaultPrinterProfile } from '../../../src/engine/pa/types'
import type { PrinterProfile } from '../../../src/engine/pa/types'

function profile(overrides: Partial<PrinterProfile> = {}): PrinterProfile {
  return { ...defaultPrinterProfile(), ...overrides }
}

describe('substituteSlicerVariables', () => {
  it('substitutes square-bracket variables', () => {
    const p = profile({ nozzleTempC: 215, bedTempC: 65 })
    const r = substituteSlicerVariables(
      'M104 S[first_layer_temperature]\nM140 S[first_layer_bed_temperature]',
      p,
    )
    expect(r.gcode).toBe('M104 S215\nM140 S65')
    expect(r.unknown).toEqual([])
  })

  it('substitutes curly-brace variables', () => {
    const p = profile({ nozzleTempC: 200 })
    const r = substituteSlicerVariables('M104 S{temperature}', p)
    expect(r.gcode).toBe('M104 S200')
  })

  it('ignores a numeric index suffix in both syntaxes', () => {
    const p = profile({ nozzleTempC: 230 })
    const r = substituteSlicerVariables(
      'M104 S[first_layer_temperature[0]] T{temperature[0]}',
      p,
    )
    expect(r.gcode).toBe('M104 S230 T230')
    expect(r.unknown).toEqual([])
  })

  it('maps every documented variable name', () => {
    const p = profile({
      nozzleTempC: 210,
      bedTempC: 60,
      chamberTempC: 40,
      filamentType: 'ABS',
      layerHeightMm: 0.2,
      nozzleDiameterMm: 0.4,
      filamentDiameterMm: 1.75,
      travelSpeedMmS: 150,
    })
    const src = [
      '[first_layer_temperature] [temperature] [nozzle_temperature] [first_layer_nozzle_temperature]',
      '[first_layer_bed_temperature] [bed_temperature] [first_layer_bed_temp]',
      '[chamber_temperature] [chamber_temp]',
      '[filament_type]',
      '[layer_height] [first_layer_height]',
      '[nozzle_diameter] [filament_diameter] [travel_speed]',
    ].join('\n')
    const r = substituteSlicerVariables(src, p)
    expect(r.gcode).toBe(
      ['210 210 210 210', '60 60 60', '40 40', 'ABS', '0.2 0.2', '0.4 1.75 150'].join('\n'),
    )
    expect(r.unknown).toEqual([])
  })

  it('substitutes the PrusaSlicer PRINT_START example line with default values', () => {
    const r = substituteSlicerVariables(
      'M117\nPRINT_START BED=[first_layer_bed_temperature] HOTEND=[first_layer_temperature] FILAMENT_TYPE=[filament_type] CHAMBER_TEMP=[chamber_temperature]',
      profile(),
    )
    expect(r.gcode).toBe(
      'M117\nPRINT_START BED=60 HOTEND=210 FILAMENT_TYPE=PLA CHAMBER_TEMP=0',
    )
    expect(r.unknown).toEqual([])
  })

  it('leaves unknown placeholders verbatim and reports them deduplicated', () => {
    const r = substituteSlicerVariables(
      'START [machine_start_gcode] {machine_start_gcode} [machine_start_gcode]',
      profile(),
    )
    expect(r.gcode).toBe('START [machine_start_gcode] {machine_start_gcode} [machine_start_gcode]')
    expect(r.unknown).toEqual(['machine_start_gcode'])
  })

  it('leaves Klipper jinja and dotted object refs untouched and unreported', () => {
    const src = [
      '{% if printer.extruder.target > 0 %}',
      'M104 S{printer.extruder.target}',
      '{% endif %}',
      '; comment with [brackets like this?] and {1+2}',
    ].join('\n')
    const r = substituteSlicerVariables(src, profile())
    expect(r.gcode).toBe(src)
    expect(r.unknown).toEqual([])
  })

  it('does not treat non-identifier bracket content as a placeholder', () => {
    const src = 'G1 X10 ; [10mm] {not-a-var} [a b] [_ok_though]'
    const r = substituteSlicerVariables(src, profile())
    expect(r.gcode).toBe('G1 X10 ; [10mm] {not-a-var} [a b] [_ok_though]')
    expect(r.unknown).toEqual(['_ok_though'])
  })

  it('is case-sensitive', () => {
    const r = substituteSlicerVariables('[Temperature]', profile())
    expect(r.gcode).toBe('[Temperature]')
    expect(r.unknown).toEqual(['Temperature'])
  })
})
