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

  it('never travels far across the open window without retracting first', () => {
    const g = emCouponGeometry(spec)
    const ox = (profile.bedWidthMm - g.couponWidthMm) / 2
    const oy = (profile.bedDepthMm - g.couponHeightMm) / 2
    // Window interior, shrunk a little so band-edge moves do not count.
    const win = {
      x0: ox + g.frameBandMm + 1,
      y0: oy + g.frameBandMm + 1,
      x1: ox + g.couponWidthMm - g.frameBandMm - 1,
      y1: oy + g.couponHeightMm - g.frameBandMm - 1,
    }
    const inWindow = (x: number, y: number) =>
      x > win.x0 && x < win.x1 && y > win.y0 && y < win.y1
    let x = 0
    let y = 0
    let retracted = false
    for (const l of lines) {
      if (/^G1 E-/.test(l)) retracted = true
      else if (/^G1 E[^-]/.test(l)) retracted = false
      const m = l.match(/^G([01]) X(-?[\d.]+) Y(-?[\d.]+)/)
      if (!m) continue
      const nx = Number(m[2])
      const ny = Number(m[3])
      if (m[1] === '0') {
        const len = Math.hypot(nx - x, ny - y)
        const crossesWindow = inWindow((x + nx) / 2, (y + ny) / 2) || inWindow(nx, ny)
        if (len > 5 && crossesWindow) {
          expect(retracted, `unretracted ${len.toFixed(1)}mm travel over the window: ${l}`).toBe(true)
        }
      }
      x = nx
      y = ny
    }
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
    const perLayerStripRetracts = 4 // one per band raster strip
    const layerTransitions = totalLayers - 1
    const expected =
      totalLayers * (perLayerCombRetracts + perLayerStripRetracts) + layerTransitions + 1
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
      // Still retracted for the travel to the frame corner; pressure restored only after it.
      expect(lines[i + 1]).toMatch(/^G0 /)
      expect(lines[i + 2]).toMatch(/^G1 E[^-]/)
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
