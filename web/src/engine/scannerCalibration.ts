import type { ScannerCalibration } from './types'

// Derived quantities for a stored scanner calibration. CorrectionFactor is the scanner's isotropic
// scale error relative to its nominal DPI and is roughly constant across DPI settings, so
// pxPerMmAtDpi can apply the same calibration to a coupon scanned at any resolution.

/** Pixels-per-mm the DPI setting nominally implies (DPI / 25.4), before the scanner's error. */
export function nominalPxPerMm(c: ScannerCalibration): number {
  return c.dpi / 25.4
}

/** Measured px/mm / nominal px/mm: the scanner's isotropic scale error (~1.0). */
export function correctionFactor(c: ScannerCalibration): number {
  const nominal = nominalPxPerMm(c)
  return nominal > 0 ? c.pxPerMm / nominal : 1.0
}

/** The DPI the scanner effectively resolves at (px/mm * 25.4). */
export function effectiveDpi(c: ScannerCalibration): number {
  return c.pxPerMm * 25.4
}

/** The scale error as a percentage of nominal (negative = the scanner reads small). */
export function percentVsNominal(c: ScannerCalibration): number {
  return (correctionFactor(c) - 1.0) * 100.0
}

/** The true px/mm for a scan taken at the given DPI, applying the stored error. */
export function pxPerMmAtDpi(c: ScannerCalibration, dpi: number): number {
  return (dpi / 25.4) * correctionFactor(c)
}

/** A non-positive DPI or px/mm is degenerate and is treated as uncalibrated. */
export function isUsableCalibration(c: ScannerCalibration): boolean {
  return c.dpi > 0 && c.pxPerMm > 0
}
