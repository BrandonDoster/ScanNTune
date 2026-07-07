import { describe, expect, it } from 'vitest'
import { KNOWN_ORCA_VENDORS, matchOrcaVendor } from '../../../src/engine/pa/orcaVendors'

describe('matchOrcaVendor', () => {
  it('matches a known vendor at the start of a preset name', () => {
    expect(matchOrcaVendor('Voron 2.4 300 0.4 nozzle')).toBe('Voron')
  })

  it('prefers the longest known vendor when several are prefixes', () => {
    expect(matchOrcaVendor('Wanhao France X')).toBe('Wanhao France')
  })

  it('returns null for a filament-style generic name with no vendor folder', () => {
    expect(matchOrcaVendor('Generic PLA @System')).toBe(null)
  })

  it('does not match a non-vendor that merely shares a leading substring', () => {
    expect(matchOrcaVendor('Chubechanger')).toBe(null)
  })

  it('returns null for an empty name', () => {
    expect(matchOrcaVendor('')).toBe(null)
  })

  it('requires a word boundary, not a bare prefix', () => {
    expect(matchOrcaVendor('Voronia 300')).toBe(null)
  })

  it('matches a name that is exactly the vendor', () => {
    expect(matchOrcaVendor('Voron')).toBe('Voron')
  })

  it('lists every vendor as a non-empty string', () => {
    expect(KNOWN_ORCA_VENDORS.length).toBeGreaterThan(0)
    for (const v of KNOWN_ORCA_VENDORS) expect(v.length).toBeGreaterThan(0)
  })
})
