import { defineStore } from 'pinia'
import { ref, shallowRef } from 'vue'
import type { CouponSpec, TwoScanResult } from '../engine/types'

export type Screen = 'scan' | 'calibration' | 'results'

export interface ResultPayload {
  result: TwoScanResult
  overlayA: ImageBitmap | null
  overlayB: ImageBitmap | null
  coupon: CouponSpec
}

export const useApp = defineStore('app', () => {
  const screen = ref<Screen>('scan')
  // shallowRef: the payload holds ImageBitmaps and a large result object we never deep-mutate.
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

  return { screen, payload, goScan, goCalibration, showResults }
})
