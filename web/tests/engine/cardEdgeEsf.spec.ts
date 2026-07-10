// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { getCv } from '../helpers/cv'
import { measureCard } from '../../src/engine/cardEdgeMeasurer'
import type { Mat, OpenCv } from '../../src/engine/opencv'

// Validates the slanted-edge refinement against a synthetic card whose edge profile is a step
// convolved with the scanner's pixel aperture PLUS a mirrored shadow dip hugging each edge: the
// asymmetric edge spread function that biased the per-row discrete gradient peak outward on both
// edges (a fixed sub-pixel offset per edge, so the span error scaled as 1/dpi). The renders are
// analytic (exact pixel-aperture integrals of the continuous profile), so the ground truth edge
// location is known exactly and the same physical card can be rendered at any dpi and phase.

const LONG_MM = 85.6
const SHORT_MM = 53.98
const MARGIN_MM = 10
const HEIGHT_MM = SHORT_MM + 2 * MARGIN_MM

// The continuous scene profile: an optical step of width SIGMA_O (mm) at each edge, and a Gaussian
// shadow/halo of amplitude DIP_A centred DIP_C outside each edge with width DIP_S, mirrored between
// the two edges exactly as a real scan's lid shadow mirrors.
const SIGMA_O = 0.05
const DIP_C = 0.15
const DIP_S = 0.08

// The tiny slant ISO 12233 prescribes so successive rows sample the edge at different sub-pixel
// phases (about 0.2 degrees, a fraction of a pixel per row).
const SLANT = 0.0035

// The ground truth the estimator targets: the total mm-domain blur it applies is the pixel
// aperture plus its aperture-matched kernel, together sigma_tot = 0.10 mm at every dpi, so the
// true edge location is the gradient peak of the continuous profile convolved with a 0.10 mm
// Gaussian: identical in mm at every dpi, which is the whole point of the method.
const SIGMA_TOT = 0.1

