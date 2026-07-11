import type { FilamentProfile, PrinterProfile } from '../gcode/profileTypes'
import { couponOrigin, prepareProfile, setupPreamble } from '../gcode/couponShell'
import {
  BASE_LAYERS,
  basePerimeters,
  type Emitter,
  extrude,
  PERIMETER_LOOPS,
  RASTER_SPEED_FACTOR,
  rasterBase,
  rectLoop,
  retract,
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
/** Clearance from the bed edge for the 'front'/'back' placements. */
export const EDGE_MARGIN_MM = 10
/** How far each comb line runs past its row boundary onto the band/rail perimeters. */
export const ANCHOR_OVERLAP_MM = 1
/** Loops around each fiducial hole; one more than elsewhere so raster ends stay clear. */
const HOLE_PERIMETER_LOOPS = 3
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

  // The pause gcode is only emitted (and its placeholders only reported) with a contrast base.
  const {
    profile: substituted,
    unknownVariables,
    warnings,
  } = prepareProfile(profile, filament, { includePause: spec.contrastBase })

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
  const { ox, oy } = couponOrigin(
    profile,
    g.couponWidthMm,
    g.couponHeightMm,
    spec.placement,
    EDGE_MARGIN_MM,
  )

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
  L.push(
    ...setupPreamble(profile, [
      '; ScanNTune extrusion multiplier test',
      `; nominal line width ${nominal.toFixed(3)} mm, comb speed ${spec.printSpeedMmS} mm/s`,
    ]),
  )

  const totalLayers = PEDESTAL_LAYERS + MEASURED_LAYERS
  const infillInset = PERIMETER_LOOPS * nominal
  // Raster clearance around a fiducial hole: past the outermost of its perimeter loops.
  const holeClearance = HOLE_PERIMETER_LOOPS * nominal
  const expandHole = (b: Box): Box => ({
    x0: b.x0 - holeClearance,
    y0: b.y0 - holeClearance,
    x1: b.x1 + holeClearance,
    y1: b.y1 + holeClearance,
  })

  // Contrasting-color base: two solid layers over the full coupon rectangle (the window is
  // backed, not open; only the fiducial holes stay open), then a filament-change pause.
  const zOffsetMm = spec.contrastBase ? BASE_LAYERS * profile.layerHeightMm : 0
  if (spec.contrastBase) {
    const baseRasterHoles = holes.map((h) => ({
      x0: h.x0 - infillInset,
      y0: h.y0 - infillInset,
      x1: h.x1 + infillInset,
      y1: h.y1 + infillInset,
    }))
    for (let layer = 0; layer < BASE_LAYERS; layer++) {
      const z = profile.layerHeightMm * (layer + 1)
      L.push(`G1 Z${z.toFixed(3)} F600`)
      basePerimeters(e, profile, filament, nominal, ox, oy, g.couponWidthMm, g.couponHeightMm,
        holes)
      rasterBase(e, profile, filament, nominal, ox + infillInset, oy + infillInset,
        g.couponWidthMm - 2 * infillInset, g.couponHeightMm - 2 * infillInset,
        layer % 2 === 0, baseRasterHoles)
    }
    // Filament change to the contrasting color.
    retract(e, profile, 1)
    L.push(...profile.pauseGcode.split('\n'))
    // Printers whose PAUSE/M600 macro already retracts may see a small blob at the frame
    // start; set retractMm to 0 in the profile if that happens.
    L.push('; if your pause macro already retracts, set retractMm to 0 in the profile')
    retract(e, profile, -1)
  }

  for (let layer = 0; layer < totalLayers; layer++) {
    const z = profile.layerHeightMm * (layer + 1) + zOffsetMm
    // Bracket the layer change: retract before the Z push, travel to the frame corner where
    // the next layer's perimeter starts while still retracted (the move crosses the open
    // window), and only then restore pressure.
    if (layer > 0) retract(e, profile, 1)
    L.push(`G1 Z${z.toFixed(3)} F600`)
    if (layer > 0) {
      travel(e, profile, ox + 0.5 * nominal, oy + 0.5 * nominal)
      retract(e, profile, -1)
    }

    // Frame band: outline + window perimeters first. The fiducial hole perimeters are
    // deliberately NOT drawn here; they come after the band raster so the loops seal the
    // raster's ragged line-ends under a clean bead (a rough hole edge shifts the centroid
    // the aligner reads).
    basePerimeters(e, profile, filament, nominal, ox, oy, g.couponWidthMm, g.couponHeightMm,
      [windowBox])
    // The band infill rasters as four strips so no scanline (or its connecting travel) ever
    // crosses the open window; one raster over the whole rectangle would ooze strings across
    // the measured combs on every scanline. Each strip hop is retract-bracketed.
    const W = g.couponWidthMm
    const H = g.couponHeightMm
    const band = g.frameBandMm
    const strips: { x0: number; y0: number; w: number; h: number; holes: Box[] }[] = [
      // Top and bottom strips carry the fiducial holes; left/right span between them.
      { x0: ox + infillInset, y0: oy + infillInset, w: W - 2 * infillInset, h: band - 2 * infillInset,
        holes: holes.map(expandHole) },
      { x0: ox + infillInset, y0: oy + H - band + infillInset, w: W - 2 * infillInset,
        h: band - 2 * infillInset, holes: holes.map(expandHole) },
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

    // Fiducial hole perimeters, drawn after the raster so the loops seal its ragged
    // line-ends under clean continuous beads: the aligner reads the hole centroids, and a
    // frayed edge biases them. All travels here stay within the band ring.
    for (const hole of holes) {
      for (let k = 0; k < HOLE_PERIMETER_LOOPS; k++) {
        const out = (k + 0.5) * nominal
        rectLoop(e, profile, filament, nominal, hole.x0 - out, hole.y0 - out,
          hole.x1 + out, hole.y1 + out, profile.travelSpeedMmS * RASTER_SPEED_FACTOR)
      }
    }

    // Center rail: perimeter loops flush with its edges give the comb line ends a continuous
    // bead to anchor into (a bare raster edge is a sawtooth the thin lines pull out of), with
    // the raster inset behind them like the band. The approach travel crosses the window.
    const railX0 = ox + g.frameBandMm
    const railY0 = oy + g.railY0Mm
    const railW = g.couponWidthMm - 2 * g.frameBandMm
    retract(e, profile, 1)
    travel(e, profile, railX0 + railW - 0.5 * nominal, railY0 + 0.5 * nominal)
    retract(e, profile, -1)
    // The loops wind from the rail's right corner because the raster below starts at the
    // right end; ending the perimeters there keeps the hop between them short and wet.
    for (let k = 0; k < PERIMETER_LOOPS; k++) {
      const ins = (k + 0.5) * nominal
      rectLoop(e, profile, filament, nominal, railX0 + railW - ins, railY0 + ins,
        railX0 + ins, railY0 + g.railWidthMm - ins, profile.travelSpeedMmS * RASTER_SPEED_FACTOR)
    }
    // Fixed 45 degrees: on a long thin strip the 135 degree raster starts at the far end,
    // which would mean a long dry travel from the perimeter corner.
    rasterBase(e, profile, filament, nominal, railX0 + infillInset, railY0 + infillInset,
      railW - 2 * infillInset, g.railWidthMm - 2 * infillInset, true, [])

    // Comb lines: pedestal width below, nominal width on the measured layers. Each line
    // runs ANCHOR_OVERLAP_MM past the row boundary on both ends so its tip prints on top
    // of the band/rail perimeters laid earlier in the same layer: an overlap weld. A line
    // ending exactly at the boundary only kisses the perimeter bead's side and snaps off.
    const combWidth = layer < PEDESTAL_LAYERS ? PEDESTAL_WIDTH_FACTOR * nominal : nominal
    const rows: { blocks: typeof g.topRow; y0: number; y1: number }[] = [
      { blocks: g.topRow, y0: oy + g.topRowY0Mm - ANCHOR_OVERLAP_MM,
        y1: oy + g.topRowY1Mm + ANCHOR_OVERLAP_MM },
      { blocks: g.bottomRow, y0: oy + g.bottomRowY0Mm - ANCHOR_OVERLAP_MM,
        y1: oy + g.bottomRowY1Mm + ANCHOR_OVERLAP_MM },
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
