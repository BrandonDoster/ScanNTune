import { describe, expect, it } from 'vitest'
import { FIELD_KINDS } from '../../../src/engine/pa/slicerImport'
import { defaultPrinterProfile } from '../../../src/engine/pa/types'

const PRINTER_FIELDS = new Set([
  'firmware',
  'bedWidthMm',
  'bedDepthMm',
  'nozzleDiameterMm',
  'layerHeightMm',
  'retractMm',
  'retractSpeedMmS',
  'travelSpeedMmS',
  'printAccelMmS2',
  'squareCornerVelocityMmS',
  'startGcode',
  'pauseGcode',
  'endGcode',
])

const FILAMENT_FIELDS = new Set([
  'filamentType',
  'filamentDiameterMm',
  'nozzleTempC',
  'bedTempC',
  'chamberTempC',
])

describe('FIELD_KINDS', () => {
  it('classifies every mapped printer-profile field as printer or filament', () => {
    // id and name aren't slicer-import targets; every other PrinterProfile key must be classified.
    const mappedKeys = Object.keys(defaultPrinterProfile()).filter(
      (k) => k !== 'id' && k !== 'name',
    )
    for (const key of mappedKeys) {
      expect(FIELD_KINDS).toHaveProperty(key)
    }
  })

  it('agrees with the expected printer/filament split', () => {
    for (const [field, kind] of Object.entries(FIELD_KINDS)) {
      if (PRINTER_FIELDS.has(field)) expect(kind).toBe('printer')
      else if (FILAMENT_FIELDS.has(field)) expect(kind).toBe('filament')
      else throw new Error(`Unexpected FIELD_KINDS entry: ${field}`)
    }
  })
})
