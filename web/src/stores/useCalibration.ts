import { defineStore } from 'pinia'
import { ref } from 'vue'
import type { ScannerCalibration } from '../engine/types'
import { isUsableCalibration } from '../engine/scannerCalibration'

const STORAGE_KEY = 'scanntune.calibration'

function loadFromStorage(): ScannerCalibration | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const cal = JSON.parse(raw) as ScannerCalibration
    // A degenerate (partial or hand-edited) value would silently apply no correction, so drop it.
    return isUsableCalibration(cal) ? cal : null
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
