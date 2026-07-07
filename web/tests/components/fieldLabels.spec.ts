import { describe, expect, it } from 'vitest'
import { FIELD_KINDS } from '../../src/engine/pa/slicerImport'
import { FIELD_LABELS } from '../../src/components/fieldLabels'

describe('FIELD_LABELS', () => {
  it('has a label for every FIELD_KINDS entry', () => {
    for (const key of Object.keys(FIELD_KINDS)) {
      expect(FIELD_LABELS).toHaveProperty(key)
      expect(typeof FIELD_LABELS[key as keyof typeof FIELD_LABELS]).toBe('string')
      expect(FIELD_LABELS[key as keyof typeof FIELD_LABELS].length).toBeGreaterThan(0)
    }
  })
})
