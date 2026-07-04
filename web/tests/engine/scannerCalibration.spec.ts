import { describe, it, expect } from 'vitest'
import {
  correctionFactor,
  effectiveDpi,
  pxPerMmAtDpi,
} from '../../src/engine/scannerCalibration'
import type { ScannerCalibration } from '../../src/engine/types'

// Mirrors the PxPerMmAtDpi_AppliesScannerErrorAtAnyDpi case in ScanNTune.Tests/CalibrationStoreTests.cs.
describe('scanner calibration', () => {
  it('applies the scanner error at any DPI', () => {
    const cal: ScannerCalibration = {
      pxPerMm: 23.5969,
      dpi: 600,
      referenceMm: 85.5,
      measuredWidthPx: 2017.5,
      straightnessPx: 0.3,
      parallelismDegrees: 0.002,
      calibratedUtc: '2026-07-02T12:00:00.000Z',
    }
    const factor = 23.5969 / (600.0 / 25.4)

    expect(Math.abs(correctionFactor(cal) - factor)).toBeLessThanOrEqual(1e-12)
    expect(Math.abs(pxPerMmAtDpi(cal, 600) - 23.5969)).toBeLessThanOrEqual(1e-9)
    expect(Math.abs(pxPerMmAtDpi(cal, 1200) - (1200.0 / 25.4) * factor)).toBeLessThanOrEqual(1e-9)
    expect(Math.abs(effectiveDpi(cal) - 23.5969 * 25.4)).toBeLessThanOrEqual(1e-9)
  })
})
