import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { beforeEach, describe, expect, it } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useProfileForm } from '../../src/composables/useProfileForm'
import { useSlicerPresets } from '../../src/stores/useSlicerPresets'

const chubechanger = readFileSync(
  join(__dirname, '../fixtures/slicer/orca_machine_chubechanger.json'),
  'utf8',
)

// Minimal synthetic parent, mirroring the chain-resolution engine tests: the real one lives in
// the OrcaSlicer install, not in the repo.
const voron24Parent = JSON.stringify({
  type: 'machine',
  name: 'Voron 2.4 300 0.4 nozzle',
  from: 'system',
  version: '2.3.1.10',
  printable_area: ['0x0', '300x0', '300x300', '0x300'],
  gcode_flavor: 'klipper',
  nozzle_diameter: ['0.4'],
  retraction_length: ['0.6'],
  retraction_speed: ['40'],
})

/** A minimal PrusaSlicer bundle with two named filament sections that share field names, so the
 *  bundle-filament import path (addBundleFilaments) fills the same field twice across sections. */
const bundleIni = `
[presets]
printer = Generic
print = Generic
filament = PLA

[printer:Generic]
bed_shape = 0x0,200x0,200x200,0x200
nozzle_diameter = 0.4
gcode_flavor = klipper

[print:Generic]
layer_height = 0.2

[filament:PLA]
temperature = 210
bed_temperature = 60

[filament:PETG]
temperature = 240
bed_temperature = 80
`

function fileOf(content: string, name: string): File {
  return new File([content], name, { type: 'text/plain' })
}

beforeEach(() => {
  localStorage.clear()
  setActivePinia(createPinia())
})

describe('useProfileForm importFiles: bundle filaments', () => {
  it('reports the same count in importedCount and the number of distinct filled fields', async () => {
    const form = useProfileForm()
    form.loadNew()
    await form.importFiles([fileOf(bundleIni, 'bundle.ini')], 'filament')
    const summary = form.importSummary.value
    expect(summary).not.toBeNull()
    // Two sections each fill 2 filament fields (temperature, bed_temperature), sharing field
    // names; the headline count and the number of distinct filled-field chips must agree so the
    // UI doesn't show a count that doesn't match the chips rendered.
    expect(summary!.filled.length).toBe(summary!.importedCount)
    expect(summary!.orcaMachine).toBe(false)
  })
})

describe('useProfileForm importFiles: base-preset cache', () => {
  it('prompts for the missing parent when the child is uploaded alone', async () => {
    const form = useProfileForm()
    form.loadNew()
    await form.importFiles([fileOf(chubechanger, 'orca_machine_chubechanger.json')], 'printer')
    const summary = form.importSummary.value!
    expect(summary.unresolvedParents).toHaveLength(1)
    expect(summary.unresolvedParents[0].presetName).toBe('Voron 2.4 300 0.4 nozzle')
    expect(summary.orcaMachine).toBe(true)
    // The bed size only lives in the missing parent, so the default stays untouched.
    expect(form.bedWidthMm.value).not.toBe(300)
  })

  it('resolves the chain from the cache on a later upload of the child alone', async () => {
    useSlicerPresets().add(voron24Parent)
    const form = useProfileForm()
    form.loadNew()
    await form.importFiles([fileOf(chubechanger, 'orca_machine_chubechanger.json')], 'printer')
    const summary = form.importSummary.value!
    expect(summary.unresolvedParents).toEqual([])
    expect(form.bedWidthMm.value).toBe(300)
    expect(form.bedDepthMm.value).toBe(300)
  })

  it('importParentFile adds the picked parent to the cache and re-runs the import', async () => {
    const form = useProfileForm()
    form.loadNew()
    await form.importFiles([fileOf(chubechanger, 'orca_machine_chubechanger.json')], 'printer')
    expect(form.importSummary.value!.unresolvedParents).toHaveLength(1)
    await form.importParentFile(fileOf(voron24Parent, 'Voron 2.4 300 0.4 nozzle.json'))
    expect(form.importSummary.value!.unresolvedParents).toEqual([])
    expect(form.bedWidthMm.value).toBe(300)
    expect(useSlicerPresets().presets.map((p) => p.name)).toContain('Voron 2.4 300 0.4 nozzle')
  })

  it('importParentFile surfaces an invalid file as a summary warning without re-running', async () => {
    const form = useProfileForm()
    form.loadNew()
    await form.importFiles([fileOf(chubechanger, 'orca_machine_chubechanger.json')], 'printer')
    await form.importParentFile(fileOf('not a preset', 'garbage.txt'))
    const summary = form.importSummary.value!
    expect(summary.warnings.some((w) => w.includes('does not look like an OrcaSlicer preset'))).toBe(
      true,
    )
    expect(summary.unresolvedParents).toHaveLength(1)
  })

  it('auto-caches uploaded chain members so the child later resolves alone', async () => {
    const formA = useProfileForm()
    formA.loadNew()
    await formA.importFiles(
      [
        fileOf(chubechanger, 'orca_machine_chubechanger.json'),
        fileOf(voron24Parent, 'voron24_parent.json'),
      ],
      'printer',
    )
    const cached = useSlicerPresets().presets.map((p) => p.name)
    expect(cached).toContain('Voron 2.4 300 0.4 nozzle')

    const formB = useProfileForm()
    formB.loadNew()
    await formB.importFiles([fileOf(chubechanger, 'orca_machine_chubechanger.json')], 'printer')
    expect(formB.importSummary.value!.unresolvedParents).toEqual([])
    expect(formB.bedWidthMm.value).toBe(300)
  })

  it('reports per-file sources scoped to the import kind', async () => {
    const form = useProfileForm()
    form.loadNew()
    await form.importFiles([fileOf(chubechanger, 'orca_machine_chubechanger.json')], 'printer')
    const sources = form.importSummary.value!.sources
    expect(sources).toHaveLength(1)
    expect(sources[0].fileName).toBe('orca_machine_chubechanger.json')
    expect(sources[0].filled).toContain('nozzleDiameterMm')
    expect(sources[0].filled).not.toContain('nozzleTempC')
  })
})
