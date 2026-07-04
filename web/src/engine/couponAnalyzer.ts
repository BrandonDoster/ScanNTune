import type { Mat, OpenCv } from './opencv'
import type { AnalysisOptions, CalibrationResult } from './types'
import { ScanAnalysisError } from './types'
import { detectRings } from './ringDetector'
import { mapGrid } from './gridMapper'
import { solveAffine } from './affineSolver'
import type { AffineSolverOptions } from './affineSolver'

// Orchestrates the pipeline: detect ring centres -> locate the orientation fiducial and map rings to
// the nominal grid -> fit the affine -> convert scale/skew into a calibration result. Orientation
// (rotation AND flip) is fully resolved from the two-solid marker, so the X/Y labels and the skew
// sign are already correct.

export function analyzeCoupon(
  cv: OpenCv,
  image: Mat,
  options: AnalysisOptions,
  solverOptions?: AffineSolverOptions,
): CalibrationResult {
  const rings = detectRings(cv, image)

  let mapping
  try {
    mapping = mapGrid(rings, options.coupon)
  } catch (e) {
    if (e instanceof ScanAnalysisError) throw e
    // Detection succeeded but the grid/marker step failed: surface what we found so the caller can
    // show it rather than only reporting an error.
    const message = e instanceof Error ? e.message : String(e)
    throw new ScanAnalysisError(message, rings)
  }

  const affine = solveAffine(mapping.points, solverOptions)

  const reference = options.pxPerMm ?? Math.sqrt(affine.scaleXPxPerMm * affine.scaleYPxPerMm)
  const xScalePercent = (affine.scaleXPxPerMm / reference - 1.0) * 100.0
  const yScalePercent = (affine.scaleYPxPerMm / reference - 1.0) * 100.0

  return {
    xScalePercent,
    yScalePercent,
    skewDegrees: affine.skewDegrees,
    ringsDetected: rings.length,
    measuredPxPerMmX: affine.scaleXPxPerMm,
    measuredPxPerMmY: affine.scaleYPxPerMm,
    rmsResidualPx: affine.rmsResidualPx,
    rings,
    orientation: {
      flipped: mapping.flipped,
      originX: mapping.originX,
      originY: mapping.originY,
      xAxisX: mapping.xAxisX,
      xAxisY: mapping.xAxisY,
    },
  }
}
