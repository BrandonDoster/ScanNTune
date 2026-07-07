import { ORCA_PROCESS_FIELDS } from '../engine/pa/slicerImport'
import type { ImportSummary } from '../composables/useProfileForm'

/**
 * Headline sentence: "Imported N printer settings from <file>" (or "from N files" for a
 * multi-file upload, or "N filament settings" for the filament kind).
 */
export function importHeadline(summary: ImportSummary): string {
  const n = summary.importedCount
  const noun = n === 1 ? 'setting' : 'settings'
  const kindNoun = summary.kind === 'printer' ? 'printer' : 'filament'
  const source =
    summary.fileNames.length <= 1
      ? (summary.fileNames[0] ?? 'the imported file')
      : `${summary.fileNames.length} files`
  return `Imported ${n} ${kindNoun} ${noun} from ${source}`
}

/**
 * Warnings other than unresolved-inherits ones, since those are rendered structurally from
 * summary.unresolvedParents instead. A warning is dropped here only when it is the exact prose
 * warning already represented by one of those structured entries (matched by preset name), not by
 * a generic "mentions inherit" substring check: that would also swallow unrelated warnings such as
 * an "inherits cycle" warning, which has no structured representation and must still show.
 */
export function plainWarnings(summary: ImportSummary): string[] {
  const resolvedPresetNames = new Set(summary.unresolvedParents.map((p) => p.presetName))
  const singleFile = summary.fileNames.length <= 1
  const fileName = summary.fileNames[0]
  return summary.warnings
    .filter((w) => ![...resolvedPresetNames].some((name) => w.includes(`'${name}'`)))
    .map((w) => (singleFile && fileName !== undefined ? stripFilePrefix(w, fileName) : w))
}

/**
 * Splits the still-missing fields into the ones the unresolved base preset could still fill
 * ("in base preset") and the ones that must be set manually. Only an Orca machine import with an
 * unresolved parent gets the split: OrcaSlicer machine presets never carry the process-preset
 * fields, so pointing the user at the base preset for those would be wrong. Prusa imports (and
 * fully resolved chains) keep the single set-manually list.
 */
export function splitMissing(summary: ImportSummary): {
  inBasePreset: string[]
  setManually: string[]
} {
  const splitApplies =
    summary.kind === 'printer' && summary.orcaMachine && summary.unresolvedParents.length > 0
  if (!splitApplies) return { inBasePreset: [], setManually: summary.missing }
  const processFields = new Set<string>(ORCA_PROCESS_FIELDS)
  return {
    inBasePreset: summary.missing.filter((f) => !processFields.has(f)),
    setManually: summary.missing.filter((f) => processFields.has(f)),
  }
}

function stripFilePrefix(warning: string, fileName: string): string {
  const prefix = `${fileName}: `
  return warning.startsWith(prefix) ? warning.slice(prefix.length) : warning
}
