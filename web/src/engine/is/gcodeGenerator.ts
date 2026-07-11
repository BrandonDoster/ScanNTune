import type { FilamentProfile, PrinterProfile } from '../gcode/profileTypes'
import { couponOrigin, EDGE_MARGIN_MM, prepareProfile, setupPreamble } from '../gcode/couponShell'
import {
  type Box,
  type Emitter,
  extrude,
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
import { isCouponGeometry } from './couponGeometry'
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
    // Bracket the layer change: retract before the Z push, travel to the frame corner where
    // the next layer's perimeter starts while still retracted (the move crosses the open
    // window), and only then restore pressure.
    if (layer > 0) retract(e, profile, 1)
    L.push(`G1 Z${z.toFixed(3)} F600`)
    if (layer > 0) {
      travel(e, profile, ox + 0.5 * nominal, oy + 0.5 * nominal)
      retract(e, profile, -1)
    }

    frameBandLayer(e, profile, filament, nominal, ox, oy, g.couponWidthMm, g.couponHeightMm,
      g.frameBandMm, holes, layer % 2 === 0)

    // Test lines: pedestal width below, nominal width on the measured layers. Each line is
    // one continuous extrusion from the run-up leg through the sharp corner into the
    // measured segment, at the tier's cruise speed; the corner vertex gets no retract,
    // pause, or speed change, so the axis rings freely into the measured segment. The
    // measured ends overrun into the band so the tips weld onto its perimeters.
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
        retract(e, profile, 1)
        travel(e, profile, ox + line.runUp.x0, oy + line.runUp.y0)
        retract(e, profile, -1)
        extrude(e, profile, filament, width, ox + line.runUp.x1, oy + line.runUp.y1, speed)
        extrude(e, profile, filament, width, ox + line.measured.x1, oy + line.measured.y1, speed)
      }
    }
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
