import { defineStore } from 'pinia'
import { ref } from 'vue'
import type { OrcaPresetKind } from '../engine/pa/slicerImport'
import { orcaPresetKind, orcaPresetName, tryParseOrcaPreset } from '../engine/pa/slicerImport'

const STORAGE_KEY = 'scanntune.slicerPresets'

const PRESET_KINDS: readonly OrcaPresetKind[] = ['filament', 'process', 'machine']

/** One cached base preset: the raw file content plus the metadata shown in the UI. */
export interface StoredSlicerPreset {
  name: string
  kind: OrcaPresetKind
  addedUtc: string
  content: string
}

interface StoredState {
  presets: StoredSlicerPreset[]
  installPath: string | null
}

function isStoredPreset(value: unknown): value is StoredSlicerPreset {
  if (typeof value !== 'object' || value === null) return false
  const record = value as Record<string, unknown>
  return (
    typeof record.name === 'string' &&
    record.name.trim() !== '' &&
    PRESET_KINDS.includes(record.kind as OrcaPresetKind) &&
    typeof record.addedUtc === 'string' &&
    typeof record.content === 'string'
  )
}

function loadFromStorage(): StoredState {
  const empty: StoredState = { presets: [], installPath: null }
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return empty
    const parsed: unknown = JSON.parse(raw)
    if (typeof parsed !== 'object' || parsed === null) {
      console.warn('Stored slicer presets had an unexpected shape; starting empty.')
      return empty
    }
    const record = parsed as Record<string, unknown>
    const presets = Array.isArray(record.presets) ? record.presets.filter(isStoredPreset) : []
    const installPath =
      typeof record.installPath === 'string' && record.installPath.trim() !== ''
        ? record.installPath
        : null
    return { presets, installPath }
  } catch (e) {
    console.warn('Could not read the stored slicer presets', e)
    return empty
  }
}

/**
 * Cache of OrcaSlicer base presets (raw preset JSON keyed by preset name), so a preset chain a
 * user resolved once keeps resolving on later imports without re-uploading the parent. Also holds
 * the optional OrcaSlicer install path used to build absolute path hints for missing parents.
 */
export const useSlicerPresets = defineStore('slicerPresets', () => {
  const initial = loadFromStorage()
  const presets = ref<StoredSlicerPreset[]>(initial.presets)
  const installPath = ref<string | null>(initial.installPath)

  function persist(): void {
    try {
      const state: StoredState = { presets: presets.value, installPath: installPath.value }
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
    } catch (e) {
      console.warn('Could not persist the slicer presets', e)
    }
  }

  /** Validates and caches one preset file's content, keyed (and de-duplicated) by preset name.
   *  Throws a user-worded error when the content is not a usable OrcaSlicer preset. */
  function add(content: string): StoredSlicerPreset {
    const preset = tryParseOrcaPreset(content)
    if (preset === null) {
      throw new Error(
        'This file does not look like an OrcaSlicer preset, so it cannot be saved as a base preset.',
      )
    }
    const name = orcaPresetName(preset)
    if (name === undefined) {
      throw new Error(
        'This OrcaSlicer preset has no "name" value, so it cannot be saved as a base preset.',
      )
    }
    const entry: StoredSlicerPreset = {
      name,
      kind: orcaPresetKind(preset),
      addedUtc: new Date().toISOString(),
      content,
    }
    presets.value = [...presets.value.filter((p) => p.name !== name), entry]
    persist()
    return entry
  }

  function remove(name: string): void {
    presets.value = presets.value.filter((p) => p.name !== name)
    persist()
  }

  function clear(): void {
    presets.value = []
    persist()
  }

  /** Sets the OrcaSlicer install path used for absolute parent-path hints; blank clears it. */
  function setInstallPath(path: string | null): void {
    const trimmed = path?.trim() ?? ''
    installPath.value = trimmed === '' ? null : trimmed
    persist()
  }

  return { presets, installPath, add, remove, clear, setInstallPath }
})
