import type { IsAxis, IsTestSpec } from './types'

export const MIN_FRAME_BAND_MM = 12
export const FIDUCIAL_INSET_MM = 4
export const FIDUCIAL_SIZE_MM = 5
export const INNER_MARGIN_MM = 3
export const BLOCK_GAP_MM = 2
/** Length of the moving prime at the start of each run-up leg. */
export const PRIME_MM = 3
/** Leg start clearance from the coupon outer edge, so nothing pokes outside the outline. */
export const LEG_INSET_MM = 3
/** Added to the kinematic deceleration distance to absorb planner rounding. */
export const TAIL_MARGIN_MM = 1
/** Clearance kept between a tail's stop point and the coupon outer perimeter. */
export const TAIL_EDGE_CLEARANCE_MM = 1
/**
 * Straight in-window stretch kept between the window edge and the first sweep tooth, so
 * the fiducial aligner's leg probes (1 and 4 mm inside the window) always land on a
 * straight bead.
 */
export const SWEEP_STUB_MM = 5
/** Bead width plus working clearance reserved between a tooth tip and the neighbouring
 *  line's leg; it caps the lateral tooth depth at `linePitchMm` minus this value. */
export const SWEEP_TOOTH_CLEARANCE_MM = 1

/** Distance to reach `speedMmS` from rest (or stop from it) at `accelMmS2`: v^2 / (2a). */
export function accelRampMm(speedMmS: number, accelMmS2: number): number {
  return (speedMmS * speedMmS) / (2 * accelMmS2)
}

/**
 * Distance a tier needs after the corner to accelerate from the corner speed (the run-up
 * cruise the bend is taken at) to its cruise speed: (v^2 - corner^2) / (2a).
 */
export function tierRampMm(spec: IsTestSpec, speedMmS: number): number {
  return accelRampMm(speedMmS, spec.accelMmS2) - accelRampMm(spec.cornerSpeedMmS, spec.accelMmS2)
}

/**
 * One forcing period of the resonant run-up sweep: the leg advances `forwardMm` at the
 * corner speed, then steps `lateralMm` sideways (signed, perpendicular to the leg). The
 * leg-axis velocity is therefore a square wave, v during the advance and 0 during the
 * side step, whose fundamental frequency is cornerSpeed / (forwardMm + |lateralMm|):
 * every 90 degree tooth corner is a full per-axis velocity step at the corner speed,
 * and steps arriving at the structure's resonance period add in phase (forced resonance,
 * the same excitation principle as the community's swept ringing-tower zigzags).
 */
export interface SweepCell {
  forwardMm: number
  lateralMm: number
}

/**
 * The sweep's forcing cells: one per cycle, frequencies geometrically spaced from
 * `sweepFromHz` to `sweepToHz` (low first, so the highest frequencies, where stiff
 * machines resonate, excite last and reach the launch corner with the least decay).
 * Cells are paired with a common lateral depth so every out step is undone by the next
 * cell's back step and the leg returns exactly to its centreline. The lateral depth is
 * the equal-dwell ideal v / (2f), capped so a tooth tip keeps its clearance from the
 * neighbouring line's leg.
 */
export function sweepCells(spec: IsTestSpec): SweepCell[] {
  if (!spec.sweep) return []
  const v = spec.cornerSpeedMmS
  const depthCap = spec.linePitchMm - SWEEP_TOOTH_CLEARANCE_MM
  const n = spec.sweepCycles
  const ratio = Math.pow(spec.sweepToHz / spec.sweepFromHz, 1 / (n - 1))
  const freqs = Array.from({ length: n }, (_, k) => spec.sweepFromHz * Math.pow(ratio, k))
  const cells: SweepCell[] = []
  for (let k = 0; k < n; k += 2) {
    const depth = Math.min(depthCap, v / (2 * freqs[k]), v / (2 * freqs[k + 1]))
    cells.push({ forwardMm: v / freqs[k] - depth, lateralMm: -depth })
    cells.push({ forwardMm: v / freqs[k + 1] - depth, lateralMm: depth })
  }
  return cells
}

