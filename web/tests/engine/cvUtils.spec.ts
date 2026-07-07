// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { getCv } from '../helpers/cv'
import { analyzeThresholdBands } from '../../src/engine/cvUtils'

describe('analyzeThresholdBands early exit', () => {
  // A three-population gray image so several distinct threshold bands exist.
  async function threeToneImage() {
    const cv = await getCv()
    const image = new cv.Mat(60, 60, cv.CV_8UC1, new cv.Scalar(30))
    cv.rectangle(image, new cv.Point(0, 20), new cv.Point(60, 40), new cv.Scalar(128), -1)
    cv.rectangle(image, new cv.Point(0, 40), new cv.Point(60, 60), new cv.Scalar(230), -1)
    return { cv, image }
  }

  it('stops evaluating bands once isDone returns true', async () => {
    const { cv, image } = await threeToneImage()
    try {
      let calls = 0
      const results = analyzeThresholdBands(
        cv,
        image,
        () => ++calls,
        (n) => n === 2,
      )
      expect(calls).toBe(2)
      expect(results).toEqual([1, 2])
    } finally {
      image.delete()
    }
  })

  it('evaluates every band when isDone is omitted', async () => {
    const { cv, image } = await threeToneImage()
    try {
      let calls = 0
      const results = analyzeThresholdBands(cv, image, () => ++calls)
      expect(calls).toBeGreaterThan(2)
      expect(results).toHaveLength(calls)
    } finally {
      image.delete()
    }
  })
})
