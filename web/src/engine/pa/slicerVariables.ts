import type { PrinterProfile } from './types'

// PrusaSlicer and OrcaSlicer placeholder names mapped onto profile fields. Case-sensitive,
// matching the slicers' own variable names. The optional [n] index suffix (multi-extruder
// vectors) is accepted and ignored: the PA coupon is a single-extruder print.
const VARIABLE_MAP: Record<string, (p: PrinterProfile) => string | number> = {
  first_layer_temperature: (p) => p.nozzleTempC,
  temperature: (p) => p.nozzleTempC,
  nozzle_temperature: (p) => p.nozzleTempC,
  first_layer_nozzle_temperature: (p) => p.nozzleTempC,
  first_layer_bed_temperature: (p) => p.bedTempC,
  bed_temperature: (p) => p.bedTempC,
  first_layer_bed_temp: (p) => p.bedTempC,
  chamber_temperature: (p) => p.chamberTempC,
  chamber_temp: (p) => p.chamberTempC,
  filament_type: (p) => p.filamentType,
  layer_height: (p) => p.layerHeightMm,
  first_layer_height: (p) => p.layerHeightMm,
  nozzle_diameter: (p) => p.nozzleDiameterMm,
  filament_diameter: (p) => p.filamentDiameterMm,
  travel_speed: (p) => p.travelSpeedMmS,
}

// A placeholder is a simple identifier with an optional numeric index, wrapped in [] or {}.
// Anything else in brackets or braces (Klipper jinja {% ... %}, dotted object refs like
// {printer.extruder.target}, plain comment text) is firmware-side syntax or prose: it is left
// verbatim and never reported.
const PLACEHOLDER = /\[([A-Za-z_][A-Za-z0-9_]*)(?:\[\d+\])?\]|\{([A-Za-z_][A-Za-z0-9_]*)(?:\[\d+\])?\}/g

/**
 * Substitute PrusaSlicer/OrcaSlicer placeholder variables in user start/pause/end G-code with
 * values from the printer profile. Recognized placeholders are replaced; identifier-shaped
 * placeholders that are not in the map stay verbatim and are returned in `unknown` (deduplicated).
 */
export function substituteSlicerVariables(
  gcode: string,
  profile: PrinterProfile,
): { gcode: string; unknown: string[] } {
  const unknown = new Set<string>()
  const out = gcode.replace(PLACEHOLDER, (match, square: string | undefined, curly: string | undefined) => {
    const name = square ?? curly
    if (name === undefined) return match
    const resolve = VARIABLE_MAP[name]
    if (resolve === undefined) {
      unknown.add(name)
      return match
    }
    return String(resolve(profile))
  })
  return { gcode: out, unknown: [...unknown] }
}