function erf(x: number): number {
  // Abramowitz and Stegun 7.1.26, max absolute error 1.5e-7.
  const s = x < 0 ? -1 : 1
  const a = Math.abs(x)
  const t = 1 / (1 + 0.3275911 * a)
  const y =
    1 -
    (((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) *
      t) *
      Math.exp(-a * a)
  return s * y
}

function phi(z: number): number {
  return Math.exp(-0.5 * z * z) / Math.sqrt(2 * Math.PI)
}

function Phi(z: number): number {
  return 0.5 * (1 + erf(z / Math.SQRT2))
}

// Antiderivative of Phi((x - a) / sigma): the exact pixel-aperture integral of the step term.
function stepIntegral(x: number, a: number, sigma: number): number {
  const z = (x - a) / sigma
  return (x - a) * Phi(z) + sigma * phi(z)
}

// Aperture-averaged Gaussian dip over [x0, x1] centred at b with width s and unit amplitude.
function dipAverage(x0: number, x1: number, b: number, s: number): number {
  return (s * Math.sqrt(2 * Math.PI) * (Phi((x1 - b) / s) - Phi((x0 - b) / s))) / (x1 - x0)
}

interface RenderSpec {
  dpi: number
  phase: number // sub-pixel phase of the left edge, in pixels
  bg: number
  card: number
  dipA: number // shadow (negative) or halo (positive) amplitude in gray levels
}

function renderCard(cv: OpenCv, spec: RenderSpec): Mat {
  const mp = 25.4 / spec.dpi
  const width = Math.ceil((LONG_MM + 2 * MARGIN_MM) / mp)
  const height = Math.ceil(HEIGHT_MM / mp)
  const xL = MARGIN_MM + spec.phase * mp
  const xR = xL + LONG_MM
  const yTop = Math.round(MARGIN_MM / mp)
  const yBot = Math.round((MARGIN_MM + SHORT_MM) / mp)

  const img = new cv.Mat(height, width, cv.CV_8UC1, new cv.Scalar(spec.bg))
  const data = img.data as Uint8Array
  const amp = spec.card - spec.bg
  for (let y = yTop; y < yBot; y++) {
    const shift = SLANT * (y + 0.5) * mp
    const aL = xL + shift
    const aR = xR + shift
    const row = y * width
    for (let x = 0; x < width; x++) {
      const x0 = x * mp
      const x1 = (x + 1) * mp
      const step =
        (stepIntegral(x1, aL, SIGMA_O) -
          stepIntegral(x0, aL, SIGMA_O) -
          (stepIntegral(x1, aR, SIGMA_O) - stepIntegral(x0, aR, SIGMA_O))) /
        mp
      const dips =
        spec.dipA *
        (dipAverage(x0, x1, aL - DIP_C, DIP_S) + dipAverage(x0, x1, aR + DIP_C, DIP_S))
      const v = spec.bg + amp * step + dips
      data[row + x] = Math.max(0, Math.min(255, Math.round(v)))
    }
  }
  return img
}

// The signed offset of the left edge's true (sigma_tot-smoothed) gradient peak from the nominal
// edge, in mm, found numerically on a fine grid. By the mirror symmetry of the two edges the true
// span is LONG_MM - 2 * offset.
function trueEdgeOffsetMm(bg: number, card: number, dipA: number): number {
  const amp = card - bg
  const sigmaE = Math.sqrt(SIGMA_O * SIGMA_O + SIGMA_TOT * SIGMA_TOT)
  const sigmaD = Math.sqrt(DIP_S * DIP_S + SIGMA_TOT * SIGMA_TOT)
  const dipAmp = (dipA * DIP_S) / sigmaD
  const b = -DIP_C // dip centre relative to the nominal edge
  let bestU = 0
  let bestG = -1
  for (let u = -0.6; u <= 0.6; u += 1e-5) {
    const g = Math.abs(
      (amp / sigmaE) * phi(u / sigmaE) -
        ((dipAmp * (u - b)) / (sigmaD * sigmaD)) * Math.exp((-0.5 * (u - b) * (u - b)) / (sigmaD * sigmaD)),
    )
    if (g > bestG) {
      bestG = g
      bestU = u
    }
  }
  return bestU
}

function trueSpanPx(dpi: number, bg: number, card: number, dipA: number): number {
  const spanMm = LONG_MM - 2 * trueEdgeOffsetMm(bg, card, dipA)
  return ((spanMm * dpi) / 25.4) / Math.sqrt(1 + SLANT * SLANT)
}

function measureSpanPx(cv: OpenCv, spec: RenderSpec): number {
  const img = renderCard(cv, spec)
  try {
    const r = measureCard(cv, img, LONG_MM, spec.dpi)
    expect(r.success).toBe(true)
    return r.measuredWidthPx
  } finally {
    img.delete()
  }
}

describe('slanted-edge refinement on asymmetric edge profiles', () => {
  it('locates a shadowed dark-card edge within 0.05 px per edge at 600 dpi, at several phases', async () => {
    const cv = await getCv()
    const truth = trueSpanPx(600, 255, 60, -40)
    for (const phase of [0.13, 0.46, 0.79]) {
      const span = measureSpanPx(cv, { dpi: 600, phase, bg: 255, card: 60, dipA: -40 })
      expect(Math.abs(span - truth)).toBeLessThan(0.1) // 0.05 px per edge, two edges
    }
  }, 240000)

  it('locates a haloed pale-card edge within 0.05 px per edge at 600 dpi', async () => {
    const cv = await getCv()
    const truth = trueSpanPx(600, 40, 235, 40)
    const span = measureSpanPx(cv, { dpi: 600, phase: 0.31, bg: 40, card: 235, dipA: 40 })
    expect(Math.abs(span - truth)).toBeLessThan(0.1)
  }, 240000)

  it('recovers spans proportional across 150/300/600 dpi within 0.05 percent', async () => {
    const cv = await getCv()
    const spans = new Map<number, number>()
    for (const dpi of [150, 300, 600]) {
      spans.set(dpi, measureSpanPx(cv, { dpi, phase: 0.37, bg: 255, card: 60, dipA: -40 }))
    }
    expect(Math.abs(spans.get(300)! / spans.get(150)! / 2 - 1)).toBeLessThan(0.0005)
    expect(Math.abs(spans.get(600)! / spans.get(300)! / 2 - 1)).toBeLessThan(0.0005)
  }, 240000)
})
