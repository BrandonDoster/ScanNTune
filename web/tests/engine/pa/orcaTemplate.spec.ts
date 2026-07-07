import { describe, expect, it } from 'vitest'
import { evaluateCondition, evaluateTemplate } from '../../../src/engine/pa/orcaTemplate'

const resolve = (name: string): string | null => {
  if (name === 'first_layer_temperature' || name === 'temperature') return '210'
  if (name === 'first_layer_bed_temperature') return '60'
  return null
}

describe('evaluateCondition', () => {
  it('treats the single tool as extruder 0', () => {
    expect(evaluateCondition('is_extruder_used[0]')).toBe(true)
    expect(evaluateCondition('is_extruder_used[1]')).toBe(false)
    expect(evaluateCondition('is_extruder_used[initial_tool]')).toBe(true)
  })

  it('evaluates comparisons and boolean logic', () => {
    expect(evaluateCondition('initial_tool == 0')).toBe(true)
    expect(evaluateCondition('current_extruder != 0')).toBe(false)
    expect(evaluateCondition('is_extruder_used[0] and not is_extruder_used[1]')).toBe(true)
    expect(evaluateCondition('(is_extruder_used[1] or is_extruder_used[0])')).toBe(true)
    expect(evaluateCondition('1 < 2')).toBe(true)
  })

  it('returns null for anything outside the grammar', () => {
    expect(evaluateCondition('some_unknown_flag > 3')).toBeNull()
    expect(evaluateCondition('is_extruder_used')).toBeNull()
    expect(evaluateCondition('1 +')).toBeNull()
    expect(evaluateCondition('is_extruder_used[foo]')).toBeNull()
  })
})

describe('evaluateTemplate', () => {
  it('resolves indexed settings regardless of index', () => {
    const r = evaluateTemplate('{first_layer_temperature[initial_tool]}/[temperature[3]]', resolve)
    expect(r.text).toBe('210/210')
    expect(r.unknown).toEqual([])
  })

  it('drops false branches and keeps true ones', () => {
    const r = evaluateTemplate('{if is_extruder_used[1]}A{else}B{endif}', resolve)
    expect(r.text).toBe('B')
  })
})