/** In-window leg length the sweep needs: the straight stub plus every cell's advance. */
export function sweepLegMm(spec: IsTestSpec): number {
  return SWEEP_STUB_MM + sweepCells(spec).reduce((s, c) => s + c.forwardMm, 0)
}

/** In-window run-up length actually laid out: the sweep's leg when enabled, else the
 *  spec's straight run-up. */
export function effectiveRunUpMm(spec: IsTestSpec): number {
  return spec.sweep ? sweepLegMm(spec) : spec.runUpMm
}

/**
 * A line's protected span, measured from its corner along the measured segment: the
 * acceleration ramp to the tier speed followed by the guaranteed clean read length. No
 * crossing, flow change, or speed change is allowed inside it.
 */
export function protectedSpanMm(spec: IsTestSpec, speedMmS: number): number {
  return tierRampMm(spec, speedMmS) + spec.measuredLineMm
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
  /** First stretch of the leg, starting one inset inside the coupon outer edge, entirely
   *  under the frame band, where the un-retract is primed on the move. */
  prime: IsSegment
  /**
   * The straight run-up leg: it starts after the prime, runs through the frame band and
   * into the open window at the corner speed, and ends on the ringing corner. The square
   * corner velocity is validated to at least that speed, so the corner is taken with
   * zero deceleration and the bead is continuous through it.
   */
  runUp: IsSegment
  /**
   * The measured segment: it starts at the corner (the run-up end), crosses the rest of
   * the window, and welds one weld length into the opposite band.
   */
  measured: IsSegment
  /** Colinear continuation of the measured segment: the deceleration tail in the band. */
  tail: IsSegment
  /**
   * The resonant run-up teeth: consecutive axis-aligned segments from the run-up end to
   * the corner, alternating leg advances and lateral side steps (see `sweepCells`).
   * Empty when the sweep is disabled; the run-up then reaches the corner directly.
   */
  teeth: IsSegment[]
  /**
   * Protected span from the corner: acceleration ramp plus the clean read length. All
   * crossings of this line lie beyond it.
   */
  protectedMm: number
  /**
   * Distances from the corner at which this line crosses lines printed before it this
   * layer, sorted ascending. Crossings print at full flow (the beads weld into the grid);
   * the distances document that every crossing lies beyond the protected span.
   */
  crossingsMm: number[]
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
  /** Line groups in print order: the first group is printed first each layer. */
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

const speedOf = (spec: IsTestSpec, i: number) =>
  spec.speedsMmS[Math.floor(i / spec.linesPerSpeed)]

/**
 * Per-pair packed depth of a group's corner diagonal, excluding the clean read length.
 * Within each group the SLOWEST tier's lines sit nearest the crossing zone (their small
 * protected span tolerates an early crossing) and the fastest farthest, corners
 * anti-staggered along the field so no leg crosses a same-group measured segment. The
 * binding line maximizes (field extent - its offset) + its tier ramp; adding the clean
 * read length (paid once, by every line alike) gives the exact room the corner diagonal
 * plus every protected span needs. This is tighter than the worst-case form
 * field + max ramp whenever the fastest tier does not sit at offset zero.
 */
export function maxPackedRampMm(spec: IsTestSpec): number {
  const offsets = lineOffsets(spec)
  const F = offsets[offsets.length - 1]
  return Math.max(...offsets.map((off, i) => F - off + tierRampMm(spec, speedOf(spec, i))))
}

/**
 * The sweep teeth of one line, built backward from its corner. `leg` is the unit travel
 * direction of the run-up leg and `lateral` the unit direction of the measured segment:
 * every out step (negative cell lateral) points AWAY from the measured direction, toward
 * the neighbouring legs whose in-phase teeth keep the same pitch, and the final back step
 * runs colinear into the measured segment, so the launch carries the built-up ring.
 */
function sweepTeeth(
  spec: IsTestSpec,
  corner: { x: number; y: number },
  leg: { x: number; y: number },
  lateral: { x: number; y: number },
): IsSegment[] {
  const cells = sweepCells(spec)
  if (cells.length === 0) return []
  const advance = cells.reduce((s, c) => s + c.forwardMm, 0)
  let px = corner.x - leg.x * advance
  let py = corner.y - leg.y * advance
  const segs: IsSegment[] = []
  const step = (x: number, y: number) => {
    segs.push({ x0: px, y0: py, x1: x, y1: y })
    px = x
    py = y
  }
  for (const c of cells) {
    step(px + leg.x * c.forwardMm, py + leg.y * c.forwardMm)
    step(px + lateral.x * c.lateralMm, py + lateral.y * c.lateralMm)
  }
  return segs
}

function boundingBox(lines: IsLine[]): IsBox {
  const segs = (l: IsLine) => [l.prime, l.runUp, l.measured, l.tail, ...l.teeth]
  const xs = lines.flatMap((l) => segs(l).flatMap((s) => [s.x0, s.x1]))
  const ys = lines.flatMap((l) => segs(l).flatMap((s) => [s.y0, s.y1]))
  return { x0: Math.min(...xs), y0: Math.min(...ys), x1: Math.max(...xs), y1: Math.max(...ys) }
}

/**
 * Y-axis group, printed first: each line starts one inset above the coupon's bottom outer
 * edge, runs vertically up through the bottom band (this through-band stretch hosts the
 * travel arrival, the moving prime, and the start blob, all ironed flat by the band pass
 * printed after it), continues into the open window as the run-up, cruises at the corner
 * speed straight into the sharp corner, and the measured segment runs
 * +X into the right band. The corners sit near the window's left side on a descending
 * diagonal: the corner x DECREASES as the line's y increases, so a later line's vertical
 * leg always passes left of every earlier corner and never crosses an earlier measured
 * segment. Tier order runs bottom-up, so the slowest lines (smallest protected span) take
 * the largest corner x, nearest the crossing zone: the per-pair packing.
 */
function buildYGroup(spec: IsTestSpec, bandMm: number, couponW: number): IsLineGroup {
  const offsets = lineOffsets(spec)
  const F = fieldExtentMm(spec)
  const advance = effectiveRunUpMm(spec) - (spec.sweep ? SWEEP_STUB_MM : 0)
  const lines = offsets.map((off, i) => {
    const speedMmS = speedOf(spec, i)
    const y = bandMm + effectiveRunUpMm(spec) + off
    const x = bandMm + INNER_MARGIN_MM + (F - off)
    const teeth = sweepTeeth(spec, { x, y }, { x: 0, y: 1 }, { x: 1, y: 0 })
    const legEndY = spec.sweep ? y - advance : y
    return {
      speedMmS,
      prime: { x0: x, y0: LEG_INSET_MM, x1: x, y1: LEG_INSET_MM + PRIME_MM },
      runUp: { x0: x, y0: LEG_INSET_MM + PRIME_MM, x1: x, y1: legEndY },
      measured: { x0: x, y0: y, x1: couponW - bandMm + spec.weldMm, y1: y },
      tail: { x0: couponW - bandMm + spec.weldMm, y0: y, x1: couponW - bandMm + tailDepthMm(speedMmS, spec), y1: y },
      teeth,
      protectedMm: protectedSpanMm(spec, speedMmS),
      crossingsMm: [],
    }
  })
  return { axis: 'y', lines, boundingBox: boundingBox(lines) }
}

/**
 * X-axis group, printed second: each line starts one inset inside the coupon's right
 * outer edge, runs horizontally through the right band, continues -X into the window as
 * the run-up, corners at the corner speed, and the measured segment runs -Y
 * (downward) into the bottom band. The corners sit near the window's top on a diagonal
 * mirroring the Y group's packing: the FASTEST lines take the highest corners (their long
 * protected span needs the most depth above the crossing zone) and, anti-staggered, the
 * smallest corner x; the corner y then DECREASES as the corner x increases, so no leg
 * crosses a same-group measured segment. When the Y group exists, every X measured line
 * crosses every Y measured line; the crossing distances (from the X line's corner) are
 * recorded so the emitter can zero the flow over the already-printed beads. The window
 * sizing guarantees each crossing lies beyond BOTH lines' protected spans plus the inner
 * margin.
 */
function buildXGroup(
  spec: IsTestSpec,
  bandMm: number,
  couponW: number,
  couponH: number,
  yGroup: IsLineGroup | null,
): IsLineGroup {
  const offsets = lineOffsets(spec)
  const F = fieldExtentMm(spec)
  // With a Y group present the X field starts past the Y group's packed corner diagonal
  // (stagger + protected spans) and one inner margin keeping the crossings' flow ramps
  // clear of the read windows.
  const firstX = yGroup
    ? bandMm + 2 * INNER_MARGIN_MM + maxPackedRampMm(spec) + spec.measuredLineMm
    : bandMm + INNER_MARGIN_MM
  const yMeasured = yGroup ? yGroup.lines.map((l) => l.measured.y0) : []
  const advance = effectiveRunUpMm(spec) - (spec.sweep ? SWEEP_STUB_MM : 0)
  const lines = offsets.map((off, i) => {
    const speedMmS = speedOf(spec, i)
    const x = firstX + (F - off)
    const y = couponH - bandMm - INNER_MARGIN_MM - (F - off)
    const teeth = sweepTeeth(spec, { x, y }, { x: -1, y: 0 }, { x: 0, y: -1 })
    const legEndX = spec.sweep ? x + advance : x
    return {
      speedMmS,
      prime: { x0: couponW - LEG_INSET_MM, y0: y, x1: couponW - LEG_INSET_MM - PRIME_MM, y1: y },
      runUp: { x0: couponW - LEG_INSET_MM - PRIME_MM, y0: y, x1: legEndX, y1: y },
      measured: { x0: x, y0: y, x1: x, y1: bandMm - spec.weldMm },
      tail: { x0: x, y0: bandMm - spec.weldMm, x1: x, y1: bandMm - tailDepthMm(speedMmS, spec) },
      teeth,
      protectedMm: protectedSpanMm(spec, speedMmS),
      crossingsMm: yMeasured.map((yk) => y - yk).sort((a, b) => a - b),
    }
  })
  return { axis: 'x', lines, boundingBox: boundingBox(lines) }
}

/**
 * Coupon-local layout. Both groups share one open window and deliberately cross each
 * other in the window's lower right region, welding the free beads into a stiff grid. A
 * crossing between an X line and a Y line is legal only past both lines' protected spans
 * plus one inner margin; the interior is derived EXACTLY from that per-pair constraint,
 * with no padding:
 *
 *   interior width  = margin + packed(Y) + margin + F (X field) + runUp
 *   interior height = runUp + F (Y field) + margin + packed(X) + margin
 *
 * where F is the field extent, packed(g) = maxPackedRampMm + clean read length is group
 * g's per-pair packed corner diagonal (slowest lines nearest the crossing zone), and
 * runUp the in-window leg length before each group's first corner (the through-band leg
 * stretch is extra and comes free from the band width). Both expressions are equal, so
 * the two-axis coupon is square. With a single axis the crossing terms drop: the measured
 * direction needs margin + packed and the perpendicular one margin + F + runUp.
 */
export function isCouponGeometry(spec: IsTestSpec): IsCouponGeometry {
  const hasX = spec.axes.includes('x')
  const hasY = spec.axes.includes('y')
  const packed = maxPackedRampMm(spec) + spec.measuredLineMm
  const F = fieldExtentMm(spec)
  const runUp = effectiveRunUpMm(spec)
  const crossTerm = INNER_MARGIN_MM + F + runUp
  const interiorW = hasY
    ? INNER_MARGIN_MM + packed + (hasX ? crossTerm : 0)
    : INNER_MARGIN_MM + F + runUp
  const interiorH = hasX
    ? INNER_MARGIN_MM + packed + (hasY ? crossTerm : 0)
    : INNER_MARGIN_MM + F + runUp
  const bandMm = frameBandMm(spec)
  const couponWidthMm = interiorW + 2 * bandMm
  const couponHeightMm = interiorH + 2 * bandMm

  // Print order: the Y group first (its measured lines cross nothing), then the X group,
  // whose measured lines carry the crossing dips over the Y beads.
  const groups: IsLineGroup[] = []
  const yGroup = hasY ? buildYGroup(spec, bandMm, couponWidthMm) : null
  if (yGroup) groups.push(yGroup)
  if (hasX) groups.push(buildXGroup(spec, bandMm, couponWidthMm, couponHeightMm, yGroup))

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
