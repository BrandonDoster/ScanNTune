// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { getCv } from '../../helpers/cv'
import { renderPaScan } from '../../helpers/paRender'
import { rgbaToBgrMat } from '../../../src/engine/imageData'
import { alignPaCoupon } from '../../../src/engine/pa/fiducialAligner'
import { renderPaOverlayMat } from '../../../src/engine/pa/paOverlayRenderer'
import { defaultPaTestSpec, paValueForLine } from '../../../src/engine/pa/types'
import type { PaLineScore, PaResult } from '../../../src/engine/pa/types'

describe('renderPaOverlayMat', () => {
  const spec = defaultPaTestSpec()

  const syntheticResult = (): PaResult => {
    const lines: PaLineScore[] = []
    for (let i = 0; i < spec.lineCount; i++) {
      lines.push({
        index: i,
        paValue: paValueForLine(spec, i),
        score: i === 2 ? Infinity : Math.abs(i - 5) * 0.01,
        medianWidthMm: i === 2 ? NaN : 0.45,
        measured: i !== 2,
      })
    }
    return {
      success: true,
      failureReason: null,
      lines,
      bestLineIndex: 5,
      bestPa: paValueForLine(spec, 5),
      flipped: false,
      rotationQuarterTurns: 0,
    }
  }

  it('renders line rectangles and fiducial outlines without altering the frame size', async () => {
    const cv = await getCv()
    const bgr = rgbaToBgrMat(cv, renderPaScan({ truePa: 0.02 }))
    let overlay = null
    try {
      const alignment = alignPaCoupon(cv, bgr, spec)
      expect(alignment.success).toBe(true)
      overlay = renderPaOverlayMat(cv, bgr, alignment, spec, syntheticResult())
      expect(overlay.cols).toBe(bgr.cols)
      expect(overlay.rows).toBe(bgr.rows)
      expect(overlay.channels()).toBe(3)
    } finally {
      overlay?.delete()
      bgr.delete()
    }
  }, 60000)
})
