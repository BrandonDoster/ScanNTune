import type { Mat, OpenCv } from './opencv'
import type { Plane } from './types'

// Reads the plane-ID code that is drilled into the origin marker disk: 1/2/3 small dots => XY/XZ/YZ.
// Called once the grid marker has resolved the origin (its pixel centre) and the ring pitch. The dots
// are far smaller than a ring hole, so they never enter ring detection or the grid fit; here we crop
// a small window around the origin, find the enclosed dot-holes, and count them. Returns null when
// the count is not 1..3 (e.g. the original dot-less coupon), so the caller can leave the plate
// unidentified rather than mislabel it.

export function readPlaneId(
  cv: OpenCv,
  image: Mat,
  originX: number,
  originY: number,
  pitchPx: number,
): Plane | null {
  const n = countPlaneDots(cv, image, originX, originY, pitchPx)
  return n === 1 ? 'XY' : n === 2 ? 'XZ' : n === 3 ? 'YZ' : null
}

// Exposed for tests: the raw dot count in the origin marker window.
export function countPlaneDots(
  cv: OpenCv,
  image: Mat,
  originX: number,
  originY: number,
  pitchPx: number,
): number {
  const half = Math.max(10, Math.round(0.35 * pitchPx))
  const x0 = Math.max(0, Math.round(originX) - half)
  const y0 = Math.max(0, Math.round(originY) - half)
  const x1 = Math.min(image.cols, Math.round(originX) + half)
  const y1 = Math.min(image.rows, Math.round(originY) + half)
  const w = x1 - x0
  const h = y1 - y0
  if (w < 8 || h < 8) return 0

  const roiView = image.roi(new cv.Rect(x0, y0, w, h))
  const roi = roiView.clone()
  roiView.delete()

  const gray = new cv.Mat()
  const binary = new cv.Mat()
  const contours = new cv.MatVector()
  const hierarchy = new cv.Mat()
  try {
    toValueChannel(cv, roi, gray)
    cv.threshold(gray, binary, 0, 255, cv.THRESH_BINARY + cv.THRESH_OTSU)
    // Make the marker disk (the plastic the origin sits inside) the white foreground, whichever way
    // the contrast falls, so the dots read as enclosed holes.
    if (!centreIsForeground(cv, binary)) cv.bitwise_not(binary, binary)

    cv.findContours(binary, contours, hierarchy, cv.RETR_CCOMP, cv.CHAIN_APPROX_NONE)
    const parents = hierarchy.data32S // [next, prev, firstChild, parent] per contour

    const cxRoi = w / 2
    const cyRoi = h / 2
    const nearR = 0.22 * pitchPx // the 3 dots span ~1 dot-pitch (3 mm) either side of the origin; margin
    const dotR = 0.04 * pitchPx // a 2 mm dot at the 25 mm ring pitch
    const areaMin = Math.max(6, Math.PI * (dotR * 0.35) * (dotR * 0.35))
    const areaMax = Math.PI * (dotR * 2.5) * (dotR * 2.5)

    let count = 0
    const total = contours.size()
    for (let i = 0; i < total; i++) {
      if (parents[i * 4 + 3] < 0) continue // interior (hole) contours only
      const c = contours.get(i)
      try {
        const area = cv.contourArea(c, false)
        if (area < areaMin || area > areaMax) continue
        const m = cv.moments(c, false)
        if (m.m00 === 0) continue
        const dx = m.m10 / m.m00 - cxRoi
        const dy = m.m01 / m.m00 - cyRoi
        if (dx * dx + dy * dy > nearR * nearR) continue
        count++
      } finally {
        c.delete()
      }
    }
    return count
  } finally {
    roi.delete()
    gray.delete()
    binary.delete()
    contours.delete()
    hierarchy.delete()
  }
}

// The origin sits in the solid marker disk, so the majority class in a small central box is the
// plastic; return whether that class is currently white (255).
function centreIsForeground(cv: OpenCv, binary: Mat): boolean {
  const s = Math.max(2, Math.round(Math.min(binary.rows, binary.cols) * 0.12))
  const cx = Math.round(binary.cols / 2)
  const cy = Math.round(binary.rows / 2)
  const x = Math.max(0, cx - s)
  const y = Math.max(0, cy - s)
  const wBox = Math.min(2 * s, binary.cols - x)
  const hBox = Math.min(2 * s, binary.rows - y)
  const box = binary.roi(new cv.Rect(x, y, wBox, hBox))
  const white = cv.countNonZero(box)
  const total = box.rows * box.cols
  box.delete()
  return white * 2 >= total
}

function toValueChannel(cv: OpenCv, src: Mat, dst: Mat): void {
  if (src.channels() === 1) {
    src.copyTo(dst)
    return
  }
  const hsv = new cv.Mat()
  cv.cvtColor(src, hsv, cv.COLOR_BGR2HSV)
  const channels = new cv.MatVector()
  cv.split(hsv, channels)
  const v = channels.get(2)
  v.copyTo(dst)
  v.delete()
  channels.delete()
  hsv.delete()
}
