import { describe, expect, it } from 'vitest'
import { defaultEmTestSpec, emCouponGeometry } from '../../../src/engine/em/types'
import { defaultPrinterProfile } from '../../../src/engine/pa/types'
import { renderEmScan } from '../../helpers/emRender'

const spec = defaultEmTestSpec(defaultPrinterProfile())
const g = emCouponGeometry(spec)

describe('renderEmScan', () => {
  it('sizes the canvas to the coupon plus margins at pxPerMm', () => {
    const pxPerMm = 12
    const marginMm = 8
    const img = renderEmScan({ spec, trueWidthMm: 0.42, pxPerMm, marginMm })
    const expectedW = Math.round((g.couponWidthMm + 2 * marginMm) * pxPerMm)
    const expectedH = Math.round((g.couponHeightMm + 2 * marginMm) * pxPerMm)
    expect(img.width).toBe(expectedW)
    expect(img.height).toBe(expectedH)
  })

  it('renders 3 background-colored fiducial squares at expected positions', () => {
    const pxPerMm = 12
    const marginMm = 8
    const backgroundGray = 245
    const plasticGray = 40
    const img = renderEmScan({
      spec,
      trueWidthMm: 0.42,
      pxPerMm,
      marginMm,
      backgroundGray,
      plasticGray,
      blurSigmaMm: 0,
    })
    for (const f of g.fiducials) {
      const px = Math.round((f.xMm + marginMm) * pxPerMm)
      const py = Math.round((f.yMm + marginMm) * pxPerMm)
      const i = (py * img.width + px) * 4
      expect(img.data[i]).toBeCloseTo(backgroundGray, 0)
    }
  })

  it('shows many alternating plastic/background transitions across the top row', () => {
    const pxPerMm = 12
    const marginMm = 8
    const backgroundGray = 245
    const plasticGray = 40
    const img = renderEmScan({
      spec,
      trueWidthMm: 0.42,
      pxPerMm,
      marginMm,
      backgroundGray,
      plasticGray,
      blurSigmaMm: 0,
    })
    const yMm = (g.topRowY0Mm + g.topRowY1Mm) / 2
    const py = Math.round((yMm + marginMm) * pxPerMm)
    const threshold = (backgroundGray + plasticGray) / 2
    let transitions = 0
    let wasPlastic = img.data[(py * img.width + 0) * 4] < threshold
    for (let px = 1; px < img.width; px++) {
      const i = (py * img.width + px) * 4
      const isPlastic = img.data[i] < threshold
      if (isPlastic !== wasPlastic) transitions++
      wasPlastic = isPlastic
    }
    // Each of blockCount blocks has linesPerBlock lines, so (linesPerBlock - 1) internal
    // gaps between plastic lines, each contributing a rising + falling edge.
    expect(transitions).toBeGreaterThanOrEqual(spec.blockCount * (spec.linesPerBlock - 1) * 2)
  })

  it('swaps histogram dominance when polarity is inverted', () => {
    const pxPerMm = 8
    const marginMm = 8
    const normal = renderEmScan({
      spec,
      trueWidthMm: 0.42,
      pxPerMm,
      marginMm,
      plasticGray: 40,
      backgroundGray: 245,
      blurSigmaMm: 0,
    })
    const inverted = renderEmScan({
      spec,
      trueWidthMm: 0.42,
      pxPerMm,
      marginMm,
      plasticGray: 245,
      backgroundGray: 40,
      blurSigmaMm: 0,
    })
    // A point inside the frame band (definitely plastic) and one at the rail center
    // (also plastic) must swap tone together with polarity.
    const bandPx = Math.round((g.frameBandMm / 2 + marginMm) * pxPerMm)
    const railYMm = g.railY0Mm + g.railWidthMm / 2
    const railPy = Math.round((railYMm + marginMm) * pxPerMm)
    const railPx = Math.round((g.couponWidthMm / 2 + marginMm) * pxPerMm)
    const bandI = (bandPx * normal.width + bandPx) * 4
    const railI = (railPy * normal.width + railPx) * 4
    expect(normal.data[bandI]).toBeCloseTo(40, 0)
    expect(inverted.data[bandI]).toBeCloseTo(245, 0)
    expect(normal.data[railI]).toBeCloseTo(40, 0)
    expect(inverted.data[railI]).toBeCloseTo(245, 0)

    // A point in the 2mm separator gap between block 0 and block 1 of the top row is
    // genuinely background (not plastic): it must swap the opposite way.
    const gapXMm = g.topRow[0].x0Mm + g.topRow[0].widthMm + 1
    const gapYMm = (g.topRowY0Mm + g.topRowY1Mm) / 2
    const gapPx = Math.round((gapXMm + marginMm) * pxPerMm)
    const gapPy = Math.round((gapYMm + marginMm) * pxPerMm)
    const gapI = (gapPy * normal.width + gapPx) * 4
    expect(normal.data[gapI]).toBeCloseTo(245, 0)
    expect(inverted.data[gapI]).toBeCloseTo(40, 0)
  })
})
