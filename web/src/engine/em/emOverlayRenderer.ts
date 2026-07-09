import type { Mat, OpenCv } from '../opencv'
import type { EmAlignment } from './fiducialAligner'
import { mmToPx } from './fiducialAligner'
import type { EmResult } from './emAnalyzer'
import type { EmBlock, EmTestSpec } from './types'
import { emCouponGeometry } from './types'
import { median } from '../math'

// Draws the EM analysis over a copy of the scan: each measured test block gets a rectangle tinted
// by how far its per-block median bead width sits from the overall estimate (green = close, red =
// far, normalized over the measured blocks), and the three fiducial holes are outlined. Rectangles
// are placed in coupon-frame millimetres and mapped to scan pixels through the alignment affine, so
// they follow any rotation or flip. The finished overlay is cropped to the coupon's outline (plus a
// small margin) so the UI shows the coupon, not the whole scan page. Uses only OpenCV drawing (no
// image codec). Colours are BGR. The caller deletes the result.

const FIDUCIAL_COLOR = [0, 255, 255, 255] // yellow

const SHIFT = 3
const SCALE = 1 << SHIFT

// Margin around the coupon's pixel bounding box, as a fraction of the box's larger side.
const CROP_MARGIN_FRACTION = 0.05

export function renderEmOverlayMat(
  cv: OpenCv,
  image: Mat,
  alignment: EmAlignment,
  spec: EmTestSpec,
  result: EmResult,
): Mat {
  const canvas = toBgr(cv, image)
  const thickness = strokeThickness(image)
  const g = emCouponGeometry(spec)

  // Per-block median bead width, keyed by row and pitch index (the samples' blockIndex is the
  // pitch index, matching EmBlock.index in the geometry's rows).
  const byBlock = new Map<string, number[]>()
  for (const s of result.samples) {
    const key = `${s.row}:${s.blockIndex}`
    const list = byBlock.get(key)
    if (list) list.push(s.wMm)
    else byBlock.set(key, [s.wMm])
  }
  const deviations = new Map<string, number>()
  if (result.wMm !== null) {
    for (const [key, values] of byBlock) {
      deviations.set(key, Math.abs(median(values) - result.wMm))
    }
  }

  // Normalize the deviations to [0, 1] for the green-to-red tint.
  const finite = [...deviations.values()].filter((d) => Number.isFinite(d))
  const minDev = Math.min(...finite)
  const maxDev = Math.max(...finite)
  const range = maxDev - minDev

  const rows: { row: 0 | 1; blocks: EmBlock[]; y0Mm: number; y1Mm: number }[] = [
    { row: 0, blocks: g.topRow, y0Mm: g.topRowY0Mm, y1Mm: g.topRowY1Mm },
    { row: 1, blocks: g.bottomRow, y0Mm: g.bottomRowY0Mm, y1Mm: g.bottomRowY1Mm },
  ]
  for (const r of rows) {
    for (const block of r.blocks) {
      const dev = deviations.get(`${r.row}:${block.index}`)
      if (dev === undefined || !Number.isFinite(dev)) continue
      const t = range > 0 ? (dev - minDev) / range : 0
      const color = new cv.Scalar(0, Math.round(255 * (1 - t)), Math.round(255 * t), 255)
      drawMmRect(
        cv,
        canvas,
        alignment,
        block.x0Mm,
        r.y0Mm,
        block.x0Mm + block.widthMm,
        r.y1Mm,
        color,
        thickness,
      )
    }
  }

  const fidColor = new cv.Scalar(...FIDUCIAL_COLOR)
  const halfFidMm = g.fiducialSizeMm / 2
  for (const f of g.fiducials) {
    drawMmRect(
      cv,
      canvas,
      alignment,
      f.xMm - halfFidMm,
      f.yMm - halfFidMm,
      f.xMm + halfFidMm,
      f.yMm + halfFidMm,
      fidColor,
      thickness,
    )
  }

  return cropToCoupon(cv, canvas, alignment, g.couponWidthMm, g.couponHeightMm)
}

// Crops the canvas to the axis-aligned bounding box of the coupon's four outline corners mapped
// into scan pixels, expanded by CROP_MARGIN_FRACTION and clamped to the image. Presentation only:
// no measurement depends on this. Consumes the input canvas and returns a new Mat.
function cropToCoupon(
  cv: OpenCv,
  canvas: Mat,
  alignment: EmAlignment,
  couponWidthMm: number,
  couponHeightMm: number,
): Mat {
  const corners = [
    mmToPx(alignment, 0, 0),
    mmToPx(alignment, couponWidthMm, 0),
    mmToPx(alignment, couponWidthMm, couponHeightMm),
    mmToPx(alignment, 0, couponHeightMm),
  ]
  const xs = corners.map((p) => p.x)
  const ys = corners.map((p) => p.y)
  const margin =
    Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys)) *
    CROP_MARGIN_FRACTION
  const x0 = Math.max(0, Math.floor(Math.min(...xs) - margin))
  const y0 = Math.max(0, Math.floor(Math.min(...ys) - margin))
  const x1 = Math.min(canvas.cols, Math.ceil(Math.max(...xs) + margin))
  const y1 = Math.min(canvas.rows, Math.ceil(Math.max(...ys) + margin))
  if (x1 <= x0 || y1 <= y0) return canvas
  const roi = canvas.roi(new cv.Rect(x0, y0, x1 - x0, y1 - y0))
  const cropped = roi.clone()
  roi.delete()
  canvas.delete()
  return cropped
}

// An axis-aligned coupon-frame rectangle, drawn as four lines because the affine may rotate it in
// scan pixels.
function drawMmRect(
  cv: OpenCv,
  canvas: Mat,
  alignment: EmAlignment,
  x0Mm: number,
  y0Mm: number,
  x1Mm: number,
  y1Mm: number,
  color: InstanceType<OpenCv['Scalar']>,
  thickness: number,
): void {
  const corners = [
    mmToPx(alignment, x0Mm, y0Mm),
    mmToPx(alignment, x1Mm, y0Mm),
    mmToPx(alignment, x1Mm, y1Mm),
    mmToPx(alignment, x0Mm, y1Mm),
  ].map((p) => new cv.Point(Math.round(p.x * SCALE), Math.round(p.y * SCALE)))
  for (let i = 0; i < 4; i++) {
    cv.line(canvas, corners[i], corners[(i + 1) % 4], color, thickness, cv.LINE_AA, SHIFT)
  }
}

function toBgr(cv: OpenCv, image: Mat): Mat {
  const canvas = new cv.Mat()
  if (image.channels() === 1) cv.cvtColor(image, canvas, cv.COLOR_GRAY2BGR)
  else image.copyTo(canvas)
  return canvas
}

function strokeThickness(image: Mat): number {
  return Math.max(1, Math.round(Math.max(image.cols, image.rows) / 500.0))
}
