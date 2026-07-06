import type { Mat, OpenCv } from '../opencv'
import type { PaTestSpec } from './types'
import { couponGeometry } from './types'
import type { PaAlignment } from './fiducialAligner'
import { mmToPx } from './fiducialAligner'
import { median } from '../math'

// Profiles a PA test line's extruded width along its length to sub-pixel precision. Every 0.25 mm
// along the line (skipping the ragged 2 mm at each end), a perpendicular intensity profile is
// extracted by bilinear interpolation, and the line's two edges are located as the strongest
// intensity-gradient peak on each side of the darkest point, refined by parabolic interpolation of
// the gradient (the same sub-pixel edge model the card measurer uses). Width is converted to mm
// with the alignment's local scale along the perpendicular, so rotation, flip, and scanner
// anisotropy are all accounted for by the affine itself.

export interface WidthSample {
  xMm: number // line-local x
  widthMm: number // sub-pixel measured width, NaN where no edge pair found
}

const SAMPLE_STEP_MM = 0.25
const END_SKIP_MM = 2
const PROFILE_STEP_PX = 0.25
// Minimum contrast between the line and the base for a line to be present at all: the darkest
// profile value must sit at least this far below the profile median, else the sample is a gap.
const MIN_LINE_CONTRAST = 30
// Noise floor for a genuine edge, matching the card measurer's gradient gate.
const MIN_EDGE_GRADIENT = 8

export function measureLineWidthProfile(
  cv: OpenCv,
  gray: Mat,
  alignment: PaAlignment,
  spec: PaTestSpec,
  lineIndex: number,
): WidthSample[] {
  void cv
  if (!gray || gray.empty()) throw new Error('Image is null or empty.')
  if (gray.channels() !== 1) throw new Error('measureLineWidthProfile expects a single-channel image.')
  if (!alignment.success) throw new Error('Cannot profile lines without a successful alignment.')
  if (lineIndex < 0 || lineIndex >= spec.lineCount) throw new Error('Line index out of range.')

  const g = couponGeometry(spec)
  const lineLenMm = 2 * spec.slowSegmentMm + spec.fastSegmentMm
  const yMm = g.lineStartYMm(lineIndex)

  // The perpendicular to the line (coupon +Y) mapped through the affine's linear part; its length
  // is the local px-per-mm along the profile direction.
  const perpPxPerMm = Math.hypot(alignment.b, alignment.d)
  if (perpPxPerMm <= 0) throw new Error('The alignment is degenerate (zero scale).')
  const ux = alignment.b / perpPxPerMm
  const uy = alignment.d / perpPxPerMm

  const halfRangePx = (spec.linePitchMm / 2) * perpPxPerMm
  const profileLen = 2 * Math.floor(halfRangePx / PROFILE_STEP_PX) + 1
  const s0 = -Math.floor(halfRangePx / PROFILE_STEP_PX) * PROFILE_STEP_PX

  const samples: WidthSample[] = []
  const profile = new Float64Array(profileLen)
  for (let xMm = END_SKIP_MM; xMm <= lineLenMm - END_SKIP_MM + 1e-9; xMm += SAMPLE_STEP_MM) {
    const centre = mmToPx(alignment, g.lineStartXMm + xMm, yMm)
    const widthMm = measureAt(gray, centre.x, centre.y, ux, uy, s0, profileLen, profile) / perpPxPerMm
    samples.push({ xMm, widthMm })
  }
  return samples
}

// Width in px of the dark line crossing the profile centred at (cx, cy), or NaN when no line or no
// edge pair is found there.
function measureAt(
  gray: Mat,
  cx: number,
  cy: number,
  ux: number,
  uy: number,
  s0: number,
  profileLen: number,
  profile: Float64Array,
): number {
  for (let k = 0; k < profileLen; k++) {
    const s = s0 + k * PROFILE_STEP_PX
    const v = bilinear(gray, cx + ux * s, cy + uy * s)
    if (Number.isNaN(v)) return NaN
    profile[k] = v
  }

  // The line is dark on the light base: locate the darkest profile point.
  let minIdx = 0
  for (let k = 1; k < profileLen; k++) if (profile[k] < profile[minIdx]) minIdx = k
  const med = median(Array.from(profile))
  if (profile[minIdx] > med - MIN_LINE_CONTRAST) return NaN // no line here: a gap

  // Gradient magnitude (central difference); the strongest peak on each flank of the minimum is
  // the edge, refined with parabolic interpolation of the gradient.
  const grad = (k: number) => Math.abs(profile[k + 1] - profile[k - 1])
  const left = subPixEdge(grad, 1, minIdx - 1)
  const right = subPixEdge(grad, minIdx + 1, profileLen - 2)
  if (Number.isNaN(left) || Number.isNaN(right)) return NaN
  return (right - left) * PROFILE_STEP_PX
}

// Sub-pixel index of the strongest gradient peak within [kLo, kHi], parabolic interpolation over
// the peak and its two neighbours (clamped to +/- 1 sample). NaN when the window is empty or flat.
function subPixEdge(grad: (k: number) => number, kLo: number, kHi: number): number {
  if (kHi < kLo) return NaN
  let best = -1
  let bk = -1
  for (let k = kLo; k <= kHi; k++) {
    const gk = grad(k)
    if (gk > best) {
      best = gk
      bk = k
    }
  }
  if (bk < 0 || best < MIN_EDGE_GRADIENT) return NaN

  const gm = grad(Math.max(kLo, bk - 1))
  const gp = grad(Math.min(kHi, bk + 1))
  const denom = gm - 2 * best + gp
  const sub = Math.abs(denom) < 1e-9 ? 0 : (0.5 * (gm - gp)) / denom
  return bk + Math.min(1, Math.max(-1, sub))
}

// Bilinear intensity at a fractional pixel position; NaN outside the image.
function bilinear(gray: Mat, x: number, y: number): number {
  const x0 = Math.floor(x)
  const y0 = Math.floor(y)
  if (x0 < 0 || y0 < 0 || x0 + 1 >= gray.cols || y0 + 1 >= gray.rows) return NaN
  const fx = x - x0
  const fy = y - y0
  const d = gray.data as Uint8Array
  const w = gray.cols
  const p = (yy: number, xx: number) => d[yy * w + xx]
  return (
    p(y0, x0) * (1 - fx) * (1 - fy) +
    p(y0, x0 + 1) * fx * (1 - fy) +
    p(y0 + 1, x0) * (1 - fx) * fy +
    p(y0 + 1, x0 + 1) * fx * fy
  )
}
