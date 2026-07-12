// Shared scan-resolution gates for the calibration flows. The fiducial aligners use the
// degenerate floor to reject blobs that cannot be a coupon at any usable resolution; the
// analyzers use the measurement floor to refuse scans whose pixels are too coarse for the
// sub-pixel width and gap readouts, before any numbers are produced from them.

/**
 * Degenerate-alignment floor for the aligners' blob-area gates. Below 1 px/mm (about 26 dpi)
 * a printed test bead spans under half a pixel, so nothing downstream could trace a line even
 * if the plate were located; a blob smaller than the coupon at this scale cannot be a usable
 * coupon scan. Every real flatbed setting (75 dpi and up) clears it by a wide margin, so it
 * rejects only non-coupon blobs, never a plausible scan.
 */
export const MIN_ALIGN_PX_PER_MM = 1

/**
 * Minimum scan resolution for the measurements themselves. The sub-pixel width and gap readouts
 * locate each edge by a gradient centroid pooled over a few hundred samples per feature, which in
 * testing recovers the calibration signal down to about 150 dpi on the pressure advance coupon.
 * The floor sits at 5.5 px/mm, just under 150 dpi (5.9 px/mm), so a real 150 dpi scan still clears
 * it after print shrinkage and anything coarser is refused. Higher resolution yields a deeper, more
 * confident score minimum, and the finer-featured flows (input shaper ringing near 0.1 mm) gain the
 * most from scanning well above this floor.
 */
export const MIN_MEASUREMENT_PX_PER_MM = 5.5

/**
 * User-worded refusal for a scan below the measurement resolution floor, or null when the
 * resolution suffices. A non-positive px/mm is a degenerate alignment, which the aligner
 * reports as its own failure, so it also returns null here.
 */
export function insufficientResolutionReason(pxPerMm: number): string | null {
  if (!(pxPerMm > 0)) return null
  if (pxPerMm >= MIN_MEASUREMENT_PX_PER_MM) return null
  return (
    `The scan resolution is about ${Math.round(pxPerMm * 25.4)} dpi, below the 150 dpi this ` +
    'measurement needs to resolve the printed features. Rescan the coupon at 150 dpi or higher.'
  )
}
