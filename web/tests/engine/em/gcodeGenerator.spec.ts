import { describe, expect, it } from 'vitest'
import { defaultFilamentProfile, defaultPrinterProfile } from '../../../src/engine/pa/types'
import { defaultEmTestSpec, emCouponGeometry, PEDESTAL_WIDTH_FACTOR } from '../../../src/engine/em/types'
import { extrusionMm } from '../../../src/engine/gcode/emitter'
import {
  generateEmGcodeWithReport,
} from '../../../src/engine/em/gcodeGenerator'

const profile = defaultPrinterProfile()
const filament = defaultFilamentProfile()
const spec = defaultEmTestSpec(profile)

describe('generateEmGcodeWithReport', () => {
  const report = generateEmGcodeWithReport(profile, filament, spec)
  const lines = report.gcode.split('\n')

  it('emits a header, start gcode, and motion limits', () => {
    expect(lines[0]).toContain('extrusion multiplier test')
    expect(report.gcode).toContain('M83')
    expect(report.gcode).toContain('G90')
    expect(report.gcode).toContain('SET_VELOCITY_LIMIT') // Klipper default profile
  })

  it('prints four layers', () => {
    const zMoves = lines.filter((l) => l.startsWith('G1 Z'))
    const zs = [...new Set(zMoves.map((l) => l.match(/Z([\d.]+)/)![1]))]
    expect(zs).toEqual(['0.200', '0.400', '0.600', '0.800', '10'])
  })

  it('contains no pause and no flow commands', () => {
    expect(report.gcode).not.toContain('PAUSE')
    expect(report.gcode).not.toContain('M221')
  })

  it('uses the pedestal width on layer 1 and the nominal width on layer 4 for comb lines', () => {
    // A full-length vertical comb line's E value identifies its commanded width.
    const eFor = (w: number) =>
      extrusionMm(spec.lineLengthMm, w, profile.layerHeightMm, filament.filamentDiameterMm)
    const pedestalE = eFor(PEDESTAL_WIDTH_FACTOR * spec.nominalLineWidthMm).toFixed(5)
    const nominalE = eFor(spec.nominalLineWidthMm).toFixed(5)
    expect(report.gcode).toContain(`E${pedestalE}`)
    expect(report.gcode).toContain(`E${nominalE}`)
  })

  it('emits one comb move per line per layer', () => {
    const g = emCouponGeometry(spec)
    const eFor = (w: number) =>
      extrusionMm(spec.lineLengthMm, w, profile.layerHeightMm, filament.filamentDiameterMm)
    const nominalE = `E${eFor(spec.nominalLineWidthMm).toFixed(5)}`
    const combMoves = lines.filter((l) => l.includes(nominalE))
    // 2 measured layers x 2 rows x blockCount x linesPerBlock
    expect(combMoves.length).toBe(2 * 2 * spec.blockCount * spec.linesPerBlock)
    expect(g.topRow).toHaveLength(spec.blockCount)
  })

  it('throws when the coupon exceeds the bed', () => {
    const tiny = { ...profile, bedWidthMm: 50, bedDepthMm: 50 }
    expect(() => generateEmGcodeWithReport(tiny, filament, spec)).toThrow(/fit/i)
  })

  it('retracts and unretracts across every layer transition (no ooze drag)', () => {
    // Negative-E retract lines: one retract per block per row per layer (retract only, the
    // matching unretract is a positive-E line), plus one retract+unretract pair (2 negative-E
    // lines... only the retract half is negative) at each of the 3 layer transitions, plus the
    // final retract before the end gcode.
    const retractLines = lines.filter((l) => /^G1 E-/.test(l))
    const totalLayers = 4 // PEDESTAL_LAYERS + MEASURED_LAYERS from defaultEmTestSpec's profile
    const perLayerCombRetracts = 2 * spec.blockCount // 2 rows x blockCount blocks
    const layerTransitions = totalLayers - 1
    const expected = totalLayers * perLayerCombRetracts + layerTransitions + 1 // +1 final retract
    expect(retractLines.length).toBe(expected)
  })

  it('does not travel directly from the last comb of one layer to the first frame move of the next', () => {
    // Every G1 Z line for layer > 0 must be immediately preceded by a retract.
    const layerZs = ['0.200', '0.400', '0.600', '0.800']
    const zIndexes = lines
      .map((l, i) => ({ l, i }))
      .filter(({ l }) => layerZs.some((z) => l === `G1 Z${z} F600`))
      .map(({ i }) => i)
    expect(zIndexes.length).toBe(4) // the four layer-loop Z pushes, not the end gcode's lift
    for (const i of zIndexes.slice(1)) {
      expect(lines[i - 1]).toMatch(/^G1 E-/)
      expect(lines[i + 1]).toMatch(/^G1 E[^-]/)
    }
  })

  it('stays inside the bed even when the coupon nearly fills it', () => {
    const g = emCouponGeometry(spec)
    const tight = { ...profile, bedWidthMm: g.couponWidthMm + 0.5, bedDepthMm: g.couponHeightMm + 0.5 }
    const r = generateEmGcodeWithReport(tight, filament, spec)
    const coords = [...r.gcode.matchAll(/[XY](-?[\d.]+)/g)].map((m) => Number(m[1]))
    expect(coords.every((v) => v >= 0)).toBe(true)
  })

  it('throws on a non-positive line length', () => {
    const bad = { ...spec, lineLengthMm: 0 }
    expect(() => generateEmGcodeWithReport(profile, filament, bad)).toThrow(/line length/i)
  })

  it('throws on a non-positive nominal line width', () => {
    const bad = { ...spec, nominalLineWidthMm: -1 }
    expect(() => generateEmGcodeWithReport(profile, filament, bad)).toThrow(/line width/i)
  })

  it('warns on high volumetric flow instead of blocking', () => {
    const fast = { ...spec, printSpeedMmS: 300 }
    const r = generateEmGcodeWithReport(profile, filament, fast)
    expect(r.warnings.some((w) => w.includes('mm^3/s'))).toBe(true)
  })

  it('warns when acceleration ramps eat the line middle', () => {
    const slowAccel = { ...profile, printAccelMmS2: 500 }
    const fast = { ...spec, printSpeedMmS: 300 }
    const r = generateEmGcodeWithReport(slowAccel, filament, fast)
    expect(r.warnings.some((w) => w.toLowerCase().includes('speed'))).toBe(true)
  })

  it('reports unknown slicer variables from the start gcode', () => {
    const weird = { ...profile, startGcode: 'M104 S[not_a_real_variable]' }
    const r = generateEmGcodeWithReport(weird, filament, spec)
    expect(r.unknownVariables).toContain('not_a_real_variable')
  })
})
