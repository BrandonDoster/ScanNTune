// @vitest-environment node
import { describe, expect, it } from 'vitest'
import {
  MIN_ALIGN_PX_PER_MM,
  MIN_MEASUREMENT_PX_PER_MM,
  insufficientResolutionReason,
} from '../../src/engine/resolutionGate'

describe('resolutionGate', () => {
  it('keeps the degenerate-alignment floor below the measurement floor', () => {
    expect(MIN_ALIGN_PX_PER_MM).toBe(1)
    expect(MIN_MEASUREMENT_PX_PER_MM).toBe(5.5)
    expect(MIN_ALIGN_PX_PER_MM).toBeLessThan(MIN_MEASUREMENT_PX_PER_MM)
  })

  it('accepts a 150 dpi scan', () => {
    expect(insufficientResolutionReason(150 / 25.4)).toBeNull()
  })

  it('accepts a 600 dpi scan', () => {
    expect(insufficientResolutionReason(600 / 25.4)).toBeNull()
  })

  it('accepts exactly the measurement floor', () => {
    expect(insufficientResolutionReason(MIN_MEASUREMENT_PX_PER_MM)).toBeNull()
  })

  it('refuses a 100 dpi scan with the measured resolution in the reason', () => {
    const reason = insufficientResolutionReason(100 / 25.4)
    expect(reason).toContain('100 dpi')
    expect(reason).toContain('150 dpi')
  })

  it('returns null for a degenerate scale, which is the aligner failure instead', () => {
    expect(insufficientResolutionReason(0)).toBeNull()
    expect(insufficientResolutionReason(-3)).toBeNull()
    expect(insufficientResolutionReason(NaN)).toBeNull()
  })
})
