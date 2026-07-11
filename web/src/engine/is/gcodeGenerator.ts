import type { FilamentProfile, PrinterProfile } from '../gcode/profileTypes'
import { couponOrigin, EDGE_MARGIN_MM, prepareProfile, setupPreamble } from '../gcode/couponShell'
import {
  type Box,
  type Emitter,
  extrude,
  extrusionMm,
  frameBandLayer,
  HIGH_FLOW_WARNING_THRESHOLD_MM3_S,
  MEASURED_LAYERS,
  motionLimitCommands,
  NOMINAL_WIDTH_FACTOR,
  PEDESTAL_LAYERS,
  PEDESTAL_WIDTH_FACTOR,
  RASTER_SPEED_FACTOR,
  retract,
  travel,
} from '../gcode/emitter'
import { isCouponGeometry, type IsSegment } from './couponGeometry'
import {
  disableShapingCommands,
  isMotionLimitCommands,
  restoreShapingCommands,
} from './firmwareMotion'
import { fitSpecToBed, type IsTestSpec, rampWarnings, validateIsSpec } from './types'

export { EDGE_MARGIN_MM, HIGH_FLOW_WARNING_THRESHOLD_MM3_S }

export function generateIsGcode(
  profile: PrinterProfile,
  filament: FilamentProfile,
  spec: IsTestSpec,
): string {
  return generateIsGcodeWithReport(profile, filament, spec).gcode
}

export function generateIsGcodeWithReport(
  profile: PrinterProfile,
  filament: FilamentProfile,
  spec: IsTestSpec,
): { gcode: string; unknownVariables: string[]; warnings: string[] } {
  validateIsSpec(spec)
  const { spec: fitted, notes } = fitSpecToBed(spec, profile)

  // Single color: the pause G-code is never emitted, so its placeholders are not reported.
  const {
    profile: substituted,
    unknownVariables,
    warnings,
  } = prepareProfile(profile, filament, { includePause: false })
  warnings.push(...notes)
  warnings.push(...rampWarnings(fitted))

  const nominal = profile.nozzleDiameterMm * NOMINAL_WIDTH_FACTOR
  for (const speed of fitted.speedsMmS) {
    const flow = speed * nominal * profile.layerHeightMm
    if (flow > HIGH_FLOW_WARNING_THRESHOLD_MM3_S) {
      warnings.push(
        `The ${speed} mm/s tier extrudes ${flow.toFixed(1)} mm^3/s; typical hotends ` +
          `under-extrude above ${HIGH_FLOW_WARNING_THRESHOLD_MM3_S} mm^3/s. ` +
          'Intended for high-flow hotends only.',
      )
    }
  }

  return { gcode: emitIsGcode(substituted, filament, fitted), unknownVariables, warnings }
}

/** Feedrate of the moving prime at each line start. */
const PRIME_SPEED_MM_S = 30
/** Coast length as a multiple of the nozzle diameter (standard slicer coasting default). */
const COAST_NOZZLE_FACTOR = 1.5
/** Length of the wipe move the retract runs over. */
const WIPE_MM = 2

/**
 * Prime on the move: the deretract is spread over the first stretch of the approach leg at
 * a slow feedrate instead of a stationary un-retract, which piles a blob at the line start.
 */
function primeOnTheMove(
  e: Emitter,
  p: PrinterProfile,
  f: FilamentProfile,
  lineWidthMm: number,
  x: number,
  y: number,
): void {
  const len = Math.hypot(x - e.x, y - e.y)
  const eAmt = p.retractMm + extrusionMm(len, lineWidthMm, p.layerHeightMm, f.filamentDiameterMm)
  e.lines.push(
    `G1 X${x.toFixed(3)} Y${y.toFixed(3)} E${eAmt.toFixed(5)} F${Math.round(PRIME_SPEED_MM_S * 60)}`,
  )
  e.x = x
  e.y = y
}

/**
 * End a test line inside the frame band: extrude the deceleration tail at the cruise
 * feedrate, coast the last stretch (zero-E move fed by residual pressure), then wipe on
 * retract, running the retract during a short move back along the just-printed tail. All
 * three are standard slicer end-of-line features; the E manipulation only starts past the
 * measured segment.
 */
function finishLine(
  e: Emitter,
  p: PrinterProfile,
  f: FilamentProfile,
  lineWidthMm: number,
  tail: IsSegment,
  ox: number,
  oy: number,
  speedMmS: number,
): void {
  const tailLen = Math.hypot(tail.x1 - tail.x0, tail.y1 - tail.y0)
  const ux = (tail.x1 - tail.x0) / tailLen
  const uy = (tail.y1 - tail.y0) / tailLen
  const endX = ox + tail.x1
  const endY = oy + tail.y1
  const feed = Math.round(speedMmS * 60)

  const coastMm = Math.min(COAST_NOZZLE_FACTOR * p.nozzleDiameterMm, tailLen)
  if (tailLen - coastMm > 1e-6) {
    extrude(e, p, f, lineWidthMm, endX - ux * coastMm, endY - uy * coastMm, speedMmS)
  }
  e.lines.push(`G1 X${endX.toFixed(3)} Y${endY.toFixed(3)} F${feed}`)
  e.x = endX
  e.y = endY

  const wipeMm = Math.min(WIPE_MM, tailLen)
  const wipeX = endX - ux * wipeMm
  const wipeY = endY - uy * wipeMm
  // Wipe feedrate chosen so the E axis runs at the profile's retract speed over the move,
  // capped at the tier speed; at the cap the retract runs slower than the profile's speed.
  const wipeFeed = Math.round(
    Math.min(speedMmS, (wipeMm / p.retractMm) * p.retractSpeedMmS) * 60,
  )
  e.lines.push(
    `G1 X${wipeX.toFixed(3)} Y${wipeY.toFixed(3)} E${(-p.retractMm).toFixed(3)} F${wipeFeed}`,
  )
  e.x = wipeX
  e.y = wipeY
}

