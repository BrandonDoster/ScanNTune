// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { getCv, syntheticCard, blankGray } from '../helpers/cv'
import { measureCard } from '../../src/engine/cardEdgeMeasurer'
import type { Mat, OpenCv } from '../../src/engine/opencv'

// Mirrors ScanNTune.Tests/CardEdgeMeasurerTests.cs (synthetic cards; no fixture needed).
const LongMm = 85.6
const Dpi = 254.0 // -> exactly 10 px/mm nominal

function assertRecovers(cv: OpenCv, img: Mat) {
  try {
    const r = measureCard(cv, img, LongMm, Dpi)
    expect(r.success).toBe(true)
    expect(Math.abs(r.pxPerMm - 10.0)).toBeLessThanOrEqual(0.05)
    expect(Math.abs(r.detectedMm - LongMm)).toBeLessThanOrEqual(0.5)
    expect(r.straightnessPx).toBeLessThan(0.5)
    expect(r.parallelismDegrees).toBeLessThan(0.2)
  } finally {
    img.delete()
  }
}

describe('card edge measurer', () => {
  it('dark card on white recovers px/mm', async () => {
    const cv = await getCv()
    assertRecovers(cv, syntheticCard(cv, 255, 60, false, 0))
  }, 60000)

  it('pale card on dark backing recovers px/mm', async () => {
    const cv = await getCv()
    assertRecovers(cv, syntheticCard(cv, 40, 235, false, 0))
  }, 60000)

  it('portrait card recovers px/mm', async () => {
    const cv = await getCv()
    assertRecovers(cv, syntheticCard(cv, 255, 60, true, 0))
  }, 60000)

  it('slightly rotated card recovers px/mm', async () => {
    const cv = await getCv()
    const img = syntheticCard(cv, 255, 60, false, 3.0)
    try {
      const r = measureCard(cv, img, LongMm, Dpi)
      expect(r.success).toBe(true)
      expect(Math.abs(r.pxPerMm - 10.0)).toBeLessThanOrEqual(0.05)
      expect(r.parallelismDegrees).toBeLessThan(0.2)
    } finally {
      img.delete()
    }
  }, 60000)

  it('a blank scan fails gracefully', async () => {
    const cv = await getCv()
    const img = blankGray(cv, 400, 255)
    try {
      const r = measureCard(cv, img, LongMm, Dpi)
      expect(r.success).toBe(false)
      expect(r.message).toBeTruthy()
    } finally {
      img.delete()
    }
  }, 60000)
})
