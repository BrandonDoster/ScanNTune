import { describe, expect, it } from 'vitest'
import { defaultFilamentProfile, defaultPrinterProfile } from '../../../src/engine/pa/types'
import type { PrinterProfile } from '../../../src/engine/gcode/profileTypes'
import {
  extrusionMm,
  MEASURED_LAYERS,
  NOMINAL_WIDTH_FACTOR,
  PEDESTAL_LAYERS,
  PEDESTAL_WIDTH_FACTOR,
} from '../../../src/engine/gcode/emitter'
import { isCouponGeometry } from '../../../src/engine/is/couponGeometry'
import { defaultIsTestSpec } from '../../../src/engine/is/types'
import { generateIsGcodeWithReport } from '../../../src/engine/is/gcodeGenerator'

const profile = defaultPrinterProfile()
const filament = defaultFilamentProfile()
const spec = defaultIsTestSpec(profile)
const nominal = profile.nozzleDiameterMm * NOMINAL_WIDTH_FACTOR

/** E value of a full measured segment at the given width, from the coupon geometry. */
function measuredEValue(widthMm: number): string {
  const g = isCouponGeometry(spec)
  const seg = g.groups[0].lines[0].measured
  const len = Math.hypot(seg.x1 - seg.x0, seg.y1 - seg.y0)
  return extrusionMm(len, widthMm, profile.layerHeightMm, filament.filamentDiameterMm).toFixed(5)
}

const firstExtrusionIndex = (lines: string[]) => lines.findIndex((l) => /^G1 .*E-?[\d.]/.test(l))
// The last printing move; the final retract (a bare G1 E-) sits after the restore block.
const lastExtrusionIndex = (lines: string[]) => {
  for (let i = lines.length - 1; i >= 0; i--) if (/^G1 X.*E[\d.]/.test(lines[i])) return i
  return -1
}

