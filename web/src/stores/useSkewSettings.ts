import { createFlowSettingsStore, type FieldKinds } from './createFlowSettingsStore'

/** User-adjustable settings of the skew/shrinkage flow; defaults live in ScanPage. */
export type SkewSettings = {
  dpi: number | null
  baselineMm: number | null
  gridN: number | null
}

const FIELDS: FieldKinds<SkewSettings> = {
  dpi: { kind: 'nullableNumber' },
  baselineMm: { kind: 'nullableNumber' },
  gridN: { kind: 'nullableNumber' },
}

export const useSkewSettings = createFlowSettingsStore<SkewSettings>({
  storeId: 'skewSettings',
  storageKey: 'scanntune.settings.skew',
  shape: 'flat',
  fields: FIELDS,
})
