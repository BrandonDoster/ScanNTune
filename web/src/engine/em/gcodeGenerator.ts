import type { FilamentProfile, PrinterProfile } from '../pa/types'
import { substituteSlicerVariables } from '../pa/slicerVariables'
import {
  basePerimeters,
  COLD_PRINT_WARNING,
  type Emitter,
  extrude,
  motionLimitCommands,
  PERIMETER_LOOPS,
  rasterBase,
  retract,
  startGcodeHeats,
  travel,
  type Box,
} from '../gcode/emitter'
import {
  accelRampMm,
  emCouponGeometry,
  type EmTestSpec,
  MEASURED_LAYERS,
  PEDESTAL_LAYERS,
  PEDESTAL_WIDTH_FACTOR,
  volumetricFlowMm3S,
} from './types'

export const HIGH_FLOW_WARNING_THRESHOLD_MM3_S = 12
export function generateEmGcode(
  profile: PrinterProfile,
  filament: FilamentProfile,
  spec: EmTestSpec,
): string {
  return generateEmGcodeWithReport(profile, filament, spec).gcode
}

export function generateEmGcodeWithReport(
  profile: PrinterProfile,
  filament: FilamentProfile,
  spec: EmTestSpec,
): { gcode: string; unknownVariables: string[]; warnings: string[] } {
  if (spec.blockCount < 3) throw new Error('At least 3 pitch blocks are needed for a fit')
  if (spec.linesPerBlock < 2) throw new Error('Each block needs at least 2 lines')
  if (spec.pitchMaxMm <= spec.pitchMinMm) throw new Error('Max pitch must exceed min pitch')
  if (spec.printSpeedMmS <= 0) throw new Error('Print speed must be positive')
  if (spec.lineLengthMm <= 0) throw new Error('Line length must be positive')
  if (spec.nominalLineWidthMm <= 0) throw new Error('Nominal line width must be positive')

  const start = substituteSlicerVariables(profile.startGcode, profile, filament)
  const end = substituteSlicerVariables(profile.endGcode, profile, filament)
  const substituted: PrinterProfile = { ...profile, startGcode: start.gcode, endGcode: end.gcode }
  const unknownVariables = [...new Set([...start.unknown, ...end.unknown])]
  const warnings = [...new Set([...start.warnings, ...end.warnings])]
  if (!startGcodeHeats(start.gcode)) warnings.push(COLD_PRINT_WARNING)

  const flow = volumetricFlowMm3S(spec, profile.layerHeightMm)
  if (flow > HIGH_FLOW_WARNING_THRESHOLD_MM3_S) {
    warnings.push(
      `Volumetric flow is ${flow.toFixed(1)} mm^3/s; typical hotends under-extrude above ` +
        `${HIGH_FLOW_WARNING_THRESHOLD_MM3_S} mm^3/s. Intended for high-flow hotends only.`,
    )
  }
  const ramp = accelRampMm(spec.printSpeedMmS, profile.printAccelMmS2)
  if (2 * ramp > spec.lineLengthMm / 2) {
    warnings.push(
      'At this speed and acceleration the line middles never reach the commanded speed; ' +
        'lower the speed, raise the acceleration, or lengthen the lines.',
    )
  }

  return { gcode: emitEmGcode(substituted, filament, spec), unknownVariables, warnings }
}

