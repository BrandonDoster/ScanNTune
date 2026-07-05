import { describe, it, expect } from 'vitest'
import { mapGrid } from '../../src/engine/gridMapper'
import { defaultCouponSpec } from '../../src/engine/types'
import type { DetectedRing } from '../../src/engine/types'

// Mirrors ScanNTune.Tests/GridMapperToleranceTests.cs.
const PitchPx = 100.0
const spec = defaultCouponSpec()

// A perfect 5x5 grid of detections at 100 px pitch, minus the given vertices.
function grid(...missing: Array<[number, number]>): DetectedRing[] {
  const gone = new Set(missing.map(([c, r]) => `${c},${r}`))
  const rings: DetectedRing[] = []
  for (let c = 0; c < 5; c++) {
    for (let r = 0; r < 5; r++) {
      if (gone.has(`${c},${r}`)) continue
      rings.push({ centerX: c * PitchPx, centerY: r * PitchPx, radiusPx: 20.0, circularity: 0.8 })
    }
  }
  return rings
}

describe('grid mapper tolerance', () => {
  it('one stray missed hole is tolerated', () => {
    const mapping = mapGrid(grid([0, 0], [1, 0], [2, 2]), spec)
    expect(mapping.points).toHaveLength(22)
  })

  it('two stray missed holes are rejected', () => {
    expect(() => mapGrid(grid([0, 0], [1, 0], [2, 2], [3, 1]), spec)).toThrow(/missing/)
  })

  it('a whole missing outer row is rejected', () => {
    expect(() =>
      mapGrid(grid([0, 0], [1, 0], [0, 4], [1, 4], [2, 4], [3, 4], [4, 4]), spec),
    ).toThrow(/missing/)
  })

  it('a stray miss adjacent to the marker corner is rejected as ambiguous', () => {
    expect(() => mapGrid(grid([0, 0], [1, 0], [0, 1]), spec)).toThrow(/ambiguous/)
  })
})
