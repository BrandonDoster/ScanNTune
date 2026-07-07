import { describe, expect, it } from 'vitest'
import { generatePaGcode, extrusionMm } from '../../../src/engine/pa/gcodeGenerator'
import { defaultPrinterProfile, defaultPaTestSpec, paValueForLine, couponGeometry } from '../../../src/engine/pa/types'

describe('extrusionMm', () => {
  it('computes E from the standard volumetric flow formula', () => {
    // 100 mm of 0.45 x 0.2 mm bead from 1.75 mm filament:
    // E = (0.45 * 0.2 * 100) / (pi * 0.875^2) = 3.7417...
    expect(extrusionMm(100, 0.45, 0.2, 1.75)).toBeCloseTo(3.7417, 3)
  })
})

describe('generatePaGcode', () => {
  const profile = defaultPrinterProfile()
  const spec = defaultPaTestSpec()

  it('emits temps, start gcode, and relative extrusion', () => {
    const g = generatePaGcode(profile, spec)
    expect(g).toContain('M104 S210')
    expect(g).toContain('M140 S60')
    expect(g).toContain('M190 S60')
    expect(g).toContain('M109 S210')
    expect(g).toContain('G28')
    expect(g).toContain('M83')
  })

  it('emits one PA command per line with the stepped value', () => {
    const g = generatePaGcode(profile, spec)
    for (let i = 0; i < spec.lineCount; i++) {
      const v = paValueForLine(spec, i)
      expect(g).toContain(`SET_PRESSURE_ADVANCE ADVANCE=${v.toFixed(4)}`)
    }
  })

  it('uses M900 for Marlin and M572 for RepRap', () => {
    const marlin = generatePaGcode({ ...profile, firmware: 'Marlin' }, spec)
    expect(marlin).toContain('M900 K0.0000')
    const rrf = generatePaGcode({ ...profile, firmware: 'RepRapFirmware' }, spec)
    expect(rrf).toContain('M572 D0 S0.0000')
  })

  it('resets PA to 0 after the filament swap, before the prime line and before the first stepped PA command', () => {
    const g = generatePaGcode(profile, spec)
    const zeroPaAt = g.indexOf('SET_PRESSURE_ADVANCE ADVANCE=0.0000')
    expect(zeroPaAt).toBeGreaterThan(0)
    const primeLineAt = g.indexOf(`E${extrusionMm(
      couponGeometry(spec).baseWidthMm - 4,
      spec.lineWidthMm,
      profile.layerHeightMm,
      profile.filamentDiameterMm,
    ).toFixed(5)}`)
    expect(primeLineAt).toBeGreaterThan(0)
    expect(zeroPaAt).toBeLessThan(primeLineAt)
    const firstSteppedPaAt = g.indexOf(
      `SET_PRESSURE_ADVANCE ADVANCE=${paValueForLine(spec, 0).toFixed(4)}`,
      zeroPaAt + 1,
    )
    expect(firstSteppedPaAt).toBeGreaterThan(zeroPaAt)
  })

  it('emits the pause gcode exactly once, between base and lines', () => {
    const g = generatePaGcode(profile, spec)
    const pauseAt = g.indexOf('\nPAUSE\n')
    expect(pauseAt).toBeGreaterThan(0)
    const firstPa = g.indexOf('SET_PRESSURE_ADVANCE')
    expect(pauseAt).toBeLessThan(firstPa)
    expect(g.indexOf('\nPAUSE\n', pauseAt + 1)).toBe(-1)
  })

  it('keeps all XY moves on the bed', () => {
    const g = generatePaGcode(profile, spec)
    for (const line of g.split('\n')) {
      const mx = /X(-?\d+(?:\.\d+)?)/.exec(line)
      const my = /Y(-?\d+(?:\.\d+)?)/.exec(line)
      if (mx) {
        expect(Number(mx[1])).toBeGreaterThanOrEqual(0)
        expect(Number(mx[1])).toBeLessThanOrEqual(profile.bedWidthMm)
      }
      if (my) {
        expect(Number(my[1])).toBeGreaterThanOrEqual(0)
        expect(Number(my[1])).toBeLessThanOrEqual(profile.bedDepthMm)
      }
    }
  })

  it('never extrudes across a fiducial hole on base layers', () => {
    const g = generatePaGcode(profile, spec)
    const geo = couponGeometry(spec)
    const ox = (profile.bedWidthMm - geo.baseWidthMm) / 2
    const oy = (profile.bedDepthMm - geo.baseHeightMm) / 2
    const holes = geo.fiducials.map((f) => ({
      x0: ox + f.xMm - geo.fiducialSizeMm / 2,
      y0: oy + f.yMm - geo.fiducialSizeMm / 2,
      x1: ox + f.xMm + geo.fiducialSizeMm / 2,
      y1: oy + f.yMm + geo.fiducialSizeMm / 2,
    }))
    const pauseAt = g.indexOf('\nPAUSE\n')
    let x = 0
    let y = 0
    for (const line of g.slice(0, pauseAt).split('\n')) {
      const mx = /X(-?\d+\.?\d*)/.exec(line)
      const my = /Y(-?\d+\.?\d*)/.exec(line)
      const me = /E(\d+\.?\d*)/.exec(line)
      const nx = mx ? Number(mx[1]) : x
      const ny = my ? Number(my[1]) : y
      if (me && Number(me[1]) > 0 && (mx || my)) {
        // Sample the segment densely; every sample must be outside all holes.
        for (let t = 0; t <= 1.0001; t += 0.02) {
          const sx = x + (nx - x) * t
          const sy = y + (ny - y) * t
          for (const h of holes) {
            const insideX = sx > h.x0 + 0.01 && sx < h.x1 - 0.01
            const insideY = sy > h.y0 + 0.01 && sy < h.y1 - 0.01
            expect(insideX && insideY).toBe(false)
          }
        }
      }
      x = nx
      y = ny
    }
  })

  it('ends with the end gcode', () => {
    const g = generatePaGcode(profile, spec)
    expect(g.trimEnd().endsWith('M84')).toBe(true)
  })
})
