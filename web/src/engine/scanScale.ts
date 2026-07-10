// Geometric scale diagnosis: judges a measured px/mm against the expected one to catch a scan
// taken at a different resolution than the one entered or calibrated. Purely geometric, driven by
// the measurement itself; file metadata is deliberately not consulted (scanners often stamp a
// generic default or nothing at all).

/**
 * Judges a geometrically measured scale against the expected one. likelyMultiple is non-null only
 * when the factor sits within 10 percent of a clean 2x or 0.5x (a resolution swap, e.g. a 300 dpi
 * scan analyzed as 600 dpi); ordinary few-percent scanner error never triggers it.
 */
export function diagnoseScale(
  detectedPxPerMm: number,
  expectedPxPerMm: number,
): { factor: number; likelyMultiple: 2 | 0.5 | null } {
  const factor = expectedPxPerMm > 0 ? detectedPxPerMm / expectedPxPerMm : 0
  const near = (target: number) => Math.abs(factor / target - 1) <= 0.1
  return { factor, likelyMultiple: near(2) ? 2 : near(0.5) ? 0.5 : null }
}
