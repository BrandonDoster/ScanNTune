import { describe, expect, it } from 'vitest'
import { paCorrection } from '../../../src/engine/pa/paCorrectionFormatter'

describe('paCorrection', () => {
  it('formats Klipper', () => {
    const c = paCorrection('Klipper', 0.0314)
    expect(c.code).toBe('SET_PRESSURE_ADVANCE ADVANCE=0.0314')
    expect(c.secondaryCode).toBe('pressure_advance: 0.0314')
    expect(c.secondaryCaption).toBe('printer.cfg')
  })
  it('formats Marlin with M500 hint', () => {
    const c = paCorrection('Marlin', 0.0314)
    expect(c.code).toContain('M900 K0.0314')
    expect(c.hint).toContain('M500')
  })
  it('formats RepRap', () => {
    const c = paCorrection('RepRapFirmware', 0.0314)
    expect(c.code).toContain('M572 D0 S0.0314')
  })
})
