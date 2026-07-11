import type { IsAxis, IsTestSpec } from './types'

export const FRAME_BAND_MM = 12
export const FIDUCIAL_INSET_MM = 4
export const FIDUCIAL_SIZE_MM = 5
export const INNER_MARGIN_MM = 3
export const BLOCK_GAP_MM = 2

/** An axis-aligned segment or rectangle in coupon-local mm, origin at the min corner. */
export interface IsSegment {
  x0: number
  y0: number
  x1: number
  y1: number
}

export type IsBox = IsSegment

export interface IsLine {
  speedMmS: number
  /** The straight approach leg that rings the axis; it ends at the sharp corner. */
  runUp: IsSegment
  /** The measured segment; it starts at the corner and welds into the band at both ends. */
  measured: IsSegment
}

export interface IsLineGroup {
  axis: IsAxis
  lines: IsLine[]
  boundingBox: IsBox
}

export interface IsCouponGeometry {
  couponWidthMm: number
  couponHeightMm: number
  frameBandMm: number
  fiducialInsetMm: number
  fiducialSizeMm: number
  /** Hole centers; the (min-x, min-y) origin corner deliberately has none (PA convention). */
  fiducials: { xMm: number; yMm: number }[]
  groups: IsLineGroup[]
  /** The open interior of the frame. */
  windowBox: IsBox
}

/**
 * Perpendicular offsets of every line in a group, ordered by speed tier then line index.
 * Lines within a tier sit one pitch apart; consecutive tiers are separated by an extra gap.
 */
function lineOffsets(spec: IsTestSpec): number[] {
  const blockSpan = (spec.linesPerSpeed - 1) * spec.linePitchMm
  const blockStep = blockSpan + spec.linePitchMm + BLOCK_GAP_MM
  const offsets: number[] = []
  for (let block = 0; block < spec.speedsMmS.length; block++) {
    for (let j = 0; j < spec.linesPerSpeed; j++) {
      offsets.push(block * blockStep + j * spec.linePitchMm)
    }
  }
  return offsets
}

/** Extent of a group's line field perpendicular to its measured direction. */
export function fieldExtentMm(spec: IsTestSpec): number {
  const offsets = lineOffsets(spec)
  return offsets[offsets.length - 1]
}

/**
 * Clear space a group needs before its first line, so every run-up leg starts inside the
 * open window with the inner margin between the leg start and the window edge.
 */
function leadMm(spec: IsTestSpec): number {
  return spec.runUpMm + INNER_MARGIN_MM
}

/** Perpendicular room a group's field claims, including the lead and the trailing margin. */
export function fieldSideMm(spec: IsTestSpec): number {
  return leadMm(spec) + fieldExtentMm(spec) + INNER_MARGIN_MM
}

function boundingBox(lines: IsLine[]): IsBox {
  const xs = lines.flatMap((l) => [l.runUp.x0, l.runUp.x1, l.measured.x0, l.measured.x1])
  const ys = lines.flatMap((l) => [l.runUp.y0, l.runUp.y1, l.measured.y0, l.measured.y1])
  return { x0: Math.min(...xs), y0: Math.min(...ys), x1: Math.max(...xs), y1: Math.max(...ys) }
}

/**
 * X-axis group: measured segments travel +Y across the window, entered via a run-up leg
 * traveling +X along the inside of the bottom band. The field hugs the far-X side of the
 * interior so the Y group's ringing zone (near the left band) stays clear of it.
 */
function buildXGroup(spec: IsTestSpec, couponW: number, couponH: number): IsLineGroup {
  const offsets = lineOffsets(spec)
  const firstX = couponW - FRAME_BAND_MM - INNER_MARGIN_MM - fieldExtentMm(spec)
  const yStart = FRAME_BAND_MM - spec.weldMm
  const yEnd = couponH - FRAME_BAND_MM + spec.weldMm
  const lines = offsets.map((off, i) => {
    const x = firstX + off
    return {
      speedMmS: spec.speedsMmS[Math.floor(i / spec.linesPerSpeed)],
      runUp: { x0: x - spec.runUpMm, y0: yStart, x1: x, y1: yStart },
      measured: { x0: x, y0: yStart, x1: x, y1: yEnd },
    }
  })
  return { axis: 'x', lines, boundingBox: boundingBox(lines) }
}

/**
 * Y-axis group, mirrored: measured segments travel +X, entered via a run-up leg traveling
 * +Y along the inside of the left band. The field hugs the far-Y side of the interior.
 */
function buildYGroup(spec: IsTestSpec, couponW: number, couponH: number): IsLineGroup {
  const offsets = lineOffsets(spec)
  const firstY = couponH - FRAME_BAND_MM - INNER_MARGIN_MM - fieldExtentMm(spec)
  const xStart = FRAME_BAND_MM - spec.weldMm
  const xEnd = couponW - FRAME_BAND_MM + spec.weldMm
  const lines = offsets.map((off, i) => {
    const y = firstY + off
    return {
      speedMmS: spec.speedsMmS[Math.floor(i / spec.linesPerSpeed)],
      runUp: { x0: xStart, y0: y - spec.runUpMm, x1: xStart, y1: y },
      measured: { x0: xStart, y0: y, x1: xEnd, y1: y },
    }
  })
  return { axis: 'y', lines, boundingBox: boundingBox(lines) }
}

/**
 * Coupon-local layout. Both groups share one open window: the X group's vertical measured
 * lines sit near the +X band and the Y group's horizontal lines near the +Y band, so each
 * group's ringing zone (just past its corner, near the origin-side bands) is free of the
 * other group's lines; the groups only cross each other in the far corner, well past both
 * measurement zones, and no run-up leg crosses the other group's measured field.
 */
export function isCouponGeometry(spec: IsTestSpec): IsCouponGeometry {
  const hasX = spec.axes.includes('x')
  const hasY = spec.axes.includes('y')
  const span = spec.measuredLineMm - 2 * spec.weldMm
  const field = fieldSideMm(spec)
  // A measured span fixes the interior size along its travel direction; the perpendicular
  // direction only needs the field. With both axes the interior is the larger of the two.
  const interiorW = hasY ? Math.max(span, hasX ? field : 0) : field
  const interiorH = hasX ? Math.max(span, hasY ? field : 0) : field
  const couponWidthMm = interiorW + 2 * FRAME_BAND_MM
  const couponHeightMm = interiorH + 2 * FRAME_BAND_MM

  const groups: IsLineGroup[] = []
  if (hasX) groups.push(buildXGroup(spec, couponWidthMm, couponHeightMm))
  if (hasY) groups.push(buildYGroup(spec, couponWidthMm, couponHeightMm))

  const inset = FIDUCIAL_INSET_MM
  const size = FIDUCIAL_SIZE_MM
  return {
    couponWidthMm,
    couponHeightMm,
    frameBandMm: FRAME_BAND_MM,
    fiducialInsetMm: inset,
    fiducialSizeMm: size,
    fiducials: [
      { xMm: couponWidthMm - inset - size / 2, yMm: inset + size / 2 },
      { xMm: couponWidthMm - inset - size / 2, yMm: couponHeightMm - inset - size / 2 },
      { xMm: inset + size / 2, yMm: couponHeightMm - inset - size / 2 },
    ],
    groups,
    windowBox: {
      x0: FRAME_BAND_MM,
      y0: FRAME_BAND_MM,
      x1: couponWidthMm - FRAME_BAND_MM,
      y1: couponHeightMm - FRAME_BAND_MM,
    },
  }
}
