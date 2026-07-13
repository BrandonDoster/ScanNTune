import { beforeEach, describe, expect, it } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useSkewSettings, type SkewSettings } from '../../src/stores/useSkewSettings'
import { usePaSettings, type PaSettings } from '../../src/stores/usePaSettings'
import { useEmSettings, type EmSettings } from '../../src/stores/useEmSettings'
import { useIsSettings, type IsSettings } from '../../src/stores/useIsSettings'
import { usePrinterProfiles } from '../../src/stores/usePrinterProfiles'
import { defaultPrinterProfile } from '../../src/engine/pa/types'

const SKEW: SkewSettings = { dpi: 300, baselineMm: 100, gridN: 5 }
const PA: PaSettings = {
  paStart: 0.02,
  paEnd: 0.08,
  lineCount: 16,
  slowSpeedMmS: 25,
  fastSpeedMmS: 120,
}
const EM: EmSettings = {
  pitchMinMm: 0.7,
  pitchMaxMm: 1.1,
  blockCount: 13,
  linesPerBlock: 7,
  printSpeedMmS: 40,
  scanPlace: 'plate',
  partColors: 'base',
}
const IS: IsSettings = {
  lineSpeedMmS: 150,
  cornerSpeedMmS: 20,
  linesPerSpeed: 5,
  measuredLineMm: 30,
  linePitchMm: 2.5,
  scanPlace: 'part',
  partColors: 'single',
}

function addProfile(): string {
  const profiles = usePrinterProfiles()
  const id = profiles.upsert({ ...defaultPrinterProfile(), name: 'Printer' })
  profiles.select(id)
  return id
}

describe('per-flow settings stores', () => {
  beforeEach(() => {
    localStorage.clear()
    setActivePinia(createPinia())
  })

  it('skew settings are one flat object under scanntune.settings.skew', () => {
    useSkewSettings().save(SKEW)
    expect(JSON.parse(localStorage.getItem('scanntune.settings.skew')!)).toEqual(SKEW)
  })

  it('pressure advance settings are keyed by profile id under scanntune.settings.pa', () => {
    const id = addProfile()
    usePaSettings().save(PA)
    expect(JSON.parse(localStorage.getItem('scanntune.settings.pa')!)).toEqual({ [id]: PA })
  })

  it('flow settings are keyed by profile id under scanntune.settings.em', () => {
    const id = addProfile()
    useEmSettings().save(EM)
    expect(JSON.parse(localStorage.getItem('scanntune.settings.em')!)).toEqual({ [id]: EM })
  })

  it('input shaper settings are keyed by profile id under scanntune.settings.is', () => {
    const id = addProfile()
    useIsSettings().save(IS)
    expect(JSON.parse(localStorage.getItem('scanntune.settings.is')!)).toEqual({ [id]: IS })
  })

  it('rejects a stored scan placement outside the allowed set', () => {
    const id = addProfile()
    localStorage.setItem(
      'scanntune.settings.em',
      JSON.stringify({ [id]: { ...EM, scanPlace: 'sideways' } }),
    )
    expect(useEmSettings().settings).toBeNull()
  })

  it('reloads a valid stored entry for the selected profile', () => {
    const id = addProfile()
    useIsSettings().save(IS)
    setActivePinia(createPinia())
    usePrinterProfiles().select(id)
    expect(useIsSettings().settings).toEqual(IS)
  })
})
