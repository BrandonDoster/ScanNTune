import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useSlicerPresets } from '../../src/stores/useSlicerPresets'

const voronParent = JSON.stringify({
  type: 'machine',
  name: 'Voron 2.4 300 0.4 nozzle',
  from: 'system',
  printable_area: ['0x0', '300x0', '300x300', '0x300'],
  gcode_flavor: 'klipper',
})

describe('useSlicerPresets', () => {
  beforeEach(() => {
    localStorage.clear()
    setActivePinia(createPinia())
  })

  it('adds a valid Orca preset keyed by its name, with kind and timestamp', () => {
    const store = useSlicerPresets()
    const entry = store.add(voronParent)
    expect(entry.name).toBe('Voron 2.4 300 0.4 nozzle')
    expect(entry.kind).toBe('machine')
    expect(entry.addedUtc).not.toBe('')
    expect(store.presets).toHaveLength(1)
  })

  it('replaces an existing preset of the same name instead of duplicating it', () => {
    const store = useSlicerPresets()
    store.add(voronParent)
    store.add(voronParent)
    expect(store.presets).toHaveLength(1)
  })

  it('throws a user-worded error for non-preset content', () => {
    const store = useSlicerPresets()
    expect(() => store.add('not json at all')).toThrow(/does not look like an OrcaSlicer preset/)
    expect(() => store.add('{"foo": 1}')).toThrow(/does not look like an OrcaSlicer preset/)
    expect(store.presets).toHaveLength(0)
  })

  it('throws when the preset has no name', () => {
    const store = useSlicerPresets()
    expect(() => store.add(JSON.stringify({ type: 'machine' }))).toThrow(/no "name"/)
  })

  it('removes and clears', () => {
    const store = useSlicerPresets()
    store.add(voronParent)
    store.remove('Voron 2.4 300 0.4 nozzle')
    expect(store.presets).toHaveLength(0)
    store.add(voronParent)
    store.clear()
    expect(store.presets).toHaveLength(0)
  })

  it('persists presets and the install path across pinia instances', () => {
    const a = useSlicerPresets()
    a.add(voronParent)
    a.setInstallPath('C:\\Program Files\\OrcaSlicer')
    setActivePinia(createPinia())
    const b = useSlicerPresets()
    expect(b.presets).toHaveLength(1)
    expect(b.presets[0].name).toBe('Voron 2.4 300 0.4 nozzle')
    expect(b.installPath).toBe('C:\\Program Files\\OrcaSlicer')
  })

  it('setInstallPath treats blank as clearing the path', () => {
    const store = useSlicerPresets()
    store.setInstallPath('C:\\OrcaSlicer')
    store.setInstallPath('   ')
    expect(store.installPath).toBeNull()
  })

  it('starts empty on corrupt storage and warns instead of throwing', () => {
    localStorage.setItem('scanntune.slicerPresets', '{corrupt')
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const store = useSlicerPresets()
    expect(store.presets).toHaveLength(0)
    // A fresh (or unreadable) state seeds the install path to the platform default so base-preset
    // path hints are absolute out of the box.
    expect(store.installPath).not.toBeNull()
    expect(warn).toHaveBeenCalled()
    warn.mockRestore()
  })

  it('drops malformed entries from stored state but keeps valid ones', () => {
    localStorage.setItem(
      'scanntune.slicerPresets',
      JSON.stringify({
        presets: [
          { name: 'Good', kind: 'machine', addedUtc: '2026-01-01T00:00:00Z', content: '{}' },
          { name: '', kind: 'machine', addedUtc: 'x', content: '{}' },
          { name: 'BadKind', kind: 'weird', addedUtc: 'x', content: '{}' },
        ],
        installPath: 42,
      }),
    )
    const store = useSlicerPresets()
    expect(store.presets.map((p) => p.name)).toEqual(['Good'])
    // An invalid stored install path falls back to the seeded platform default, not null.
    expect(store.installPath).not.toBeNull()
  })

  it('seeds slicer, os, and the default install path on a fresh store and persists them', () => {
    const a = useSlicerPresets()
    expect(a.slicer).toBe('OrcaSlicer')
    expect(['Windows', 'macOS', 'Linux']).toContain(a.os)
    expect(a.installPath).not.toBeNull()
    a.setSlicer('PrusaSlicer')
    a.setOs('Linux')
    setActivePinia(createPinia())
    const b = useSlicerPresets()
    expect(b.slicer).toBe('PrusaSlicer')
    expect(b.os).toBe('Linux')
  })
})