function emitIsGcode(profile: PrinterProfile, filament: FilamentProfile, spec: IsTestSpec): string {
  const g = isCouponGeometry(spec)
  const { ox, oy } = couponOrigin(
    profile,
    g.couponWidthMm,
    g.couponHeightMm,
    spec.placement,
    EDGE_MARGIN_MM,
  )

  const nominal = profile.nozzleDiameterMm * NOMINAL_WIDTH_FACTOR
  const holes: Box[] = g.fiducials.map((f) => ({
    x0: ox + f.xMm - g.fiducialSizeMm / 2,
    y0: oy + f.yMm - g.fiducialSizeMm / 2,
    x1: ox + f.xMm + g.fiducialSizeMm / 2,
    y1: oy + f.yMm + g.fiducialSizeMm / 2,
  }))

  const e: Emitter = { lines: [], x: 0, y: 0 }
  const L = e.lines
  L.push(
    ...setupPreamble(
      profile,
      [
        '; ScanNTune input shaper resonance test',
        `; speed tiers ${spec.speedsMmS.join(', ')} mm/s, acceleration ${spec.accelMmS2} mm/s^2`,
      ],
      // The test rings the frame on purpose: the spec's acceleration and square corner
      // velocity replace the profile's limits for the whole print.
      { motionLines: isMotionLimitCommands(profile, spec.accelMmS2, spec.squareCornerVelocityMmS) },
    ),
  )
  // Input shaping and pressure advance both mask ringing; switch them off before any
  // extrusion so the measured corners carry the raw machine response.
  L.push(...disableShapingCommands(profile))

  const totalLayers = PEDESTAL_LAYERS + MEASURED_LAYERS
  for (let layer = 0; layer < totalLayers; layer++) {
    const z = profile.layerHeightMm * (layer + 1)
    // Retract before the Z push; every travel until the band deretract runs retracted, and
    // each test line restores pressure itself with its moving prime.
    retract(e, profile, 1)
    L.push(`G1 Z${z.toFixed(3)} F600`)

    // Test lines first, frame band last: the band's perimeters and raster are laid over the
    // line ends afterwards, ironing the weld tips and any residual stop blobs flat so the
    // scanned face stays flush. Pedestal width below, nominal width on the measured layers.
    // Each line is one continuous extrusion from the run-up leg through the sharp corner
    // into the measured segment, at the tier's cruise speed; the corner vertex gets no
    // retract, pause, or speed change, so the axis rings freely into the measured segment.
    const pedestal = layer < PEDESTAL_LAYERS
    const width = pedestal ? PEDESTAL_WIDTH_FACTOR * nominal : nominal
    for (const group of g.groups) {
      for (const line of group.lines) {
        // The pedestal layer only needs to stick: its lines are capped to the same speed the
        // band fill uses on that layer, because a single first-layer bead at the fast tiers
        // would be dragged off the bed. The measured layers run at the full tier speed.
        const speed = pedestal
          ? Math.min(line.speedMmS, profile.travelSpeedMmS * RASTER_SPEED_FACTOR)
          : line.speedMmS
        travel(e, profile, ox + line.prime.x0, oy + line.prime.y0)
        primeOnTheMove(e, profile, filament, width, ox + line.prime.x1, oy + line.prime.y1)
        extrude(e, profile, filament, width, ox + line.runUp.x1, oy + line.runUp.y1, speed)
        extrude(e, profile, filament, width, ox + line.measured.x1, oy + line.measured.y1, speed)
        finishLine(e, profile, filament, width, line.tail, ox, oy, speed)
      }
    }

    // The band starts on its own travel; the lines left the nozzle retracted after their
    // wipes, so the hop to the frame corner crosses the window without stringing.
    travel(e, profile, ox + 0.5 * nominal, oy + 0.5 * nominal)
    retract(e, profile, -1)
    frameBandLayer(e, profile, filament, nominal, ox, oy, g.couponWidthMm, g.couponHeightMm,
      g.frameBandMm, holes, layer % 2 === 0)
  }

  // Hand the printer back: the user's own shaper and pressure advance settings, then the
  // profile's own motion limits.
  L.push(...restoreShapingCommands(profile))
  L.push(...motionLimitCommands(profile))
  if (profile.firmware === 'Klipper') {
    L.push('; MINIMUM_CRUISE_RATIO resumes with the next firmware restart or saved configuration')
  }
  retract(e, profile, 1)
  L.push(...profile.endGcode.split('\n'))
  return L.join('\n') + '\n'
}
