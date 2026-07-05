import type { AxisScale, MultiPlaneResult, Plane, PlaneAnalysis, PlaneSkew } from './types'
import { planeAxes } from './types'

// Assembles the whole-printer result from however many plates were measured (any subset of XY/XZ/YZ).
// Each plane's two-scan combine already reports scale along its two in-plane axes (first = marker +X,
// second = perpendicular) and its skew. Here we tag each scale with its physical axis and average the
// planes that share an axis (X is on XY and XZ, Y on XY and YZ, Z on XZ and YZ), so an axis measured
// twice becomes one reconciled figure with its sources recorded.

const AXIS_ORDER: ReadonlyArray<'X' | 'Y' | 'Z'> = ['X', 'Y', 'Z']

export function combinePlanes(planes: PlaneAnalysis[]): MultiPlaneResult {
  const skews: PlaneSkew[] = planes.map((p) => ({
    plane: p.plane,
    skewDegrees: p.twoScan.combined.skewDegrees,
  }))

  const samples: Record<'X' | 'Y' | 'Z', { value: number; plane: Plane }[]> = { X: [], Y: [], Z: [] }
  for (const p of planes) {
    const [a1, a2] = planeAxes(p.plane)
    samples[a1].push({ value: p.twoScan.combined.xScalePercent, plane: p.plane })
    samples[a2].push({ value: p.twoScan.combined.yScalePercent, plane: p.plane })
  }

  const scales: AxisScale[] = []
  for (const axis of AXIS_ORDER) {
    const s = samples[axis]
    if (s.length === 0) continue
    scales.push({
      axis,
      scalePercent: s.reduce((sum, x) => sum + x.value, 0) / s.length,
      sources: s.map((x) => x.plane),
    })
  }

  return { planes, skews, scales }
}
