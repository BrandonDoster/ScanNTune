import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import type { PrinterProfile } from '../engine/pa/types'

const STORAGE_KEY = 'scanntune.printerProfiles'

const NUMERIC_FIELDS = [
  'bedWidthMm',
  'bedDepthMm',
  'nozzleDiameterMm',
  'filamentDiameterMm',
  'nozzleTempC',
  'bedTempC',
  'travelSpeedMmS',
  'layerHeightMm',
  'retractMm',
  'retractSpeedMmS',
] as const

const STRING_FIELDS = ['id', 'name', 'firmware', 'startGcode', 'pauseGcode', 'endGcode'] as const

function isValidProfile(value: unknown): value is PrinterProfile {
  if (typeof value !== 'object' || value === null) return false
  const record = value as Record<string, unknown>
  const numbersOk = NUMERIC_FIELDS.every(
    (k) => typeof record[k] === 'number' && Number.isFinite(record[k]),
  )
  const stringsOk = STRING_FIELDS.every((k) => typeof record[k] === 'string')
  return numbersOk && stringsOk
}

interface StoredState {
  profiles: PrinterProfile[]
  selectedId: string | null
}

function loadFromStorage(): StoredState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return { profiles: [], selectedId: null }
    const parsed: unknown = JSON.parse(raw)
    if (typeof parsed !== 'object' || parsed === null) return { profiles: [], selectedId: null }
    const record = parsed as Record<string, unknown>
    const rawProfiles = Array.isArray(record.profiles) ? record.profiles : []
    const profiles = rawProfiles.filter((p): p is PrinterProfile => {
      if (isValidProfile(p)) return true
      console.warn('Dropping invalid stored printer profile', p)
      return false
    })
    const selectedId = typeof record.selectedId === 'string' ? record.selectedId : null
    return { profiles, selectedId }
  } catch (e) {
    console.warn('Could not read the stored printer profiles', e)
    return { profiles: [], selectedId: null }
  }
}

export const usePrinterProfiles = defineStore('printerProfiles', () => {
  const initial = loadFromStorage()
  const profiles = ref<PrinterProfile[]>(initial.profiles)
  const selectedId = ref<string | null>(initial.selectedId)

  const selected = computed<PrinterProfile | null>(
    () => profiles.value.find((p) => p.id === selectedId.value) ?? null,
  )

  function persist(): void {
    try {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({ profiles: profiles.value, selectedId: selectedId.value }),
      )
    } catch (e) {
      console.warn('Could not persist the printer profiles', e)
    }
  }

  function upsert(profile: PrinterProfile): void {
    const id = profile.id === '' ? crypto.randomUUID() : profile.id
    const withId = { ...profile, id }
    const index = profiles.value.findIndex((p) => p.id === id)
    if (index === -1) {
      profiles.value = [...profiles.value, withId]
    } else {
      profiles.value = profiles.value.map((p, i) => (i === index ? withId : p))
    }
    persist()
  }

  function remove(id: string): void {
    profiles.value = profiles.value.filter((p) => p.id !== id)
    if (selectedId.value === id) {
      selectedId.value = null
    }
    persist()
  }

  function select(id: string): void {
    selectedId.value = id
    persist()
  }

  return { profiles, selectedId, selected, upsert, remove, select }
})