describe('generateIsGcodeWithReport (Klipper)', () => {
  const report = generateIsGcodeWithReport(profile, filament, spec)
  const lines = report.gcode.split('\n')

  it('emits a header, start gcode, and relative extrusion setup', () => {
    expect(lines[0]).toBe('; ScanNTune input shaper resonance test')
    expect(lines[1]).toContain('speed tiers 100, 200, 300 mm/s')
    expect(report.gcode).toContain('M83')
    expect(report.gcode).toContain('G90')
  })

  it('sets the test motion limits with zero cruise ratio before the first extrusion', () => {
    const limit = lines.indexOf(
      'SET_VELOCITY_LIMIT ACCEL=3000 SQUARE_CORNER_VELOCITY=5 MINIMUM_CRUISE_RATIO=0',
    )
    expect(limit).toBeGreaterThan(0)
    expect(limit).toBeLessThan(firstExtrusionIndex(lines))
  })

  it('disables input shaping and pressure advance before any extrusion', () => {
    const shaper = lines.indexOf('SET_INPUT_SHAPER SHAPER_FREQ_X=0 SHAPER_FREQ_Y=0')
    const pa = lines.indexOf('SET_PRESSURE_ADVANCE ADVANCE=0')
    const first = firstExtrusionIndex(lines)
    expect(shaper).toBeGreaterThan(0)
    expect(pa).toBeGreaterThan(0)
    expect(shaper).toBeLessThan(first)
    expect(pa).toBeLessThan(first)
  })

  it('places the restore comments after the last extrusion', () => {
    const last = lastExtrusionIndex(lines)
    const shaper = lines.findIndex((l) => l.includes('input shaping resumes'))
    const pa = lines.findIndex((l) => l.includes('pressure advance resumes'))
    expect(shaper).toBeGreaterThan(last)
    expect(pa).toBeGreaterThan(last)
  })

  it('restores the profile motion limits after the test', () => {
    const restore = lines.lastIndexOf('SET_VELOCITY_LIMIT ACCEL=3000 SQUARE_CORNER_VELOCITY=5')
    expect(restore).toBeGreaterThan(lastExtrusionIndex(lines))
  })

  it('never pauses (single color print)', () => {
    expect(report.gcode).not.toContain('PAUSE')
  })

  it('prints one pedestal layer and two measured layers', () => {
    const zMoves = lines.filter((l) => l.startsWith('G1 Z'))
    const zs = [...new Set(zMoves.map((l) => l.match(/Z([\d.]+)/)![1]))]
    expect(PEDESTAL_LAYERS + MEASURED_LAYERS).toBe(3)
    expect(zs).toEqual(['0.200', '0.400', '0.600', '10'])
  })

  it('emits one measured segment per line per layer at each tier speed', () => {
    const measuredE = measuredEValue(nominal)
    for (const speed of spec.speedsMmS) {
      const moves = lines.filter((l) => l.includes(`E${measuredE} F${speed * 60}`))
      expect(moves.length).toBe(MEASURED_LAYERS * spec.axes.length * spec.linesPerSpeed)
    }
    const pedestalE = measuredEValue(PEDESTAL_WIDTH_FACTOR * nominal)
    const pedestalMoves = lines.filter((l) => l.includes(`E${pedestalE}`))
    expect(pedestalMoves.length).toBe(
      PEDESTAL_LAYERS * spec.axes.length * spec.speedsMmS.length * spec.linesPerSpeed,
    )
  })

  it('caps the pedestal layer lines to the band fill speed so they stick', () => {
    const pedestalE = measuredEValue(PEDESTAL_WIDTH_FACTOR * nominal)
    const fillF = Math.round((profile.travelSpeedMmS / 3) * 60)
    for (const l of lines) {
      if (!l.includes(`E${pedestalE}`)) continue
      expect(Number(l.match(/F(\d+)$/)![1])).toBeLessThanOrEqual(fillF)
    }
  })

  it('extrudes through the corner continuously (run-up directly before each measured segment)', () => {
    const measuredE = measuredEValue(nominal)
    for (let i = 0; i < lines.length; i++) {
      if (!lines[i].includes(`E${measuredE}`)) continue
      const speed = lines[i].match(/F(\d+)$/)![1]
      expect(lines[i - 1], `line before ${lines[i]}`).toMatch(
        new RegExp(`^G1 X-?[\\d.]+ Y-?[\\d.]+ E[\\d.]+ F${speed}$`),
      )
    }
  })

  it('never travels far across the open window without retracting first', () => {
    const g = isCouponGeometry(spec)
    const ox = (profile.bedWidthMm - g.couponWidthMm) / 2
    const oy = (profile.bedDepthMm - g.couponHeightMm) / 2
    // Window interior, shrunk a little so band-edge moves do not count.
    const win = {
      x0: ox + g.windowBox.x0 + 1,
      y0: oy + g.windowBox.y0 + 1,
      x1: ox + g.windowBox.x1 - 1,
      y1: oy + g.windowBox.y1 - 1,
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

  it('keeps every coordinate on the bed with the centered placement', () => {
    const g = isCouponGeometry(spec)
    const oy = (profile.bedDepthMm - g.couponHeightMm) / 2
    for (const m of report.gcode.matchAll(/^G[01] X(-?[\d.]+) Y(-?[\d.]+)/gm)) {
      expect(Number(m[1])).toBeGreaterThanOrEqual(0)
      expect(Number(m[1])).toBeLessThanOrEqual(profile.bedWidthMm)
      expect(Number(m[2])).toBeGreaterThanOrEqual(0)
      expect(Number(m[2])).toBeLessThanOrEqual(profile.bedDepthMm)
    }
    const ys = [...report.gcode.matchAll(/^G1 X-?[\d.]+ Y(-?[\d.]+) E[\d.]/gm)].map((m) =>
      Number(m[1]),
    )
    expect(Math.min(...ys)).toBeGreaterThanOrEqual(oy - 0.001)
    expect(Math.max(...ys)).toBeLessThanOrEqual(oy + g.couponHeightMm + 0.001)
  })

  it('warns on the high-flow 300 mm/s tier instead of capping the speed', () => {
    expect(report.warnings.some((w) => w.includes('300 mm/s') && w.includes('mm^3/s'))).toBe(true)
    expect(report.gcode).toContain('F18000')
  })
})

describe('generateIsGcodeWithReport (Marlin and RepRapFirmware)', () => {
  it('uses Marlin commands for limits, disable, and restore', () => {
    const marlin: PrinterProfile = { ...profile, firmware: 'Marlin' }
    const g = generateIsGcodeWithReport(marlin, filament, spec).gcode
    expect(g).toContain('M204 P3000 T3000')
    expect(g).toContain('M205 X5 Y5')
    expect(g).toContain('M593 F0')
    expect(g).toContain('M900 K0')
    expect(g).not.toContain('SET_VELOCITY_LIMIT')
  })

  it('uses RepRapFirmware commands for limits, disable, and restore', () => {
    const rrf: PrinterProfile = { ...profile, firmware: 'RepRapFirmware' }
    const g = generateIsGcodeWithReport(rrf, filament, spec).gcode
    expect(g).toContain('M204 P3000 T3000')
    expect(g).toContain('M566 X300 Y300')
    expect(g).toContain('M593 P"none"')
    expect(g).toContain('M572 D0 S0')
  })
})

describe('bed fitting', () => {
  it('drops the 300 mm/s tier with a note when the coupon overflows a 180 mm bed', () => {
    const small: PrinterProfile = { ...profile, bedWidthMm: 180, bedDepthMm: 180 }
    const wide = { ...spec, linesPerSpeed: 6, linePitchMm: 10 }
    const r = generateIsGcodeWithReport(small, filament, wide)
    expect(r.warnings.some((w) => w.includes('300 mm/s') && w.includes('removed'))).toBe(true)
    expect(r.gcode).not.toContain('F18000')
    expect(r.gcode).toContain('F12000')
  })

  it('throws when even the smallest coupon overflows the bed', () => {
    const tiny: PrinterProfile = { ...profile, bedWidthMm: 70, bedDepthMm: 70 }
    expect(() => generateIsGcodeWithReport(tiny, filament, spec)).toThrow(/fit/i)
  })
})

describe('validation and reporting', () => {
  it('propagates the spec validation throws', () => {
    expect(() =>
      generateIsGcodeWithReport(profile, filament, { ...spec, linesPerSpeed: 1 }),
    ).toThrow(/lines per speed/i)
    expect(() => generateIsGcodeWithReport(profile, filament, { ...spec, axes: [] })).toThrow(
      /axis/i,
    )
    expect(() =>
      generateIsGcodeWithReport(profile, filament, { ...spec, speedsMmS: [100] }),
    ).toThrow(/speed tiers/i)
  })

  it('reports unknown slicer variables from the start gcode', () => {
    const weird: PrinterProfile = { ...profile, startGcode: 'M104 S[not_a_real_variable]' }
    const r = generateIsGcodeWithReport(weird, filament, spec)
    expect(r.unknownVariables).toContain('not_a_real_variable')
  })

  it('warns when the start gcode sets no temperatures', () => {
    const cold: PrinterProfile = { ...profile, startGcode: 'G28' }
    const r = generateIsGcodeWithReport(cold, filament, spec)
    expect(r.warnings.some((w) => w.includes('sets no temperatures'))).toBe(true)
  })

  it('uses the profile acceleration without an upper cap', () => {
    const fast: PrinterProfile = { ...profile, printAccelMmS2: 20000 }
    const spec20k = defaultIsTestSpec(fast)
    expect(spec20k.accelMmS2).toBe(20000)
    const g = generateIsGcodeWithReport(fast, filament, spec20k).gcode
    expect(g).toContain('SET_VELOCITY_LIMIT ACCEL=20000 SQUARE_CORNER_VELOCITY=5 MINIMUM_CRUISE_RATIO=0')
  })
})
