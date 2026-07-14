import { defineStore } from 'pinia'
import { ref, shallowRef, watch } from 'vue'
import type { CouponSpec, MultiPlaneResult } from '../engine/types'

export type Screen = 'skew' | 'calibration' | 'pa' | 'profile' | 'em' | 'is'

export interface ResultPayload {
  result: MultiPlaneResult
  coupon: CouponSpec
}

export interface ProfilePayload {
  /** Id of the profile to edit, or null to create a new one. */
  profileId: string | null
}

const SCREEN_STORAGE_KEY = 'scanntune.activeScreen'
// Only top-level tabs are restored on reload; stacked screens (profile editor, scanner
// calibration wizard) always reopen on the tab beneath them.
const persistableScreens = ['skew', 'pa', 'em', 'is'] as const
type PersistableScreen = (typeof persistableScreens)[number]

function isPersistableScreen(value: string | null): value is PersistableScreen {
  return (persistableScreens as readonly string[]).includes(value ?? '')
}

function loadInitialScreen(): Screen {
  try {
    const stored = localStorage.getItem(SCREEN_STORAGE_KEY)
    if (isPersistableScreen(stored)) return stored
  } catch (e) {
    console.warn('Failed to read the active screen from localStorage', e)
  }
  return 'skew'
}

function persistScreen(value: Screen): void {
  if (!isPersistableScreen(value)) return
  try {
    localStorage.setItem(SCREEN_STORAGE_KEY, value)
  } catch (e) {
    console.warn('Failed to persist the active screen to localStorage', e)
  }
}

export const useApp = defineStore('app', () => {
  const screen = ref<Screen>(loadInitialScreen())
  // shallowRef: the payload holds a large result object we never deep-mutate. The scan calibration
  // page reuses each scan's annotated overlay straight from the scans store, which owns them.
  const payload = shallowRef<ResultPayload | null>(null)
  const profilePayload = ref<ProfilePayload | null>(null)
  // The screen the profile editor was opened from, so closing it returns there (the shared
  // profile card lives on both the PA and the flow page).
  const profileReturnScreen = ref<Screen>('pa')

  watch(screen, persistScreen)

  function goSkew(): void {
    screen.value = 'skew'
  }
  function goCalibration(): void {
    screen.value = 'calibration'
  }
  function goPa(): void {
    screen.value = 'pa'
  }
  function goEm(): void {
    screen.value = 'em'
  }
  function goIs(): void {
    screen.value = 'is'
  }
  function goProfile(p: ProfilePayload): void {
    profilePayload.value = p
    profileReturnScreen.value = screen.value === 'profile' ? profileReturnScreen.value : screen.value
    screen.value = 'profile'
  }
  function closeProfile(): void {
    screen.value = profileReturnScreen.value
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
    goSkew,
    goCalibration,
    goPa,
    goEm,
    goIs,
    goProfile,
    closeProfile,
    setResults,
    clearResults,
  }
})
