import { defineStore } from 'pinia'
import { ref, shallowRef } from 'vue'
import type { CouponSpec, MultiPlaneResult } from '../engine/types'

export type Screen = 'scan' | 'calibration' | 'results'

export interface ResultPayload {
  result: MultiPlaneResult
  coupon: CouponSpec
}

export const useApp = defineStore('app', () => {
  const screen = ref<Screen>('scan')
  // shallowRef: the payload holds a large result object we never deep-mutate. The annotated scan
  // overlays are NOT copied here; the Results page reuses them from the scans store, which owns them.
  const payload = shallowRef<ResultPayload | null>(null)

  function goScan(): void {
    screen.value = 'scan'
  }
  function goCalibration(): void {
    screen.value = 'calibration'
  }
  function showResults(p: ResultPayload): void {
    payload.value = p
    screen.value = 'results'
  }
  function clearResults(): void {
    payload.value = null
  }

  return { screen, payload, goScan, goCalibration, showResults, clearResults }
})
