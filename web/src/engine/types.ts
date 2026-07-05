// Core engine types, ported from ScanNTune.Core (C#). Pure TypeScript: no Vue, no DOM.
// Scale figures are percentage errors (measured vs nominal; positive = oversize). Skew is the
// corner-angle error in degrees (measured minus the nominal 90; positive = opened past square,
// negative = closed, i.e. sheared x' = x + t*y).

export interface CouponSpec {
  /** Centre-to-centre span of the outermost rings (mm). */
  baselineMm: number
  /** Rings per side; the grid is gridN x gridN. */
  gridN: number
  ringOuterDiameterMm: number
  ringWallMm: number
}

export function defaultCouponSpec(): CouponSpec {
  return { baselineMm: 100, gridN: 5, ringOuterDiameterMm: 9, ringWallMm: 2 }
}

/** Centre-to-centre distance between neighbouring rings. */
export function couponPitchMm(s: CouponSpec): number {
  return s.baselineMm / (s.gridN - 1)
}

export function couponInnerDiameterMm(s: CouponSpec): number {
  return s.ringOuterDiameterMm - 2 * s.ringWallMm
}

/**
 * Which pair of printer axes a coupon plate measures. XY is the flat plate; XZ and YZ are the
 * standing plates. The plate's first in-plane axis (the marker's +X) maps to the first letter and
 * the perpendicular to the second: XY -> (X, Y), XZ -> (X, Z), YZ -> (Y, Z).
 */
export type Plane = 'XY' | 'XZ' | 'YZ'

/** The two physical axes a plane measures, first = marker +X, second = perpendicular. */
export function planeAxes(p: Plane): ['X' | 'Y' | 'Z', 'X' | 'Y' | 'Z'] {
  return p === 'XY' ? ['X', 'Y'] : p === 'XZ' ? ['X', 'Z'] : ['Y', 'Z']
}

/** A ring located in the scan; the sub-pixel centre drives scale/skew (extrusion-immune). */
export interface DetectedRing {
  centerX: number
  centerY: number
  radiusPx: number
  circularity: number
}

/** The coupon's pose in the image: origin fiducial and the +X unit vector (image-y downward). */
export interface Orientation {
  flipped: boolean
  originX: number
  originY: number
  xAxisX: number
  xAxisY: number
}

/** Angle of the +X axis in image degrees (0 = right, 90 = down). */
export function xAxisAngleDegrees(o: Orientation): number {
  return (Math.atan2(o.xAxisY, o.xAxisX) * 180) / Math.PI
}

export interface AffineModel {
  scaleXPxPerMm: number
  scaleYPxPerMm: number
  skewDegrees: number
  rmsResidualPx: number
  pointCount: number
}

/** One ring matched to its nominal grid place. Col runs along +X, row along +Y. */
export interface GridCorrespondence {
  col: number
  row: number
  nominalXmm: number
  nominalYmm: number
  measuredXpx: number
  measuredYpx: number
}

export interface GridMapping {
  points: GridCorrespondence[]
  originX: number
  originY: number
  xAxisX: number
  xAxisY: number
  flipped: boolean
  /** Estimated centre-to-centre ring spacing in pixels; sizes the plane-ID read window. */
  pitchPx: number
}

export interface CalibrationResult {
  xScalePercent: number
  yScalePercent: number
  skewDegrees: number
  ringsDetected: number
  measuredPxPerMmX: number
  measuredPxPerMmY: number
  rmsResidualPx: number
  rings: DetectedRing[]
  orientation: Orientation
  /**
   * The plate's plane, read from the plane-ID dots in the origin marker. Undefined when the plate
   * carries no plane-ID (the original XY-only coupon), in which case callers treat it as XY.
   */
  plane?: Plane
}

export interface ScannerDiagnostic {
  anisotropyPercent: number
  skewDegrees: number
}

export interface TwoScanResult {
  combined: CalibrationResult
  scanner: ScannerDiagnostic
  scanA: CalibrationResult
  scanB: CalibrationResult
  relativeRotationDegrees: number
  rotationLooksValid: boolean
  flipMismatch: boolean
}

/** One plane's finished two-scan analysis, tagged with which plane it measures. */
export interface PlaneAnalysis {
  plane: Plane
  twoScan: TwoScanResult
}

/** A physical-axis scale error, reconciled across the plates that measured it. */
export interface AxisScale {
  axis: 'X' | 'Y' | 'Z'
  scalePercent: number
  /** The plane(s) whose measurement was averaged into this figure. */
  sources: Plane[]
}

/** One plane's skew (the corner-angle error, degrees). */
export interface PlaneSkew {
  plane: Plane
  skewDegrees: number
}

/** The whole-printer result: every uploaded plane, its skew, and the reconciled per-axis scales. */
export interface MultiPlaneResult {
  planes: PlaneAnalysis[]
  skews: PlaneSkew[]
  scales: AxisScale[]
}

export interface AnalysisOptions {
  coupon: CouponSpec
  /**
   * True scale of the source image in pixels per millimetre (scanner DPI / 25.4, or a reference
   * object). Required for absolute X/Y shrinkage; when null, anisotropy and skew only.
   */
  pxPerMm?: number | null
  currentStepsPerMmX?: number | null
  currentStepsPerMmY?: number | null
  currentRotationDistanceX?: number | null
  currentRotationDistanceY?: number | null
}

/** The outcome of measuring a known-length reference (a bank card) in a scan. */
export interface ScaleReferenceResult {
  success: boolean
  pxPerMm: number
  measuredWidthPx: number
  detectedMm: number
  straightnessPx: number
  parallelismDegrees: number
  edgePointCount: number
  message?: string | null
}

/** A stored scanner calibration; the true px/mm recovered from a known-length reference. */
export interface ScannerCalibration {
  pxPerMm: number
  dpi: number
  referenceMm: number
  measuredWidthPx: number
  straightnessPx: number
  parallelismDegrees: number
  /** ISO-8601 UTC timestamp. */
  calibratedUtc: string
}

/** A ready-to-apply firmware/slicer correction: the snippet to copy and a note on where it goes. */
export interface Correction {
  code: string
  hint: string
  primaryCaption?: string | null
  secondaryCaption?: string | null
  secondaryCode?: string | null
}

/**
 * Thrown when a scan is detected but cannot be resolved into a calibration (marker not found, too
 * few rings). Carries whatever rings the detector found so the UI can still show them.
 */
export class ScanAnalysisError extends Error {
  readonly detectedRings: DetectedRing[]
  constructor(message: string, detectedRings: DetectedRing[]) {
    super(message)
    this.name = 'ScanAnalysisError'
    this.detectedRings = detectedRings
  }
}
