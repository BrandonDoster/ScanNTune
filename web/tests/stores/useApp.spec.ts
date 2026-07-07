import { beforeEach, describe, expect, it } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useApp } from '../../src/stores/useApp'

describe('useApp', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('starts on the scan screen', () => {
    const app = useApp()
    expect(app.screen).toBe('scan')
  })

  it('switches between screens', () => {
    const app = useApp()
    app.goCalibration()
    expect(app.screen).toBe('calibration')
    app.goPa()
    expect(app.screen).toBe('pa')
    app.goScan()
    expect(app.screen).toBe('scan')
  })
})
