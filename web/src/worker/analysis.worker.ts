import * as Comlink from 'comlink'
import { loadOpenCv } from '../engine/opencv'
import type { Mat, OpenCv } from '../engine/opencv'
import { analyzeCoupon } from '../engine/couponAnalyzer'
import { measureCard } from '../engine/cardEdgeMeasurer'
import { combineScans } from '../engine/scanCombiner'
import { combinePlanes } from '../engine/multiPlaneCombiner'
import { renderOverlayMat } from '../engine/overlayRenderer'
import { ScanAnalysisError } from '../engine/types'
import type {
  AnalysisOptions,
  CalibrationResult,
  MultiPlaneResult,
  Plane,
  PlaneAnalysis,
  ScaleReferenceResult,
} from '../engine/types'
import { decodeToBgr, matToImageBitmap } from './decode'

// The CV pipeline runs here, off the main thread, so the UI never freezes during analysis.

type OneResult = { ok: true; result: CalibrationResult } | { ok: false; error: ScanAnalysisError }

function analyzeOne(cv: OpenCv, image: Mat, options: AnalysisOptions): OneResult {
  try {
    return { ok: true, result: analyzeCoupon(cv, image, options) }
  } catch (e) {
    if (e instanceof ScanAnalysisError) return { ok: false, error: e }
    throw e
  }
}

async function renderOverlayBitmap(cv: OpenCv, image: Mat, result: CalibrationResult): Promise<ImageBitmap> {
  const mat = renderOverlayMat(cv, image, result)
  try {
    return await matToImageBitmap(cv, mat)
  } finally {
    mat.delete()
  }
}

// The multi-plane entry point: the user drops in any subset of plates' scans (two per plate), and we
// auto-sort them by their plane-ID, combine each plane's pair, and reconcile across planes. A scan
// with no plane-ID (the original XY-only coupon) defaults to XY, so old coupons still work.
export interface PlaneOverlays {
  plane: Plane
  a: ImageBitmap
  b: ImageBitmap
}

export interface MultiScanSuccess {
  ok: true
  result: MultiPlaneResult
  overlays: PlaneOverlays[]
  notes: string[]
}

export interface MultiScanFailure {
  ok: false
  notes: string[]
}

export type MultiScanResponse = MultiScanSuccess | MultiScanFailure

async function analyzeScans(
  scans: ArrayBuffer[],
  options: AnalysisOptions,
): Promise<MultiScanResponse> {
  const cv = await loadOpenCv()
  const notes: string[] = []
  // Bounded memory: decode -> analyze -> render overlay -> free the Mat, one scan at a time.
  const done: Array<{ result: CalibrationResult; overlay: ImageBitmap }> = []
  for (let i = 0; i < scans.length; i++) {
    // Decode inside the try so a single corrupt/unsupported image (or an overlay-render failure)
    // becomes a note for that one scan and the batch keeps going, rather than aborting and leaking
    // the overlays already built for the good scans.
    let img: Mat | null = null
    try {
      img = await decodeToBgr(cv, scans[i])
      const one = analyzeOne(cv, img, options)
      if (one.ok) {
        done.push({ result: one.result, overlay: await renderOverlayBitmap(cv, img, one.result) })
      } else {
        notes.push(
          `Scan ${i + 1}: ${one.error.detectedRings.length} rings found but the coupon could not be aligned.`,
        )
      }
    } catch (e) {
      notes.push(`Scan ${i + 1}: could not be read (${e instanceof Error ? e.message : String(e)}).`)
    } finally {
      img?.delete()
    }
  }

  // Group by the plane read from the corner dots. A scan with NO readable plane-ID is rejected, never
  // assumed to be XY: a silent XY guess would mislabel a shadowed-out XZ/YZ plate and emit a wrong
  // correction. Its overlay is left unused and closed below.
  const groups = new Map<Plane, Array<{ result: CalibrationResult; overlay: ImageBitmap }>>()
  for (const d of done) {
    if (!d.result.plane) {
      notes.push(
        'A scan has no readable plane-ID (the 1/2/3 corner dots could not be counted), so it was left ' +
          'out. Rescan it with more contrast, e.g. a coloured backing sheet.',
      )
      continue
    }
    const g = groups.get(d.result.plane)
    if (g) g.push(d)
    else groups.set(d.result.plane, [d])
  }

  const planeAnalyses: PlaneAnalysis[] = []
  const overlays: PlaneOverlays[] = []
  const used = new Set<ImageBitmap>()
  for (const [plane, group] of groups) {
    if (group.length !== 2) {
      notes.push(
        `${plane}: ${group.length} scan(s) found; each plane needs exactly two, a quarter-turn apart.`,
      )
      continue
    }
    const twoScan = combineScans(group[0].result, group[1].result)
    planeAnalyses.push({ plane, twoScan })
    overlays.push({ plane, a: group[0].overlay, b: group[1].overlay })
    used.add(group[0].overlay)
    used.add(group[1].overlay)
    if (!twoScan.rotationLooksValid)
      notes.push(
        `${plane}: the two scans aren't a clean quarter-turn apart, so the scanner error may not fully cancel.`,
      )
  }

  // Close the overlays of any scan we could not place, so they don't leak.
  for (const d of done) if (!used.has(d.overlay)) d.overlay.close()

  if (planeAnalyses.length === 0)
    return { ok: false, notes: notes.length ? notes : ['No plane could be analyzed from these scans.'] }

  const result = combinePlanes(planeAnalyses)
  const transferables = overlays.flatMap((o) => [o.a, o.b])
  return Comlink.transfer({ ok: true, result, overlays, notes }, transferables)
}

async function measureCardScan(
  bytes: ArrayBuffer,
  knownLongSideMm: number,
  nominalDpi: number,
): Promise<ScaleReferenceResult> {
  const cv = await loadOpenCv()
  const img = await decodeToBgr(cv, bytes)
  try {
    return measureCard(cv, img, knownLongSideMm, nominalDpi)
  } finally {
    img.delete()
  }
}

const api = { analyzeScans, measureCardScan }
export type AnalysisApi = typeof api

Comlink.expose(api)
