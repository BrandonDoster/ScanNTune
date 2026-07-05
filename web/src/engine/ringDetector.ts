import type { Mat, OpenCv } from './opencv'
import type { DetectedRing } from './types'
import { median } from './math'
import { borderMean } from './cvUtils'

// Thresholds the part against the background on the HSV value channel, finds the enclosed holes, and
// keeps the ring centres (the binary area centroid, immune to over/under extrusion). Ring holes are
// separated from the much larger square lattice cells by a size cluster (radius-median filter), so
// circularity is only a loose gate to drop slivers (real holes are rough, circularity ~0.2 to 0.8).

export function detectRings(
  cv: OpenCv,
  image: Mat,
  minHoleAreaPx = 40.0,
  minCircularity = 0.2,
): DetectedRing[] {
  if (!image || image.empty()) throw new Error('Image is null or empty.')

  const value = extractValueChannel(cv, image)
  const binary = new cv.Mat()
  const contours = new cv.MatVector()
  const hierarchy = new cv.Mat()
  try {
    cv.threshold(value, binary, 0, 255, cv.THRESH_BINARY + cv.THRESH_OTSU)

    // Make the part white and the background black, whichever way the contrast falls.
    if (borderMean(cv, binary) > 127.0) cv.bitwise_not(binary, binary)

    const kernel = cv.getStructuringElement(cv.MORPH_ELLIPSE, new cv.Size(3, 3))
    cv.morphologyEx(binary, binary, cv.MORPH_CLOSE, kernel)
    kernel.delete()

    cv.findContours(binary, contours, hierarchy, cv.RETR_CCOMP, cv.CHAIN_APPROX_NONE)

    const parents = hierarchy.data32S // [next, prev, firstChild, parent] per contour
    const candidates: DetectedRing[] = []
    const count = contours.size()
    for (let i = 0; i < count; i++) {
      if (parents[i * 4 + 3] < 0) continue // only interior contours (holes) can be ring centres

      const contour = contours.get(i)
      try {
        const area = cv.contourArea(contour, false)
        if (area < minHoleAreaPx) continue

        const perimeter = cv.arcLength(contour, true)
        if (perimeter <= 0) continue

        const circularity = (4.0 * Math.PI * area) / (perimeter * perimeter)
        if (circularity < minCircularity) continue

        const m = cv.moments(contour, false)
        if (m.m00 === 0) continue

        candidates.push({
          centerX: m.m10 / m.m00,
          centerY: m.m01 / m.m00,
          radiusPx: Math.sqrt(area / Math.PI),
          circularity,
        })
      } finally {
        contour.delete()
      }
    }

    return filterByRadius(candidates)
  } finally {
    value.delete()
    binary.delete()
    contours.delete()
    hierarchy.delete()
  }
}

// Drop anything whose radius is far from the population median (stray holes / lattice cells).
function filterByRadius(candidates: DetectedRing[]): DetectedRing[] {
  if (candidates.length === 0) return candidates
  const med = median(candidates.map((c) => c.radiusPx))
  return candidates.filter((c) => c.radiusPx >= med * 0.5 && c.radiusPx <= med * 1.8)
}

function extractValueChannel(cv: OpenCv, image: Mat): Mat {
  if (image.channels() === 1) return image.clone()
  const hsv = new cv.Mat()
  cv.cvtColor(image, hsv, cv.COLOR_BGR2HSV)
  const channels = new cv.MatVector()
  cv.split(hsv, channels)
  // MatVector.get(i) hands out a new Mat wrapper that channels.delete() does not free, so delete it
  // explicitly after cloning the value channel (V = max(B, G, R)).
  const channel = channels.get(2)
  const v = channel.clone()
  channel.delete()
  channels.delete()
  hsv.delete()
  return v
}
