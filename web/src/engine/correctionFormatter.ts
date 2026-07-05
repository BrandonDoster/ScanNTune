import type { Correction, CouponSpec } from './types'

// Same maths as the Vector 3D "Califlower" calculator, exposed per-flavour: shrinkage =
// (1 + error)*100, part scale = 100/(1 + error), steps/mm scale by 1/(1 + error), rotation distance
// by (1 + error), Marlin XY_SKEW_FACTOR = tan(shear), Klipper SET_SKEW from the baseline triangle.

export const KLIPPER = 'Klipper'
export const MARLIN = 'Marlin'
export const REPRAP = 'RepRapFirmware'

export const SHRINKAGE = 'Shrinkage %'
export const STEPS_PER_MM = 'Steps/mm'
export const ROTATION_DISTANCE = 'Rotation distance'
export const SCALE = 'Scale %'

export const skewFlavours: readonly string[] = [KLIPPER, MARLIN, REPRAP]
export const sizeFlavours: readonly string[] = [SHRINKAGE, STEPS_PER_MM, ROTATION_DISTANCE, SCALE]

export function currentValueLabel(sizeFlavour: string): string | null {
  switch (sizeFlavour) {
    case STEPS_PER_MM:
      return 'current steps/mm'
    case ROTATION_DISTANCE:
      return 'current rot. dist.'
    default:
      return null
  }
}

export function skewCorrection(flavour: string, skewDegrees: number, coupon: CouponSpec): Correction {
  // skewDegrees is the measured corner-angle error (angle - 90). The shear the firmwares model,
  // x' = x + tan*y, CLOSES the corner, so its coefficient is the negation of the angle error.
  const tan = Math.tan((-skewDegrees * Math.PI) / 180.0)
  if (!Number.isFinite(tan) || Math.abs(skewDegrees) >= 45.0)
    return {
      code: 'skew out of range, check the scan',
      hint: 'A real coupon skews well under 1 degree; this suggests a detection problem.',
    }

  switch (flavour) {
    case MARLIN:
      return {
        code: `M852 I${f6(tan)}\nM500`,
        hint: `Send via console; M500 saves it. Or set #define XY_SKEW_FACTOR ${f6(tan)} in Configuration.h.`,
      }

    case REPRAP:
      // RRF's user-to-machine transform ADDS tanXY*Y (Move.cpp AxisTransform), opposite of Marlin's
      // planner which subtracts, so RRF needs the negated factor.
      return {
        code: `M556 S100 X${f3(-100.0 * tan)}`,
        hint: 'Add to config.g.',
      }

    default: {
      // Klipper
      const l = coupon.baselineMm
      const ac = l * Math.sqrt((1.0 + tan) * (1.0 + tan) + 1.0)
      const bd = l * Math.sqrt((tan - 1.0) * (tan - 1.0) + 1.0)
      const ad = l * Math.sqrt(tan * tan + 1.0)
      return {
        code: `SET_SKEW XY=${upTo3(ac)},${upTo3(bd)},${upTo3(ad)}\nSKEW_PROFILE SAVE=ScanNTune\nSAVE_CONFIG`,
        hint: '',
        primaryCaption: 'Paste into the Klipper console:',
        secondaryCaption: 'Add this to your start g-code:',
        secondaryCode: 'SKEW_PROFILE LOAD=ScanNTune',
      }
    }
  }
}

export function sizeCorrection(
  flavour: string,
  xScalePercent: number,
  yScalePercent: number,
  currentX: number | null,
  currentY: number | null,
): Correction {
  // A real printer's dimensional error is well under 2%; a reading beyond a few percent means a
  // wrong DPI (a 2x mismatch reads +/-50-100%) or a broken detection. Refusing to synthesize
  // firmware commands from it matters: at +100% the steps/mm branch would emit M92 X0.000.
  if (
    !Number.isFinite(xScalePercent) ||
    !Number.isFinite(yScalePercent) ||
    Math.abs(xScalePercent) >= 10.0 ||
    Math.abs(yScalePercent) >= 10.0
  )
    return {
      code: 'scale out of range, check the scan and DPI',
      hint: "A real printer errs well under 2%; this suggests the scan DPI doesn't match the calibration, or a detection problem.",
    }

  const xf = xScalePercent / 100.0
  const yf = yScalePercent / 100.0
  const avg = (xf + yf) / 2.0

  // The exact correction is the nominal/measured ratio: new = current / (1 + error). The first-order
  // form current * (1 - error) leaves an error^2 residual, so the ratio is used throughout.
  switch (flavour) {
    case STEPS_PER_MM:
      if (currentX != null && currentY != null)
        return {
          code: `M92 X${f3(currentX / (1.0 + xf))} Y${f3(currentY / (1.0 + yf))}\nM500`,
          hint: 'Send via console; M500 saves (Marlin). On Klipper use the Rotation distance flavour.',
        }
      return {
        code: 'enter current steps/mm above',
        hint: 'New = current / (1 + error), per axis.',
      }

    case ROTATION_DISTANCE:
      if (currentX != null && currentY != null)
        return {
          code: `X ${f4((1.0 + xf) * currentX)}   Y ${f4((1.0 + yf) * currentY)}`,
          hint: 'Set rotation_distance in printer.cfg (Klipper).',
        }
      return {
        code: 'enter current rotation distance above',
        hint: 'New = current * (1 + error), per axis.',
      }

    case SCALE:
      return {
        code: `X ${f2(100.0 / (1.0 + xf))} %   Y ${f2(100.0 / (1.0 + yf))} %`,
        hint: 'Scale the model per-axis in your slicer (X and Y can differ).',
      }

    default: // Shrinkage
      return {
        code: `XY shrinkage: ${f2((1.0 + avg) * 100.0)} %`,
        hint: 'OrcaSlicer / SuperSlicer: Filament → Advanced → Shrinkage compensation (XY). Single value; use Steps/mm for per-axis.',
      }
  }
}

// Number formatting matching the C# invariant-culture format strings.
function f2(n: number): string {
  return n.toFixed(2)
}
function f3(n: number): string {
  return n.toFixed(3)
}
function f4(n: number): string {
  return n.toFixed(4)
}
function f6(n: number): string {
  return n.toFixed(6)
}
// C# "0.###": up to 3 decimals, trailing zeros trimmed.
function upTo3(n: number): string {
  return parseFloat(n.toFixed(3)).toString()
}
