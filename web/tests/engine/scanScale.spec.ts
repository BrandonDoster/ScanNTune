import { describe, expect, it } from 'vitest'
import { diagnoseScale } from '../../src/engine/scanScale'

describe('diagnoseScale', () => {
  it('recognises a clean 2x factor', () => {
    const d = diagnoseScale(47.2, 23.6)
    expect(d.likelyMultiple).toBe(2)
    expect(d.factor).toBeCloseTo(2, 5)
  })
  it('recognises a clean 0.5x factor', () => {
    expect(diagnoseScale(11.8, 23.6).likelyMultiple).toBe(0.5)
  })
  it('accepts up to 10 percent off a clean multiple', () => {
    expect(diagnoseScale(23.6 * 2.09, 23.6).likelyMultiple).toBe(2)
    expect(diagnoseScale(23.6 * 2.25, 23.6).likelyMultiple).toBeNull()
  })
  it('leaves ordinary scanner error alone', () => {
    expect(diagnoseScale(23.6, 24.1).likelyMultiple).toBeNull()
  })
  it('yields a zero factor for a degenerate expected scale', () => {
    expect(diagnoseScale(23.6, 0)).toEqual({ factor: 0, likelyMultiple: null })
  })
})
