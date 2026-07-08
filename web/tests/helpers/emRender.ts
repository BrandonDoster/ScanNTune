import type { RgbaImage } from '../../src/engine/imageData'
import type { EmTestSpec } from '../../src/engine/em/types'
import { ANCHOR_OVERLAP_MM } from '../../src/engine/em/gcodeGenerator'
import { emCouponGeometry } from '../../src/engine/em/types'

export interface EmRenderOptions {
  spec: EmTestSpec
  /** Ground-truth deposited bead width in mm (the value the pipeline must recover). */
  trueWidthMm: number
  pxPerMm?: number
  rotationDegrees?: number
  quarterTurns?: 0 | 1 | 2 | 3
  flipped?: boolean
  noiseSigma?: number
  blurSigmaMm?: number
  plasticGray?: number
  backgroundGray?: number
  /** Uniform pitch scale simulating printer axis stretch (default 1). */
  pitchScale?: number
  marginMm?: number
}

type Resolved = Required<EmRenderOptions>

const DEFAULTS: Omit<Resolved, 'spec' | 'trueWidthMm'> = {
  pxPerMm: 12,
  rotationDegrees: 0,
  quarterTurns: 0,
  flipped: false,
  noiseSigma: 0,
  blurSigmaMm: 0.04,
  plasticGray: 40,
  backgroundGray: 245,
  pitchScale: 1,
  marginMm: 8,
}

/** Deterministic pseudo-random (mulberry32), same construction as paRender.ts. */
function rng(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function gauss(rand: () => number): number {
  const u = Math.max(rand(), 1e-12)
  const v = rand()
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v)
}

/**
 * Linear coverage ramp centered on an edge: `d` is the signed distance (mm) from the edge,
 * positive meaning inside the covered region. A box-filter approximation of edge blur: full
 * coverage `sigma` mm inside, zero `sigma` mm outside, linear between (deterministic, cheap,
 * and matches the coupon's real scan softness closely enough to validate the pipeline).
 */
function softEdge(d: number, sigma: number): number {
  if (sigma <= 0) return d >= 0 ? 1 : 0
  return Math.max(0, Math.min(1, 0.5 + d / sigma))
}

/** Coverage (0..1) of an axis-aligned box, softened at its edges by `sigma` mm. */
function boxCoverage(
  x: number,
  y: number,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  sigma: number,
): number {
  const dx = Math.min(x - x0, x1 - x)
  const dy = Math.min(y - y0, y1 - y)
  return softEdge(Math.min(dx, dy), sigma)
}

/**
 * Fractional plastic coverage (0..1) at a coupon-frame point, per the EM coupon model in
 * `src/engine/em/types.ts`: an outer frame band, a center rail, two comb rows of test lines,
 * and three fiducial holes cut through the band. `pitchScale` simulates a stretched X axis: it
 * scales every coupon x-coordinate (band/rail/window/fiducial/line positions), not line widths.
 */
