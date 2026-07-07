import { describe, expect, it } from 'vitest'
import { substituteSlicerVariables } from '../../../src/engine/pa/slicerVariables'
import { defaultFilamentProfile, defaultPrinterProfile } from '../../../src/engine/pa/types'
import type { FilamentProfile, PrinterProfile } from '../../../src/engine/pa/types'

function printer(overrides: Partial<PrinterProfile> = {}): PrinterProfile {
  return { ...defaultPrinterProfile(), ...overrides }
}

function filament(overrides: Partial<FilamentProfile> = {}): FilamentProfile {
  return { ...defaultFilamentProfile(), ...overrides }
}

function substitute(
  gcode: string,
  p: Partial<PrinterProfile> = {},
  f: Partial<FilamentProfile> = {},
): { gcode: string; unknown: string[]; warnings: string[] } {
  return substituteSlicerVariables(gcode, printer(p), filament(f))
}

describe('substituteSlicerVariables', () => {
  it('substitutes square-bracket variables', () => {
    const r = substitute(
      'M104 S[first_layer_temperature]\nM140 S[first_layer_bed_temperature]',
      {},
      { nozzleTempC: 215, bedTempC: 65 },
    )
    expect(r.gcode).toBe('M104 S215\nM140 S65')
    expect(r.unknown).toEqual([])
  })

  it('substitutes curly-brace variables', () => {
    const r = substitute('M104 S{temperature}', {}, { nozzleTempC: 200 })
    expect(r.gcode).toBe('M104 S200')
  })

  it('ignores a numeric index suffix in both syntaxes', () => {
    const r = substitute('M104 S[first_layer_temperature[0]] T{temperature[0]}', {}, {
      nozzleTempC: 230,
    })
    expect(r.gcode).toBe('M104 S230 T230')
    expect(r.unknown).toEqual([])
  })

  it('maps every documented variable name', () => {
    const p: Partial<PrinterProfile> = {
      layerHeightMm: 0.2,
      nozzleDiameterMm: 0.4,
      travelSpeedMmS: 150,
    }
    const f: Partial<FilamentProfile> = {
      nozzleTempC: 210,
      bedTempC: 60,
      chamberTempC: 40,
      filamentType: 'ABS',
      filamentDiameterMm: 1.75,
    }
    const src = [
      '[first_layer_temperature] [temperature] [nozzle_temperature] [first_layer_nozzle_temperature]',
      '[first_layer_bed_temperature] [bed_temperature] [first_layer_bed_temp]',
      '[chamber_temperature] [chamber_temp]',
      '[filament_type]',
      '[layer_height] [first_layer_height]',
      '[nozzle_diameter] [filament_diameter] [travel_speed]',
    ].join('\n')
    const r = substitute(src, p, f)
    expect(r.gcode).toBe(
      ['210 210 210 210', '60 60 60', '40 40', 'ABS', '0.2 0.2', '0.4 1.75 150'].join('\n'),
    )
    expect(r.unknown).toEqual([])
  })

  it('substitutes the PrusaSlicer PRINT_START example line with default values', () => {
    const r = substitute(
      'M117\nPRINT_START BED=[first_layer_bed_temperature] HOTEND=[first_layer_temperature] FILAMENT_TYPE=[filament_type] CHAMBER_TEMP=[chamber_temperature]',
    )
    expect(r.gcode).toBe(
      'M117\nPRINT_START BED=60 HOTEND=210 FILAMENT_TYPE=PLA CHAMBER_TEMP=0',
    )
    expect(r.unknown).toEqual([])
  })

  it('leaves unknown placeholders verbatim and reports them deduplicated', () => {
    const r = substitute(
      'START [machine_start_gcode] {machine_start_gcode} [machine_start_gcode]',
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
    const r = substitute(src)
    expect(r.gcode).toBe(src)
    expect(r.unknown).toEqual([])
  })

  it('does not treat non-identifier bracket content as a placeholder', () => {
    const src = 'G1 X10 ; [10mm] {not-a-var} [a b] [_ok_though]'
    const r = substitute(src)
    expect(r.gcode).toBe('G1 X10 ; [10mm] {not-a-var} [a b] [_ok_though]')
    expect(r.unknown).toEqual(['_ok_though'])
  })

  it('treats Object.prototype property names as unknown, not as variables', () => {
    const r = substitute('{constructor} [toString] {hasOwnProperty}')
    expect(r.gcode).toBe('{constructor} [toString] {hasOwnProperty}')
    expect(r.unknown).toEqual(['constructor', 'toString', 'hasOwnProperty'])
  })

  it('is case-sensitive', () => {
    const r = substitute('[Temperature]')
    expect(r.gcode).toBe('[Temperature]')
    expect(r.unknown).toEqual(['Temperature'])
  })

  it('evaluates the Klipper tool-changer PRINT_START macro for the single tool', () => {
    const macro =
      'PRINT_START TOOL_TEMP={first_layer_temperature[initial_tool]} {if is_extruder_used[0]}T0_TEMP={first_layer_temperature[0]}{endif} {if is_extruder_used[1]}T1_TEMP={first_layer_temperature[1]}{endif} {if is_extruder_used[2]}T2_TEMP={first_layer_temperature[2]}{endif} {if is_extruder_used[3]}T3_TEMP={first_layer_temperature[3]}{endif} {if is_extruder_used[4]}T4_TEMP={first_layer_temperature[4]}{endif} {if is_extruder_used[5]}T5_TEMP={first_layer_temperature[5]}{endif} BED_TEMP=[first_layer_bed_temperature] TOOL=[initial_tool]'
    const r = substitute(macro, {}, { nozzleTempC: 210, bedTempC: 60 })
    expect(r.gcode.replace(/\s+/g, ' ').trim()).toBe(
      'PRINT_START TOOL_TEMP=210 T0_TEMP=210 BED_TEMP=60 TOOL=0',
    )
    expect(r.unknown).toEqual([])
    expect(r.warnings).toEqual([])
  })

  it('evaluates nested conditionals', () => {
    const src = '{if is_extruder_used[0]}A{if initial_tool == 0}B{endif}C{endif}D'
    const r = substitute(src)
    expect(r.gcode).toBe('ABCD')
    expect(r.unknown).toEqual([])
  })

  it('keeps the else branch when the condition is false', () => {
    const src = '{if is_extruder_used[1]}NO{else}YES{endif}'
    const r = substitute(src)
    expect(r.gcode).toBe('YES')
    expect(r.unknown).toEqual([])
  })

  it('takes an elif branch', () => {
    const src = '{if is_extruder_used[1]}A{elif is_extruder_used[0]}B{else}C{endif}'
    const r = substitute(src)
    expect(r.gcode).toBe('B')
  })

  it('leaves an unresolvable conditional literal with a single warning', () => {
    const src = 'X {if some_unknown_flag > 3}Y{endif} Z'
    const r = substitute(src)
    expect(r.gcode).toBe(src)
    expect(r.unknown).toEqual([])
    expect(r.warnings).toEqual([
      'A conditional block could not be evaluated; review it.',
    ])
  })

  it('reports a genuinely unknown setting even inside a kept branch', () => {
    const src = '{if is_extruder_used[0]}[some_unmapped_setting]{endif}'
    const r = substitute(src)
    expect(r.gcode).toBe('[some_unmapped_setting]')
    expect(r.unknown).toEqual(['some_unmapped_setting'])
  })

  it('never reports if/elif/else/endif as unknown variables', () => {
    const src = '{if is_extruder_used[1]}A{elif is_extruder_used[2]}B{else}C{endif}'
    const r = substitute(src)
    expect(r.unknown).toEqual([])
  })

  it('leaves jinja conditionals untouched and unreported', () => {
    const src = '{% if x %}\nM104 S{printer.extruder.target}\n{% endif %}'
    const r = substitute(src)
    expect(r.gcode).toBe(src)
    expect(r.unknown).toEqual([])
    expect(r.warnings).toEqual([])
  })
})