function emitEmGcode(profile: PrinterProfile, filament: FilamentProfile, spec: EmTestSpec): string {
  const g = emCouponGeometry(spec)
  const ox = (profile.bedWidthMm - g.couponWidthMm) / 2
  const oy = (profile.bedDepthMm - g.couponHeightMm) / 2
  if (ox < 0 || oy < 0) throw new Error('Coupon does not fit on the configured bed')

  const nominal = spec.nominalLineWidthMm
  const holes: Box[] = g.fiducials.map((f) => ({
    x0: ox + f.xMm - g.fiducialSizeMm / 2,
    y0: oy + f.yMm - g.fiducialSizeMm / 2,
    x1: ox + f.xMm + g.fiducialSizeMm / 2,
    y1: oy + f.yMm + g.fiducialSizeMm / 2,
  }))
  // The interior window is a hole box: it turns the solid-base fill into a frame band.
  const windowBox: Box = {
    x0: ox + g.frameBandMm,
    y0: oy + g.frameBandMm,
    x1: ox + g.couponWidthMm - g.frameBandMm,
    y1: oy + g.couponHeightMm - g.frameBandMm,
  }

  const e: Emitter = { lines: [], x: 0, y: 0 }
  const L = e.lines
  L.push('; ScanNTune extrusion multiplier test')
  L.push(`; nominal line width ${nominal.toFixed(3)} mm, comb speed ${spec.printSpeedMmS} mm/s`)
  L.push(...profile.startGcode.split('\n'))
  L.push('M83')
  L.push('G90')
  L.push(...motionLimitCommands(profile))

  const totalLayers = PEDESTAL_LAYERS + MEASURED_LAYERS
  const infillInset = PERIMETER_LOOPS * nominal
  const expand = (b: Box): Box => ({
    x0: b.x0 - infillInset,
    y0: b.y0 - infillInset,
    x1: b.x1 + infillInset,
    y1: b.y1 + infillInset,
  })

  for (let layer = 0; layer < totalLayers; layer++) {
    const z = profile.layerHeightMm * (layer + 1)
    // Bracket the layer change: retract before the Z push, travel to the frame corner where
    // the next layer's perimeter starts while still retracted (the move crosses the open
    // window), and only then restore pressure.
    if (layer > 0) retract(e, profile, 1)
    L.push(`G1 Z${z.toFixed(3)} F600`)
    if (layer > 0) {
      travel(e, profile, ox + 0.5 * nominal, oy + 0.5 * nominal)
      retract(e, profile, -1)
    }

    // Frame band: perimeters from the solid-base machinery with the window + fiducials as
    // holes. There is no skirt: the band perimeter is structural, never measured, so it
    // absorbs the prime.
    basePerimeters(e, profile, filament, nominal, ox, oy, g.couponWidthMm, g.couponHeightMm,
      [windowBox, ...holes])
    // The band infill rasters as four strips so no scanline (or its connecting travel) ever
    // crosses the open window; one raster over the whole rectangle would ooze strings across
    // the measured combs on every scanline. Each strip hop is retract-bracketed.
    const W = g.couponWidthMm
    const H = g.couponHeightMm
    const band = g.frameBandMm
    const strips: { x0: number; y0: number; w: number; h: number; holes: Box[] }[] = [
      // Top and bottom strips carry the fiducial holes; left/right span between them.
      { x0: ox + infillInset, y0: oy + infillInset, w: W - 2 * infillInset, h: band - 2 * infillInset,
        holes: holes.map(expand) },
      { x0: ox + infillInset, y0: oy + H - band + infillInset, w: W - 2 * infillInset,
        h: band - 2 * infillInset, holes: holes.map(expand) },
      // The side strips butt exactly against the top/bottom strips (their y ranges share a
      // boundary at band - infillInset) so the corner seams have no unfilled sliver.
      { x0: ox + infillInset, y0: oy + band - infillInset, w: band - 2 * infillInset,
        h: H - 2 * band + 2 * infillInset, holes: [] },
      { x0: ox + W - band + infillInset, y0: oy + band - infillInset, w: band - 2 * infillInset,
        h: H - 2 * band + 2 * infillInset, holes: [] },
    ]
    for (const s of strips) {
      retract(e, profile, 1)
      travel(e, profile, s.x0, s.y0)
      retract(e, profile, -1)
      rasterBase(e, profile, filament, nominal, s.x0, s.y0, s.w, s.h, layer % 2 === 0, s.holes)
    }

    // Center rail.
    rasterBase(e, profile, filament, nominal, ox + g.frameBandMm, oy + g.railY0Mm,
      g.couponWidthMm - 2 * g.frameBandMm, g.railWidthMm, layer % 2 === 0, [])

    // Comb lines: pedestal width below, nominal width on the measured layers.
    const combWidth = layer < PEDESTAL_LAYERS ? PEDESTAL_WIDTH_FACTOR * nominal : nominal
    const rows: { blocks: typeof g.topRow; y0: number; y1: number }[] = [
      { blocks: g.topRow, y0: oy + g.topRowY0Mm, y1: oy + g.topRowY1Mm },
      { blocks: g.bottomRow, y0: oy + g.bottomRowY0Mm, y1: oy + g.bottomRowY1Mm },
    ]
    for (const row of rows) {
      for (const block of row.blocks) {
        retract(e, profile, 1)
        travel(e, profile, ox + block.lineXsMm[0], row.y0)
        retract(e, profile, -1)
        for (let j = 0; j < block.lineXsMm.length; j++) {
          const x = ox + block.lineXsMm[j]
          const down = j % 2 === 1
          if (j > 0) travel(e, profile, x, down ? row.y1 : row.y0)
          extrude(e, profile, filament, combWidth, x, down ? row.y0 : row.y1, spec.printSpeedMmS)
        }
      }
    }
  }

  retract(e, profile, 1)
  L.push(...profile.endGcode.split('\n'))
  return L.join('\n') + '\n'
}
