import type { IsAxis, IsTestSpec } from './types'

export const MIN_FRAME_BAND_MM = 12
export const FIDUCIAL_INSET_MM = 4
export const FIDUCIAL_SIZE_MM = 5
export const INNER_MARGIN_MM = 3
export const BLOCK_GAP_MM = 2
/** Length of the moving prime at the start of each approach leg. */
export const PRIME_MM = 3
/** Added to the kinematic deceleration distance to absorb planner rounding. */
export const TAIL_MARGIN_MM = 1
/** Clearance kept between a tail's stop point and the coupon outer perimeter. */
export const TAIL_EDGE_CLEARANCE_MM = 1

/** Distance to reach `speedMmS` from rest (or stop from it) at `accelMmS2`: v^2 / (2a). */
export function accelRampMm(speedMmS: number, accelMmS2: number): number {
  return (speedMmS * speedMmS) / (2 * accelMmS2)
}

/**
 * How deep into the frame band a line's deceleration tail ends, measured from the window
 * edge: the weld overrun plus the kinematic stopping distance. The band is sized so the
 * deepest tail still keeps its edge clearance; no clamp is needed.
 */
function tailDepthMm(speedMmS: number, spec: IsTestSpec): number {
  return spec.weldMm + accelRampMm(speedMmS, spec.accelMmS2) + TAIL_MARGIN_MM
}

/**
 * Width of the frame band the spec needs: at least the structural minimum, and wide enough
 * that the fastest tier's full deceleration tail ends clear of the coupon outer perimeter,
 * so firmware lookahead never bleeds deceleration back into a measured segment.
 */
export function frameBandMm(spec: IsTestSpec): number {
  const deepest = Math.max(...spec.speedsMmS.map((v) => tailDepthMm(v, spec)))
  return Math.max(MIN_FRAME_BAND_MM, deepest + TAIL_EDGE_CLEARANCE_MM)
}

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
  /** First stretch of the approach, where the un-retract is primed on the move. */
  prime: IsSegment
  /** The straight approach leg that rings the axis; it ends at the sharp corner. */
  runUp: IsSegment
  /** The measured segment; it starts at the corner and welds into the band at both ends. */
  measured: IsSegment
  /** Colinear continuation of the measured segment: the deceleration tail in the band. */
  tail: IsSegment
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
 * Clear space a group needs before its first line, so every line, including the first,
 * keeps the full run-up with the moving-prime stretch before it, and the leg start stays
 * the inner margin away from the window edge.
 */
function leadMm(spec: IsTestSpec): number {
  return spec.runUpMm + PRIME_MM + INNER_MARGIN_MM
}

/** Perpendicular room a group's field claims, including the lead and the trailing margin. */
export function fieldSideMm(spec: IsTestSpec): number {
  return leadMm(spec) + fieldExtentMm(spec) + INNER_MARGIN_MM
}

function boundingBox(lines: IsLine[]): IsBox {
  const segs = (l: IsLine) => [l.prime, l.runUp, l.measured, l.tail]
  const xs = lines.flatMap((l) => segs(l).flatMap((s) => [s.x0, s.x1]))
  const ys = lines.flatMap((l) => segs(l).flatMap((s) => [s.y0, s.y1]))
  return { x0: Math.min(...xs), y0: Math.min(...ys), x1: Math.max(...xs), y1: Math.max(...ys) }
}

/**
 * Split the approach into the moving-prime stretch and the run-up, in 1-D coordinates
 * along the leg. The prime sits entirely before the leg start, so every line keeps the
 * full run-up; the group lead reserves the room for it.
 */
function splitApproach(legStart: number): { primeStart: number; primeEnd: number } {
  return { primeStart: legStart - PRIME_MM, primeEnd: legStart }
}

/**
 * X-axis group: measured segments travel +Y across the window, entered via a run-up leg
 * traveling +X along the inside of the bottom band. The field hugs the far-X side of the
 * interior so the Y group's ringing zone (near the left band) stays clear of it.
 */
function buildXGroup(
  spec: IsTestSpec,
  bandMm: number,
  couponW: number,
  couponH: number,
): IsLineGroup {
  const offsets = lineOffsets(spec)
  const firstX = couponW - bandMm - INNER_MARGIN_MM - fieldExtentMm(spec)
  const yStart = bandMm - spec.weldMm
  const yEnd = couponH - bandMm + spec.weldMm
  const lines = offsets.map((off, i) => {
    const x = firstX + off
    const speedMmS = spec.speedsMmS[Math.floor(i / spec.linesPerSpeed)]
    const { primeStart, primeEnd } = splitApproach(x - spec.runUpMm)
    const tailY = couponH - bandMm + tailDepthMm(speedMmS, spec)
    return {
      speedMmS,
      prime: { x0: primeStart, y0: yStart, x1: primeEnd, y1: yStart },
      runUp: { x0: primeEnd, y0: yStart, x1: x, y1: yStart },
      measured: { x0: x, y0: yStart, x1: x, y1: yEnd },
      tail: { x0: x, y0: yEnd, x1: x, y1: tailY },
    }
  })
  return { axis: 'x', lines, boundingBox: boundingBox(lines) }
}

/**
 * Y-axis group, mirrored: measured segments travel +X, entered via a run-up leg traveling
 * +Y along the inside of the left band. The field hugs the far-Y side of the interior.
 */
function buildYGroup(
  spec: IsTestSpec,
  bandMm: number,
  couponW: number,
  couponH: number,
): IsLineGroup {
  const offsets = lineOffsets(spec)
  const firstY = couponH - bandMm - INNER_MARGIN_MM - fieldExtentMm(spec)
  const xStart = bandMm - spec.weldMm
  const xEnd = couponW - bandMm + spec.weldMm
  const lines = offsets.map((off, i) => {
    const y = firstY + off
    const speedMmS = spec.speedsMmS[Math.floor(i / spec.linesPerSpeed)]
    const { primeStart, primeEnd } = splitApproach(y - spec.runUpMm)
    const tailX = couponW - bandMm + tailDepthMm(speedMmS, spec)
    return {
      speedMmS,
      prime: { x0: xStart, y0: primeStart, x1: xStart, y1: primeEnd },
      runUp: { x0: xStart, y0: primeEnd, x1: xStart, y1: y },
      measured: { x0: xStart, y0: y, x1: xEnd, y1: y },
      tail: { x0: xEnd, y0: y, x1: tailX, y1: y },
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
  const bandMm = frameBandMm(spec)
  const couponWidthMm = interiorW + 2 * bandMm
  const couponHeightMm = interiorH + 2 * bandMm

  const groups: IsLineGroup[] = []
  if (hasX) groups.push(buildXGroup(spec, bandMm, couponWidthMm, couponHeightMm))
  if (hasY) groups.push(buildYGroup(spec, bandMm, couponWidthMm, couponHeightMm))

  const inset = FIDUCIAL_INSET_MM
  const size = FIDUCIAL_SIZE_MM
  return {
    couponWidthMm,
    couponHeightMm,
    frameBandMm: bandMm,
    fiducialInsetMm: inset,
    fiducialSizeMm: size,
    fiducials: [
      { xMm: couponWidthMm - inset - size / 2, yMm: inset + size / 2 },
      { xMm: couponWidthMm - inset - size / 2, yMm: couponHeightMm - inset - size / 2 },
      { xMm: inset + size / 2, yMm: couponHeightMm - inset - size / 2 },
    ],
    groups,
    windowBox: {
      x0: bandMm,
      y0: bandMm,
      x1: couponWidthMm - bandMm,
      y1: couponHeightMm - bandMm,
    },
  }
}
