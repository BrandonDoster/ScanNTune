import { beforeEach, describe, expect, it } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { usePrinterProfiles } from '../../src/stores/usePrinterProfiles'
import { defaultPrinterProfile } from '../../src/engine/pa/types'

describe('usePrinterProfiles', () => {
  beforeEach(() => {
    localStorage.clear()
    setActivePinia(createPinia())
  })

  it('starts empty and upserts with a generated id', () => {
    const store = usePrinterProfiles()
    expect(store.profiles).toHaveLength(0)
    const id = store.upsert({ ...defaultPrinterProfile(), name: 'Voron' })
    expect(store.profiles).toHaveLength(1)
    expect(store.profiles[0].id).not.toBe('')
    expect(id).toBe(store.profiles[0].id)
  })

  it('persists and reloads across store instances', () => {
    const a = usePrinterProfiles()
    a.upsert({ ...defaultPrinterProfile(), name: 'Ender' })
    a.select(a.profiles[0].id)
    setActivePinia(createPinia())
    const b = usePrinterProfiles()
    expect(b.profiles).toHaveLength(1)
    expect(b.profiles[0].name).toBe('Ender')
    expect(b.selected?.name).toBe('Ender')
  })

  it('updates an existing profile by id and removes', () => {
    const store = usePrinterProfiles()
    store.upsert({ ...defaultPrinterProfile(), name: 'A' })
    const id = store.profiles[0].id
    const updatedId = store.upsert({ ...store.profiles[0], name: 'B' })
    expect(store.profiles).toHaveLength(1)
    expect(store.profiles[0].name).toBe('B')
    expect(updatedId).toBe(id)
    expect(updatedId).toBe(store.profiles[0].id)
    store.remove(id)
    expect(store.profiles).toHaveLength(0)
    expect(store.selectedId).toBeNull()
  })

  it('keeps a legacy profile missing filamentType and chamberTempC, filling defaults', () => {
    const legacy: Record<string, unknown> = { ...defaultPrinterProfile(), id: 'legacy-1' }
    delete legacy.filamentType
    delete legacy.chamberTempC
    localStorage.setItem(
      'scanntune.printerProfiles',
      JSON.stringify({ profiles: [legacy], selectedId: 'legacy-1' }),
    )
    const store = usePrinterProfiles()
    expect(store.profiles).toHaveLength(1)
    expect(store.profiles[0].filamentType).toBe('PLA')
    expect(store.profiles[0].chamberTempC).toBe(0)
    expect(store.selected?.id).toBe('legacy-1')
  })

  it('drops corrupt storage without throwing', () => {
    localStorage.setItem('scanntune.printerProfiles', '{nope')
    const store = usePrinterProfiles()
    expect(store.profiles).toHaveLength(0)
  })
})
