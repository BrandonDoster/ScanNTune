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
    store.upsert({ ...defaultPrinterProfile(), name: 'Voron' })
    expect(store.profiles).toHaveLength(1)
    expect(store.profiles[0].id).not.toBe('')
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
    store.upsert({ ...store.profiles[0], name: 'B' })
    expect(store.profiles).toHaveLength(1)
    expect(store.profiles[0].name).toBe('B')
    store.remove(id)
    expect(store.profiles).toHaveLength(0)
    expect(store.selectedId).toBeNull()
  })

  it('drops corrupt storage without throwing', () => {
    localStorage.setItem('scanntune.printerProfiles', '{nope')
    const store = usePrinterProfiles()
    expect(store.profiles).toHaveLength(0)
  })
})
