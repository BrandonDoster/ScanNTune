import type { IsAxis } from './types'
import type { ShaperOption } from './shaperRecommender'

/** Per-machine-axis outcome of the input shaper measurement. */
export interface IsAxisResult {
  axis: IsAxis
  /** True when the axis produced a trustworthy frequency and damping estimate. */
  accepted: boolean
  /** User-worded reasons the axis (or individual lines) could not be measured. */
  refusals: string[]
  frequencyHz: number | null
  dampingRatio: number | null
  /** 95% confidence halfwidth of the frequency, Hz. */
  frequencyCi95Hz: number | null
  /** Median initial ring amplitude of the accepted lines, mm (diagnostic). */
  amplitudeMm: number | null
  linesUsed: number
  linesTraced: number
  /** Index of the scan (0 or 1) the axis was measured from; null when neither qualified. */
  scanIndex: 0 | 1 | null
  /** All shaper options at the measured resonance; null when the axis was refused. */
  shapers: ShaperOption[] | null
  /** The recommended shaper per the selection rule; null when the axis was refused. */
  recommended: ShaperOption | null
}

/** Orientation diagnostics of one aligned scan. */
export interface IsScanInfo {
  flipped: boolean
  rotationQuarterTurns: number
}

/**
 * Result of the two-scan input shaper analysis. `aligned: false` with a `failureReason` is the
 * normal outcome for a scan pair that cannot be aligned; per-axis measurement problems are
 * refusals inside `axes`, not alignment failures.
 */
export interface IsResult {
  aligned: boolean
  failureReason: string | null
  scans: IsScanInfo[]
  axes: IsAxisResult[]
}
