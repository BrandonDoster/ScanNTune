import { describe, expect, it } from 'vitest'
import { defaultPrinterProfile } from '../../../src/engine/gcode/profileTypes'
import { defaultIsTestSpec, type IsTestSpec } from '../../../src/engine/is/types'
import {
  BLOCK_GAP_MM,
  INNER_MARGIN_MM,
  isCouponGeometry,
  type IsLineGroup,
} from '../../../src/engine/is/couponGeometry'

const spec = defaultIsTestSpec(defaultPrinterProfile())
const g = isCouponGeometry(spec)

function perpendicularPositions(group: IsLineGroup): number[] {
  return group.lines.map((l) => (group.axis === 'x' ? l.measured.x0 : l.measured.y0))
}

describe('isCouponGeometry fiducials', () => {
  it('places three fiducials and leaves the origin corner solid', () => {
    expect(g.fiducials).toHaveLength(3)
    const nearOrigin = g.fiducials.filter((f) => f.xMm < 20 && f.yMm < 20)
    expect(nearOrigin).toHaveLength(0)
  })
})

describe('isCouponGeometry groups', () => {
  it('builds both groups for axes x and y, one for a single axis', () => {
    expect(g.groups.map((grp) => grp.axis)).toEqual(['x', 'y'])
    const single = isCouponGeometry({ ...spec, axes: ['y'] })
    expect(single.groups.map((grp) => grp.axis)).toEqual(['y'])
  })
  it('emits linesPerSpeed lines per tier, tagged with the tier speed', () => {
    for (const group of g.groups) {
      expect(group.lines).toHaveLength(spec.linesPerSpeed * spec.speedsMmS.length)
      for (let i = 0; i < group.lines.length; i++) {
        expect(group.lines[i].speedMmS).toBe(
          spec.speedsMmS[Math.floor(i / spec.linesPerSpeed)],
        )
      }
    }
  })
  it('spaces lines at the pitch inside a tier and adds the gap between tiers', () => {
    for (const group of g.groups) {
      const pos = perpendicularPositions(group)
      for (let i = 1; i < pos.length; i++) {
        const crossesBlock = i % spec.linesPerSpeed === 0
        const expected = crossesBlock ? spec.linePitchMm + BLOCK_GAP_MM : spec.linePitchMm
        expect(pos[i] - pos[i - 1]).toBeCloseTo(expected, 9)
      }
    }
  })
})

describe('isCouponGeometry line placement', () => {
  it('keeps every run-up leg inside the open window in every axis configuration', () => {
    const specs: IsTestSpec[] = [
      spec,
      { ...spec, axes: ['x'] },
      { ...spec, axes: ['y'] },
      { ...spec, axes: ['x'], speedsMmS: [100, 200], linesPerSpeed: 4 },
      { ...spec, axes: ['y'], speedsMmS: [100, 200], linesPerSpeed: 4 },
      { ...spec, measuredLineMm: 60 },
    ]
    for (const s of specs) {
      const geo = isCouponGeometry(s)
      for (const group of geo.groups) {
        for (const { runUp } of group.lines) {
          // Along the travel direction the leg starts inside the window with the inner
          // margin; across it the leg rides the band edge, one weld length into the band.
          const [start, end, ride] =
            group.axis === 'x'
              ? [runUp.x0, runUp.x1, runUp.y0]
              : [runUp.y0, runUp.y1, runUp.x0]
          const [lo, hi, rideLo] =
            group.axis === 'x'
              ? [geo.windowBox.x0, geo.windowBox.x1, geo.windowBox.y0]
              : [geo.windowBox.y0, geo.windowBox.y1, geo.windowBox.x0]
          expect(start).toBeGreaterThanOrEqual(lo + INNER_MARGIN_MM)
          expect(end).toBeLessThanOrEqual(hi)
          expect(ride).toBeCloseTo(rideLo - s.weldMm, 9)
        }
      }
    }
  })
  it('keeps measured segments inside the window extended by the weld', () => {
    const w = spec.weldMm
    for (const group of g.groups) {
      for (const { measured } of group.lines) {
        for (const x of [measured.x0, measured.x1]) {
          expect(x).toBeGreaterThanOrEqual(g.windowBox.x0 - w)
          expect(x).toBeLessThanOrEqual(g.windowBox.x1 + w)
        }
        for (const y of [measured.y0, measured.y1]) {
          expect(y).toBeGreaterThanOrEqual(g.windowBox.y0 - w)
          expect(y).toBeLessThanOrEqual(g.windowBox.y1 + w)
        }
      }
    }
  })
  it('welds measured segments one weld length into the band at both ends', () => {
    const xGroup = g.groups.find((grp) => grp.axis === 'x')!
    expect(xGroup.lines[0].measured.y0).toBeCloseTo(g.windowBox.y0 - spec.weldMm, 9)
    expect(xGroup.lines[0].measured.y1).toBeCloseTo(g.windowBox.y1 + spec.weldMm, 9)
    const yGroup = g.groups.find((grp) => grp.axis === 'y')!
    expect(yGroup.lines[0].measured.x0).toBeCloseTo(g.windowBox.x0 - spec.weldMm, 9)
    expect(yGroup.lines[0].measured.x1).toBeCloseTo(g.windowBox.x1 + spec.weldMm, 9)
  })
  it('shares the corner vertex between the run-up end and the measured start', () => {
    for (const group of g.groups) {
      for (const { runUp, measured } of group.lines) {
        expect(runUp.x1).toBeCloseTo(measured.x0, 9)
        expect(runUp.y1).toBeCloseTo(measured.y0, 9)
      }
    }
  })
  it('measures along the axis-specific direction with the run-up perpendicular to it', () => {
    const xGroup = g.groups.find((grp) => grp.axis === 'x')!
    expect(xGroup.lines[0].measured.y1).toBeGreaterThan(xGroup.lines[0].measured.y0)
    expect(xGroup.lines[0].runUp.x1).toBeGreaterThan(xGroup.lines[0].runUp.x0)
    const yGroup = g.groups.find((grp) => grp.axis === 'y')!
    expect(yGroup.lines[0].measured.x1).toBeGreaterThan(yGroup.lines[0].measured.x0)
    expect(yGroup.lines[0].runUp.y1).toBeGreaterThan(yGroup.lines[0].runUp.y0)
  })
  it('keeps no run-up leg inside the other group boundingBox', () => {
    const [xGroup, yGroup] = g.groups
    for (const { runUp } of xGroup.lines) {
      // X-group legs travel along the bottom band, below the Y group field.
      expect(Math.max(runUp.y0, runUp.y1)).toBeLessThan(yGroup.lines[0].measured.y0)
    }
    for (const { runUp } of yGroup.lines) {
      expect(Math.max(runUp.x0, runUp.x1)).toBeLessThan(xGroup.lines[0].measured.x0)
    }
  })
})

describe('isCouponGeometry footprint', () => {
  it('stays within 160 mm on each side for the defaults', () => {
    expect(g.couponWidthMm).toBeLessThanOrEqual(160)
    expect(g.couponHeightMm).toBeLessThanOrEqual(160)
  })
  it('narrows the field dimension for a single axis', () => {
    const single: IsTestSpec = { ...spec, axes: ['x'] }
    const sg = isCouponGeometry(single)
    expect(sg.couponWidthMm).toBeLessThan(sg.couponHeightMm)
    expect(sg.couponHeightMm).toBeCloseTo(g.couponHeightMm, 9)
  })
})
