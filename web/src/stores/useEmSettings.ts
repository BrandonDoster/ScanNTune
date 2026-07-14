import { createFlowSettingsStore, type FieldKinds } from './createFlowSettingsStore'
import { PART_COLORS, SCAN_PLACES, type PartColors, type ScanPlace } from '../model/scanPlan'

/** User-adjustable settings of the flow calibration; defaults come from `defaultEmTestSpec`. */
export type EmSettings = {
  pitchMinMm: number | null
  pitchMaxMm: number | null
  blockCount: number | null
  linesPerBlock: number | null
  printSpeedMmS: number | null
  scanPlace: ScanPlace
  partColors: PartColors
}

const FIELDS: FieldKinds<EmSettings> = {
  pitchMinMm: { kind: 'nullableNumber' },
  pitchMaxMm: { kind: 'nullableNumber' },
  blockCount: { kind: 'nullableNumber' },
  linesPerBlock: { kind: 'nullableNumber' },
  printSpeedMmS: { kind: 'nullableNumber' },
  scanPlace: { kind: 'enum', values: SCAN_PLACES },
  partColors: { kind: 'enum', values: PART_COLORS },
}

export const useEmSettings = createFlowSettingsStore<EmSettings>({
  storeId: 'emSettings',
  storageKey: 'scanntune.settings.em',
  shape: 'perProfile',
  fields: FIELDS,
})
