import { defineStore } from 'pinia'
import { ref } from 'vue'
import type { ScannerCalibration } from '../engine/types'
import { isUsableCalibration } from '../engine/scannerCalibration'

const STORAGE_KEY = 'scanntune.calibration'

const NUMERIC_FIELDS = [
  'pxPerMm',
  'dpi',
  'referenceMm',
  'measuredWidthPx',
  'straightnessPx',
  'parallelismDegrees',
] as const

function hasFiniteNumbers(value: unknown): value is ScannerCalibration {
  if (typeof value !== 'object' || value === null) return false
  const record = value as Record<string, unknown>
  return NUMERIC_FIELDS.every((k) => typeof record[k] === 'number' && Number.isFinite(record[k]))
}

function loadFromStorage(): ScannerCalibration | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const parsed: unknown = JSON.parse(raw)
    // A partial or hand-edited value (missing/NaN/string fields) would coerce to NaN downstream and
    // silently apply no correction, so require finite numbers, then the usability check.
    if (!hasFiniteNumbers(parsed) || !isUsableCalibration(parsed)) return null
    return parsed
  } catch (e) {
    console.warn('Could not read the stored calibration', e)
    return null
  }
}

export const useCalibration = defineStore('calibration', () => {
  const calibration = ref<ScannerCalibration | null>(loadFromStorage())

  function save(cal: ScannerCalibration): void {
    calibration.value = cal
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(cal))
    } catch (e) {
      console.warn('Could not persist the calibration', e)
    }
  }

  function clear(): void {
    calibration.value = null
    try {
      localStorage.removeItem(STORAGE_KEY)
    } catch (e) {
      console.warn('Could not clear the calibration', e)
    }
  }

  return { calibration, save, clear }
})
