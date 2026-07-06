import type { RgbaImage } from '../../src/engine/imageData'
import type { PaTestSpec } from '../../src/engine/pa/types'
import { couponGeometry, defaultPaTestSpec, paValueForLine } from '../../src/engine/pa/types'

export interface PaRenderOptions {
  spec: PaTestSpec
  pxPerMm: number // default 12 (about 300 dpi)
  truePa: number // ground-truth PA the "printer" needed
  bulgeGainMmPerPa: number // width bulge amplitude per unit PA error, default 30
  transitionSigmaMm: number // spatial extent of the transient, default 1.5
  rotationDegrees: number // whole-image rotation, default 0
  flipped: boolean // mirror the coupon, default false
  noiseSigma: number // additive gaussian pixel noise 0-255, default 4
  baseGray: number // base filament tone, default 210 (light)
  lineGray: number // test line tone, default 40 (dark)
  backgroundGray: number // scanner lid behind fiducial holes, default 120
}

const DEFAULTS: Omit<PaRenderOptions, 'truePa'> = {
  spec: defaultPaTestSpec(),
  pxPerMm: 12,
  bulgeGainMmPerPa: 30,
  transitionSigmaMm: 1.5,
  rotationDegrees: 0,
  flipped: false,
  noiseSigma: 4,
  baseGray: 210,
  lineGray: 40,
  backgroundGray: 120,
}

/** Deterministic pseudo-random (mulberry32) so fixtures are reproducible. */
function rng(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/**
 * Signed transient profile s(x) along a line. At the deceleration transition
 * (fast-to-slow, the second transition) too-low PA bulges: positive lobe.
 * At the acceleration transition (slow-to-fast, the first transition)
 * too-high PA starves: negative lobe there. Model: gaussian lobes at each
 * transition, sign -1 at the first transition, +1 at the second, scaled by
 * (truePa - pa) at the call site.
 */
function transient(xMm: number, transitions: [number, number], sigma: number): number {
  const [t1, t2] = transitions
  const lobe = (c: number, sign: number) => sign * Math.exp(-((xMm - c) ** 2) / (2 * sigma * sigma))
  return lobe(t1, -1) + lobe(t2, 1)
}

export function renderPaScan(options: Partial<PaRenderOptions> & { truePa: number }): RgbaImage {
  const o: PaRenderOptions = { ...DEFAULTS, ...options }
  const g = couponGeometry(o.spec)
  const borderMm = 6
  const wMm = g.baseWidthMm + 2 * borderMm
  const hMm = g.baseHeightMm + 2 * borderMm
  const width = Math.round(wMm * o.pxPerMm)
  const height = Math.round(hMm * o.pxPerMm)
  const cx = wMm / 2
  const cy = hMm / 2
  const rad = (o.rotationDegrees * Math.PI) / 180
  const cos = Math.cos(rad)
  const sin = Math.sin(rad)
  const rand = rng(1234567)
  const data = new Uint8ClampedArray(width * height * 4)

  const S = 3 // supersampling factor
  for (let py = 0; py < height; py++) {
    for (let px = 0; px < width; px++) {
      let acc = 0
      for (let sy = 0; sy < S; sy++) {
        for (let sx = 0; sx < S; sx++) {
          // Pixel center in image mm, rotated back into coupon frame.
          const imx = (px + (sx + 0.5) / S) / o.pxPerMm
          const imy = (py + (sy + 0.5) / S) / o.pxPerMm
          let mx = cos * (imx - cx) + sin * (imy - cy) + cx
          const my = -sin * (imx - cx) + cos * (imy - cy) + cy
          if (o.flipped) mx = wMm - mx
          const bx = mx - borderMm // coupon-frame mm
          const by = my - borderMm
          acc += sampleGray(o, g, bx, by)
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

function gauss(rand: () => number): number {
  // Box-Muller
  const u = Math.max(rand(), 1e-12)
  const v = rand()
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v)
}

function sampleGray(
  o: PaRenderOptions,
  g: ReturnType<typeof couponGeometry>,
  x: number,
  y: number,
): number {
  // Outside the base: scanner background.
  if (x < 0 || y < 0 || x > g.baseWidthMm || y > g.baseHeightMm) return o.backgroundGray
  // Fiducial holes: background shows through.
  for (const f of g.fiducials) {
    if (
      Math.abs(x - f.xMm) < g.fiducialSizeMm / 2 &&
      Math.abs(y - f.yMm) < g.fiducialSizeMm / 2
    ) {
      return o.backgroundGray
    }
  }
  // Test lines: check distance from each line's centerline with modeled width.
  const lineLen = 2 * o.spec.slowSegmentMm + o.spec.fastSegmentMm
  for (let i = 0; i < o.spec.lineCount; i++) {
    const yc = g.lineStartYMm(i)
    if (Math.abs(y - yc) > o.spec.linePitchMm / 2) continue
    const lx = x - g.lineStartXMm
    if (lx < 0 || lx > lineLen) break
    const paErr = paValueForLine(o.spec, i) - o.truePa
    const s = transient(lx, g.transitionXsMm, o.transitionSigmaMm)
    // Too-low PA (paErr negative) bulges at the deceleration transition
    // (second lobe, sign +1); too-high PA (paErr positive) starves there.
    // Captured by -paErr * s.
    const halfNominal = o.spec.lineWidthMm / 2
    let half = halfNominal * (1 + o.bulgeGainMmPerPa * -paErr * s)
    half = Math.max(half, halfNominal * 0.2)
    if (Math.abs(y - yc) <= half) return o.lineGray
    break
  }
  return o.baseGray
}
