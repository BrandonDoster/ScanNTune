import { describe, expect, it } from 'vitest'
import {
  importHeadline,
  missingHasUnresolvedParent,
  plainWarnings,
} from '../../src/components/importSummaryText'
import type { ImportSummary } from '../../src/composables/useProfileForm'

function baseSummary(overrides: Partial<ImportSummary> = {}): ImportSummary {
  return {
    kind: 'printer',
    importedCount: 2,
    filled: ['firmware', 'bedWidthMm'],
    missing: [],
    warnings: [],
    wrongKind: null,
    fileNames: ['config.ini'],
    unresolvedParents: [],
    resolvedFromCache: [],
    sources: [],
    orcaMachine: false,
    ...overrides,
  }
}

const unresolvedVoron = {
  presetName: 'Voron 2.4 300 0.4 nozzle',
  pathHint: 'OrcaSlicer\\resources\\profiles\\Voron\\machine\\',
  fileToFind: 'Voron 2.4 300 0.4 nozzle.json',
  fileName: 'a.json',
}

describe('importHeadline', () => {
  it('names the single source file', () => {
    expect(importHeadline(baseSummary({ fileNames: ['config.ini'] }))).toBe(
      'Imported 2 printer settings from config.ini',
    )
  })

  it('uses singular "setting" for a count of one', () => {
    expect(importHeadline(baseSummary({ importedCount: 1 }))).toContain('1 printer setting from')
  })

  it('says "N files" for a multi-file upload', () => {
    expect(importHeadline(baseSummary({ fileNames: ['a.ini', 'b.ini'] }))).toBe(
      'Imported 2 printer settings from 2 files',
    )
  })

  it('says "filament" for the filament kind', () => {
    expect(importHeadline(baseSummary({ kind: 'filament' }))).toContain('filament settings')
  })
})

describe('plainWarnings', () => {
  it('keeps an inherits-cycle warning: it has no structured representation', () => {
    const warning = '"a.json" has an "inherits" cycle; stopped resolving to avoid a hang.'
    const result = plainWarnings(baseSummary({ warnings: [warning], unresolvedParents: [] }))
    expect(result).toContain(warning)
  })

  it('drops only the prose warning matching a structured unresolvedParents entry', () => {
    const warning =
      "This preset inherits from 'Voron 2.4 300 0.4 nozzle' which was not uploaded. " +
      'Find it under the OrcaSlicer installation: resources\\profiles\\<vendor>\\machine\\'
    const result = plainWarnings(
      baseSummary({
        warnings: [warning],
        unresolvedParents: [
          {
            presetName: 'Voron 2.4 300 0.4 nozzle',
            pathHint: 'OrcaSlicer\\resources\\profiles\\Voron\\machine\\',
            fileToFind: 'Voron 2.4 300 0.4 nozzle.json',
            fileName: 'a.json',
          },
        ],
      }),
    )
    expect(result).toEqual([])
  })

  it('strips the "fileName: " prefix for a single-file import', () => {
    const result = plainWarnings(
      baseSummary({ fileNames: ['weird.ini'], warnings: ['weird.ini: something odd'] }),
    )
    expect(result).toEqual(['something odd'])
  })

  it('keeps the "fileName: " prefix for a multi-file import', () => {
    const result = plainWarnings(
      baseSummary({
        fileNames: ['a.ini', 'b.ini'],
        warnings: ['a.ini: something odd'],
      }),
    )
    expect(result).toEqual(['a.ini: something odd'])
  })
})

describe('missingHasUnresolvedParent', () => {
  const missing = ['bedWidthMm', 'printAccelMmS2']

  it('flags an Orca machine import with an unresolved parent as possibly in the base preset', () => {
    expect(
      missingHasUnresolvedParent(
        baseSummary({ missing, orcaMachine: true, unresolvedParents: [unresolvedVoron] }),
      ),
    ).toBe(true)
  })

  it('is not flagged for non-Orca imports', () => {
    expect(missingHasUnresolvedParent(baseSummary({ missing, orcaMachine: false }))).toBe(false)
  })

  it('is not flagged once the chain is fully resolved', () => {
    expect(
      missingHasUnresolvedParent(baseSummary({ missing, orcaMachine: true, unresolvedParents: [] })),
    ).toBe(false)
  })

  it('is not flagged for the filament kind', () => {
    expect(
      missingHasUnresolvedParent(
        baseSummary({
          kind: 'filament',
          missing: ['bedTempC'],
          orcaMachine: true,
          unresolvedParents: [unresolvedVoron],
        }),
      ),
    ).toBe(false)
  })
})
