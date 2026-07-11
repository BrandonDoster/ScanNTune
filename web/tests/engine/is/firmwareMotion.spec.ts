import { describe, expect, it } from 'vitest'
import { defaultPrinterProfile } from '../../../src/engine/gcode/profileTypes'
import type { Firmware, PrinterProfile } from '../../../src/engine/gcode/profileTypes'
import { restoreShapingCommands } from '../../../src/engine/is/firmwareMotion'

function profileWith(firmware: Firmware): PrinterProfile {
  return { ...defaultPrinterProfile(), firmware }
}

describe('restoreShapingCommands', () => {
  const firmwares: Firmware[] = ['Klipper', 'Marlin', 'RepRapFirmware']

  it.each(firmwares)('emits only the restore comments for %s', (firmware) => {
    const lines = restoreShapingCommands(profileWith(firmware))
    expect(lines).toHaveLength(2)
    expect(lines[0]).toMatch(/^; input shaping resumes/)
    expect(lines[1]).toMatch(/^; pressure advance resumes/)
  })
})
