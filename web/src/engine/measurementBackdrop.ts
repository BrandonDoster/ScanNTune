import { median } from './math'

// Shared validity gate for the surface a flow measures against (the "backdrop"): the printed
// base behind the PA test lines, the floor showing through the EM comb gaps, the open window
// behind the IS test lines. Sub-pixel edge and width readouts assume the backdrop presents a
// single tone that contrasts with the plastic; a backdrop that is too similar in brightness or
// too uneven (a dark textured build plate showing through the openings) shifts every mid-level
// edge crossing and biases the measurement, so such a scan is refused rather than mis-measured.
// Each flow samples its own feature and backdrop tones through its solved alignment and words
// its own user-facing refusal; this module owns only the judgment.

/**
 * Minimum brightness separation, in gray levels, between the measured features and the backdrop
 * for edge localization to work in either polarity.
 */
export const MIN_BACKDROP_CONTRAST = 30

/**
 * Maximum backdrop tone spread relative to the feature/backdrop contrast. The mid-level edge
 * threshold sits halfway between the two tones, so a backdrop whose spread is a substantial
 * fraction of the contrast moves the threshold and the located edges by a comparable fraction
 * of the edge spread; a quarter keeps that displacement a minor effect. Real scans separate by
 * an order of magnitude on each side of this bound (about 0.02 to 0.1 against a lid or paper
 * backing, about 0.6 through a textured build plate).
 */
export const MAX_BACKDROP_SPREAD_RATIO = 0.25

/** A gray tone sampled at a known scan-pixel position, for spatial detrending. */
export interface TonePoint {
  x: number
  y: number
  tone: number
}

/**
 * Removes the best-fit first-degree polynomial trend (a + b*x + c*y, ordinary least squares)
 * from spatially located tone samples and re-adds the mean level. A smooth low-frequency
 * brightness gradient across the backdrop, such as one-sided scanner-lamp shading, is absorbed
 * by the fitted plane and no longer counts as tone spread, while high-frequency unevenness (a
 * textured build plate) stays in the residuals and is still judged by the spread criterion.
 * With too few points for a stable fit, or a degenerate (collinear) sample layout, the tones
 * are returned unchanged.
 */
export function detrendTones(points: TonePoint[]): number[] {
  const n = points.length
  if (n < 3) return points.map((p) => p.tone)

  // Normal equations of the ordinary least squares plane fit v = a + b*x + c*y.
  let sx = 0, sy = 0, sv = 0, sxx = 0, sxy = 0, syy = 0, sxv = 0, syv = 0
  for (const p of points) {
    sx += p.x
    sy += p.y
    sv += p.tone
    sxx += p.x * p.x
    sxy += p.x * p.y
    syy += p.y * p.y
    sxv += p.x * p.tone
    syv += p.y * p.tone
  }
  // 3x3 system [[n, sx, sy], [sx, sxx, sxy], [sy, sxy, syy]] * [a, b, c] = [sv, sxv, syv],
  // solved by Cramer's rule with a determinant guard against a degenerate sample layout.
  const det =
    n * (sxx * syy - sxy * sxy) - sx * (sx * syy - sxy * sy) + sy * (sx * sxy - sxx * sy)
  const scale = Math.max(n * sxx * syy, 1)
  if (!Number.isFinite(det) || Math.abs(det) < 1e-9 * scale) return points.map((p) => p.tone)

  const a =
    (sv * (sxx * syy - sxy * sxy) - sx * (sxv * syy - sxy * syv) + sy * (sxv * sxy - sxx * syv)) /
    det
  const b =
    (n * (sxv * syy - sxy * syv) - sv * (sx * syy - sxy * sy) + sy * (sx * syv - sxv * sy)) / det
  const c =
    (n * (sxx * syv - sxv * sxy) - sx * (sx * syv - sxv * sy) + sv * (sx * sxy - sxx * sy)) / det

  const mean = sv / n
  return points.map((p) => mean + (p.tone - (a + b * p.x + c * p.y)))
}

export interface BackdropAssessment {
  /** Polarity-free contrast: median absolute deviation of feature tones from the backdrop median. */
  contrast: number
  /** Backdrop tone spread (MAD) relative to the contrast; meaningful only when contrast is nonzero. */
  spreadRatio: number
  failure: 'low-contrast' | 'uneven' | null
}

/**
 * Judges whether the backdrop can support sub-pixel measurement of the features in front of it.
 * `featureTones` are gray levels sampled on the measured plastic, `backdropTones` on the backdrop
 * directly behind or beside it; both through the solved alignment, so a few mis-landed samples
 * are tolerated by the medians.
 */
export function assessMeasurementBackdrop(
  featureTones: number[],
  backdropTones: number[],
): BackdropAssessment {
  if (featureTones.length === 0 || backdropTones.length === 0) {
    return { contrast: 0, spreadRatio: 0, failure: 'low-contrast' }
  }
  const backdropMedian = median(backdropTones)
  const contrast = median(featureTones.map((v) => Math.abs(v - backdropMedian)))
  if (contrast < MIN_BACKDROP_CONTRAST) {
    return { contrast, spreadRatio: 0, failure: 'low-contrast' }
  }
  const spread = median(backdropTones.map((v) => Math.abs(v - backdropMedian)))
  const spreadRatio = spread / contrast
  if (spreadRatio > MAX_BACKDROP_SPREAD_RATIO) {
    return { contrast, spreadRatio, failure: 'uneven' }
  }
  return { contrast, spreadRatio, failure: null }
}
