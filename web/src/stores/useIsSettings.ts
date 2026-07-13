import { createFlowSettingsStore, type FieldKinds } from './createFlowSettingsStore'
import { PART_COLORS, SCAN_PLACES, type PartColors, type ScanPlace } from '../model/scanPlan'

/** User-adjustable settings of the input shaper flow; defaults come from `defaultIsTestSpec`. */
export type IsSettings = {
  lineSpeedMmS: number | null
  cornerSpeedMmS: number | null
  linesPerSpeed: number | null
  measuredLineMm: number | null
  linePitchMm: number | null
  scanPlace: ScanPlace
  partColors: PartColors
}

const FIELDS: FieldKinds<IsSettings> = {
  lineSpeedMmS: { kind: 'nullableNumber' },
  cornerSpeedMmS: { kind: 'nullableNumber' },
  linesPerSpeed: { kind: 'nullableNumber' },
  measuredLineMm: { kind: 'nullableNumber' },
  linePitchMm: { kind: 'nullableNumber' },
  scanPlace: { kind: 'enum', values: SCAN_PLACES },
  partColors: { kind: 'enum', values: PART_COLORS },
}

export const useIsSettings = createFlowSettingsStore<IsSettings>({
  storeId: 'isSettings',
  storageKey: 'scanntune.settings.is',
  shape: 'perProfile',
  fields: FIELDS,
})
