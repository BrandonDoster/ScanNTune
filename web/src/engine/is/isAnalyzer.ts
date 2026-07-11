import type { Mat, OpenCv } from '../opencv'
import type { IsAxis, IsTestSpec } from './types'
import { isCouponGeometry } from './couponGeometry'
import type { IsLineGroup } from './couponGeometry'
import { alignIsCoupon } from './isFiducialAligner'
import type { IsAlignment } from './isFiducialAligner'
import { imageDirection, measuredDirection, traceGroup } from './lineTracer'
import { analyzeTracedLine, poolAxisFits } from './ringAnalyzer'
import { recommendShapers } from './shaperRecommender'
import type { IsAxisResult, IsResult } from './resultTypes'
import { valueChannel } from '../cvUtils'
import { isUsableReference } from '../scannerCalibration'
import type { ScaleReference } from '../scannerCalibration'

// Top-level input shaper analysis over TWO scans of the same printed coupon: the part scanned
// face down once, and again turned a quarter turn on the glass. Each scan is aligned
// independently through its fiducials, and each line group (one per machine axis) is measured
// from the one scan in which its measured direction runs along the scanner's sensor-row axis.
//
// Sensor-row assumption: a flatbed scan's image X axis is the sensor line of the scan head
// (the fast axis) and image Y the carriage transport, the same convention the scanner
// calibration's AxisPxPerMm documents. The transport axis carries low-frequency mechanical
// waviness (tens of micrometres), so ring wavelengths are only read along the sensor rows; a
// group whose measured direction maps to the transport axis in both scans is refused, not
// measured badly. The lateral ring deviations then lie along the transport axis, where the
// waviness is slow enough for the Gaussian regression detrend to remove.

/** How dominant the sensor-row component of a group's image direction must be. cos(30 deg):
 *  a coupon can sit visibly crooked on the glass and still qualify, while a genuinely
 *  transport-aligned group (about 90 deg away) never does. */
const AXIS_DOMINANCE = Math.cos(Math.PI / 6)

export function analyzeIsCoupon(
  cv: OpenCv,
  scanA: Mat,
  scanB: Mat,
  spec: IsTestSpec,
  scanReference: ScaleReference,
): IsResult {
  if (!scanA || scanA.empty() || !scanB || scanB.empty()) {
    throw new Error('Image is null or empty.')
  }
  if (!isUsableReference(scanReference)) {
    throw new Error('The scan reference must be a positive scanner calibration.')
  }

  const geometry = isCouponGeometry(spec)
  const scans = [scanA, scanB]
  const alignments: IsAlignment[] = []
  for (let i = 0; i < 2; i++) {
    const alignment = alignIsCoupon(cv, scans[i], spec)
    if (!alignment.success) {
      return {
        aligned: false,
        failureReason:
          `Scan ${i + 1} could not be aligned: ` +
          (alignment.failureReason ?? 'the coupon could not be located in the scan.'),
        scans: alignments.map((a) => ({
          flipped: a.flipped,
          rotationQuarterTurns: a.rotationQuarterTurns,
        })),
        axes: [],
      }
    }
    alignments.push(alignment)
  }

  const axes: IsAxisResult[] = []
  for (const group of geometry.groups) {
    axes.push(measureGroup(cv, scans, alignments, spec, group, scanReference))
  }

  return {
    aligned: true,
    failureReason: null,
    scans: alignments.map((a) => ({
      flipped: a.flipped,
      rotationQuarterTurns: a.rotationQuarterTurns,
    })),
    axes,
  }
}

function refusedAxis(axis: IsAxis, refusals: string[], linesTraced = 0, scanIndex: 0 | 1 | null = null): IsAxisResult {
  return {
    axis,
    accepted: false,
    refusals,
    frequencyHz: null,
    dampingRatio: null,
    frequencyCi95Hz: null,
    amplitudeMm: null,
    linesUsed: 0,
    linesTraced,
    scanIndex,
    shapers: null,
    recommended: null,
  }
}

function measureGroup(
  cv: OpenCv,
  scans: Mat[],
  alignments: IsAlignment[],
  spec: IsTestSpec,
  group: IsLineGroup,
  scanReference: ScaleReference,
): IsAxisResult {
  // Group-to-scan assignment: the scan in which the group's measured direction is most
  // sensor-row aligned, accepted only when that alignment is dominant.
  const dir = measuredDirection(group.lines[0])
  let scanIndex: 0 | 1 | null = null
  let bestDominance = 0
  for (let i = 0; i < 2; i++) {
    const { ux, uy } = imageDirection(alignments[i], dir)
    const dominance = Math.abs(ux) / Math.hypot(ux, uy)
    if (dominance >= AXIS_DOMINANCE && dominance > bestDominance) {
      bestDominance = dominance
      scanIndex = i as 0 | 1
    }
  }
  if (scanIndex === null) {
    return refusedAxis(group.axis, [
      `The ${group.axis.toUpperCase()} axis lines do not run along the scanner's sensor rows in ` +
        'either scan, so their ring wavelength cannot be read reliably. Scan the coupon once ' +
        'upright and once turned a quarter turn on the glass.',
    ])
  }

  const gray = valueChannel(cv, scans[scanIndex])
  let traced
  try {
    traced = traceGroup(cv, gray, alignments[scanIndex], spec, group, scanReference)
  } finally {
    gray.delete()
  }

  if (traced.lines.length === 0) {
    return refusedAxis(
      group.axis,
      [
        `None of the ${group.axis.toUpperCase()} axis lines could be traced in the scan. The ` +
          'coupon may be incompletely printed or partly outside the scan area.',
      ],
      0,
      scanIndex,
    )
  }

  const fits = traced.lines.map((line) => analyzeTracedLine(line))
  const pool = poolAxisFits(
    fits,
    spec.speedsMmS,
    traced.lines.map((l) => l.speedMmS),
  )

  if (!pool.accepted) {
    const r = refusedAxis(group.axis, pool.refusals, traced.lines.length, scanIndex)
    r.linesUsed = pool.linesUsed
    return r
  }

  const recommendation = recommendShapers(
    pool.frequencyHz!,
    pool.dampingRatio!,
    pool.frequencyCi95Hz ?? 0,
  )
  return {
    axis: group.axis,
    accepted: true,
    refusals: pool.refusals,
    frequencyHz: pool.frequencyHz,
    dampingRatio: pool.dampingRatio,
    frequencyCi95Hz: pool.frequencyCi95Hz,
    amplitudeMm: pool.amplitudeMm,
    linesUsed: pool.linesUsed,
    linesTraced: traced.lines.length,
    scanIndex,
    shapers: recommendation.options,
    recommended: recommendation.recommended,
  }
}
