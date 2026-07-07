import { describe, expect, it } from 'vitest'
import { useProfileForm } from '../../src/composables/useProfileForm'

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

describe('useProfileForm importFiles: bundle filaments', () => {
  it('reports the same count in importedCount and the number of distinct filled fields', async () => {
    const form = useProfileForm()
    form.loadNew()
    const file = new File([bundleIni], 'bundle.ini', { type: 'text/plain' })
    await form.importFiles([file], 'filament')
    const summary = form.importSummary.value
    expect(summary).not.toBeNull()
    // Two sections each fill 2 filament fields (temperature, bed_temperature), sharing field
    // names; the headline count and the number of distinct filled-field chips must agree so the
    // UI doesn't show a count that doesn't match the chips rendered.
    expect(summary!.filled.length).toBe(summary!.importedCount)
  })
})
