import { beforeEach, describe, expect, it } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useCalibration } from '../../src/stores/useCalibration'
import type { ScannerCalibration } from '../../src/engine/types'

const SAMPLE: ScannerCalibration = {
  pxPerMm: 23.6,
  dpi: 600,
  referenceMm: 85.6,
  measuredWidthPx: 2020.16,
  straightnessPx: 0.1,
  parallelismDegrees: 0.02,
  calibratedUtc: '2026-01-01T00:00:00.000Z',
}

describe('useCalibration', () => {
  beforeEach(() => {
    localStorage.clear()
    setActivePinia(createPinia())
  })

  it('persists a saved calibration to localStorage', () => {
    const store = useCalibration()
    store.save(SAMPLE)
    expect(store.calibration).toEqual(SAMPLE)
    expect(localStorage.getItem('scanntune.calibration')).not.toBeNull()
  })

  it('clear removes the stored calibration and the localStorage entry', () => {
    const store = useCalibration()
    store.save(SAMPLE)
    store.clear()
    expect(store.calibration).toBeNull()
    expect(localStorage.getItem('scanntune.calibration')).toBeNull()
  })
})
