import { defineStore } from 'pinia'
import { ref, shallowRef } from 'vue'
import type { CouponSpec, MultiPlaneResult } from '../engine/types'

export type Screen = 'scan' | 'calibration' | 'pa' | 'profile'

export interface ResultPayload {
  result: MultiPlaneResult
  coupon: CouponSpec
}

export interface ProfilePayload {
  /** Id of the profile to edit, or null to create a new one. */
  profileId: string | null
}

export const useApp = defineStore('app', () => {
  const screen = ref<Screen>('scan')
  // shallowRef: the payload holds a large result object we never deep-mutate. The scan calibration
  // page reuses each scan's annotated overlay straight from the scans store, which owns them.
  const payload = shallowRef<ResultPayload | null>(null)
  const profilePayload = ref<ProfilePayload | null>(null)

  function goScan(): void {
    screen.value = 'scan'
  }
  function goCalibration(): void {
    screen.value = 'calibration'
  }
  function goPa(): void {
    screen.value = 'pa'
  }
  function goProfile(p: ProfilePayload): void {
    profilePayload.value = p
    screen.value = 'profile'
  }
  function setResults(p: ResultPayload): void {
    payload.value = p
  }
  function clearResults(): void {
    payload.value = null
  }

  return {
    screen,
    payload,
    profilePayload,
    goScan,
    goCalibration,
    goPa,
    goProfile,
    setResults,
    clearResults,
  }
})