function couponCoverage(
  x: number,
  y: number,
  g: ReturnType<typeof emCouponGeometry>,
  o: Resolved,
): number {
  const sigma = o.blurSigmaMm
  const scaleX = (xMm: number) => xMm * o.pitchScale
  const Wc = scaleX(g.couponWidthMm)
  const Hc = g.couponHeightMm
  const band = g.frameBandMm

  const bandTop = boxCoverage(x, y, 0, 0, Wc, band, sigma)
  const bandBottom = boxCoverage(x, y, 0, Hc - band, Wc, Hc, sigma)
  const bandLeft = boxCoverage(x, y, 0, 0, scaleX(band), Hc, sigma)
  const bandRight = boxCoverage(x, y, Wc - scaleX(band), 0, Wc, Hc, sigma)
  let coverage = Math.max(bandTop, bandBottom, bandLeft, bandRight)

  const railCoverage = boxCoverage(x, y, scaleX(band), g.railY0Mm, Wc - scaleX(band), g.railY1Mm, sigma)
  coverage = Math.max(coverage, railCoverage)

  const rows: { blocks: typeof g.topRow; y0: number; y1: number }[] = [
    { blocks: g.topRow, y0: g.topRowY0Mm - ANCHOR_OVERLAP_MM, y1: g.topRowY1Mm + ANCHOR_OVERLAP_MM },
    {
      blocks: g.bottomRow,
      y0: g.bottomRowY0Mm - ANCHOR_OVERLAP_MM,
      y1: g.bottomRowY1Mm + ANCHOR_OVERLAP_MM,
    },
  ]
  for (const row of rows) {
    if (y < row.y0 - sigma || y > row.y1 + sigma) continue
    const rowCoverage = softEdge(Math.min(y - row.y0, row.y1 - y), sigma)
    if (rowCoverage <= 0) continue
    for (const block of row.blocks) {
      for (const lineX of block.lineXsMm) {
        const c = scaleX(lineX)
        const half = o.trueWidthMm / 2
        if (Math.abs(x - c) > half + sigma) continue
        const lineCoverage = Math.min(rowCoverage, softEdge(half - Math.abs(x - c), sigma))
        coverage = Math.max(coverage, lineCoverage)
      }
    }
  }

  let holeCoverage = 0
  for (const f of g.fiducials) {
    const fx = scaleX(f.xMm)
    const half = g.fiducialSizeMm / 2
    holeCoverage = Math.max(
      holeCoverage,
      boxCoverage(x, y, fx - half, f.yMm - half, fx + half, f.yMm + half, sigma),
    )
  }

  return Math.max(0, Math.min(1, coverage - holeCoverage))
}

export function renderEmScan(options: EmRenderOptions): RgbaImage {
  const o: Resolved = { ...DEFAULTS, ...options }
  const g = emCouponGeometry(o.spec)
  const Wc = g.couponWidthMm * o.pitchScale
  const Hc = g.couponHeightMm
  const w0Mm = Wc + 2 * o.marginMm
  const h0Mm = Hc + 2 * o.marginMm
  const rad = ((o.rotationDegrees + o.quarterTurns * 90) * Math.PI) / 180
  const cos = Math.cos(rad)
  const sin = Math.sin(rad)
  const wMm = Math.abs(cos) * w0Mm + Math.abs(sin) * h0Mm
  const hMm = Math.abs(sin) * w0Mm + Math.abs(cos) * h0Mm
  const width = Math.round(wMm * o.pxPerMm)
  const height = Math.round(hMm * o.pxPerMm)
  const cx = wMm / 2
  const cy = hMm / 2
  const rand = rng(1234567)
  const data = new Uint8ClampedArray(width * height * 4)

  const S = 3
  for (let py = 0; py < height; py++) {
    for (let px = 0; px < width; px++) {
      let acc = 0
      for (let sy = 0; sy < S; sy++) {
        for (let sx = 0; sx < S; sx++) {
          const imx = (px + (sx + 0.5) / S) / o.pxPerMm
          const imy = (py + (sy + 0.5) / S) / o.pxPerMm
          let mx = cos * (imx - cx) + sin * (imy - cy) + w0Mm / 2
          const my = -sin * (imx - cx) + cos * (imy - cy) + h0Mm / 2
          if (o.flipped) mx = w0Mm - mx
          const bx = mx - o.marginMm
          const by = my - o.marginMm
          const coverage =
            bx < 0 || by < 0 || bx > Wc || by > Hc ? 0 : couponCoverage(bx, by, g, o)
          acc += o.backgroundGray + coverage * (o.plasticGray - o.backgroundGray)
        }
      }
      const gray = acc / (S * S) + (o.noiseSigma > 0 ? gauss(rand) * o.noiseSigma : 0)
      const v = Math.max(0, Math.min(255, Math.round(gray)))
      const i = (py * width + px) * 4
      data[i] = v
      data[i + 1] = v
      data[i + 2] = v
      data[i + 3] = 255
    }
  }
  return { data, width, height }
}
