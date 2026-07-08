import type { PrinterProfile } from '../pa/types'

export const PEDESTAL_WIDTH_FACTOR = 0.72
export const PEDESTAL_LAYERS = 2
export const MEASURED_LAYERS = 2
export const FRAME_BAND_MM = 12
export const RAIL_WIDTH_MM = 4
export const BLOCK_GAP_MM = 2
export const INNER_MARGIN_MM = 3
/** Nominal single-bead width as a fraction of the nozzle diameter (standard slicer default). */
const NOMINAL_WIDTH_FACTOR = 1.05
/** Default pitch sweep as fractions of the nominal width (~ -20% to +38% deposited width). */
const PITCH_MIN_FACTOR = 0.81
const PITCH_MAX_FACTOR = 1.38
/** Conservative default volumetric flow cap used to derive the default speed. */
const DEFAULT_MAX_FLOW_MM3_S = 8

export interface EmTestSpec {
  pitchMinMm: number
  pitchMaxMm: number
  blockCount: number
  linesPerBlock: number
  lineLengthMm: number
  printSpeedMmS: number
  nominalLineWidthMm: number
}

export function defaultEmTestSpec(profile: PrinterProfile): EmTestSpec {
  const nominal = profile.nozzleDiameterMm * NOMINAL_WIDTH_FACTOR
  const round2 = (v: number) => Math.round(v * 100) / 100
  const speedCap = DEFAULT_MAX_FLOW_MM3_S / (nominal * profile.layerHeightMm)
  return {
    pitchMinMm: round2(nominal * PITCH_MIN_FACTOR),
    pitchMaxMm: round2(nominal * PITCH_MAX_FACTOR),
    blockCount: 13,
    linesPerBlock: 10,
    lineLengthMm: 25,
    printSpeedMmS: Math.min(profile.travelSpeedMmS / 2, Math.floor(speedCap)),
    nominalLineWidthMm: nominal,
  }
}

export function pitchForBlock(spec: EmTestSpec, index: number): number {
  return spec.pitchMinMm + ((spec.pitchMaxMm - spec.pitchMinMm) * index) / (spec.blockCount - 1)
}

export interface EmBlock {
  index: number
  pitchMm: number
  x0Mm: number
  widthMm: number
  lineXsMm: number[]
}

export interface EmCouponGeometry {
  couponWidthMm: number
  couponHeightMm: number
  frameBandMm: number
  railWidthMm: number
  fiducialInsetMm: number
  fiducialSizeMm: number
  fiducials: { xMm: number; yMm: number }[]
  topRow: EmBlock[]
  bottomRow: EmBlock[]
  topRowY0Mm: number
  topRowY1Mm: number
  railY0Mm: number
  railY1Mm: number
  bottomRowY0Mm: number
  bottomRowY1Mm: number
}

function buildRow(spec: EmTestSpec, x0: number, reversed: boolean): EmBlock[] {
  const order = [...Array(spec.blockCount).keys()]
  if (reversed) order.reverse()
  const blocks: EmBlock[] = []
  let x = x0
  for (const index of order) {
    const pitch = pitchForBlock(spec, index)
    const width = (spec.linesPerBlock - 1) * pitch + spec.nominalLineWidthMm
    const first = x + spec.nominalLineWidthMm / 2
    const lineXsMm = [...Array(spec.linesPerBlock).keys()].map((j) => first + j * pitch)
    blocks.push({ index, pitchMm: pitch, x0Mm: x, widthMm: width, lineXsMm })
    x += width + BLOCK_GAP_MM
  }
  return blocks
}

export function emCouponGeometry(spec: EmTestSpec): EmCouponGeometry {
  const blocksWidth =
    [...Array(spec.blockCount).keys()]
      .map((i) => (spec.linesPerBlock - 1) * pitchForBlock(spec, i) + spec.nominalLineWidthMm)
      .reduce((a, b) => a + b, 0) +
    (spec.blockCount - 1) * BLOCK_GAP_MM
  const couponWidthMm = blocksWidth + 2 * INNER_MARGIN_MM + 2 * FRAME_BAND_MM
  const couponHeightMm = 2 * spec.lineLengthMm + RAIL_WIDTH_MM + 2 * FRAME_BAND_MM
  const inset = 4
  const size = 5
  const rowX0 = FRAME_BAND_MM + INNER_MARGIN_MM
  const topRowY0Mm = FRAME_BAND_MM
  const topRowY1Mm = topRowY0Mm + spec.lineLengthMm
  const railY0Mm = topRowY1Mm
  const railY1Mm = railY0Mm + RAIL_WIDTH_MM
  const bottomRowY0Mm = railY1Mm
  const bottomRowY1Mm = bottomRowY0Mm + spec.lineLengthMm
  return {
    couponWidthMm,
    couponHeightMm,
    frameBandMm: FRAME_BAND_MM,
    railWidthMm: RAIL_WIDTH_MM,
    fiducialInsetMm: inset,
    fiducialSizeMm: size,
    // Hole centers; the (min-x, min-y) origin corner deliberately has none (PA convention).
    fiducials: [
      { xMm: couponWidthMm - inset - size / 2, yMm: inset + size / 2 },
      { xMm: couponWidthMm - inset - size / 2, yMm: couponHeightMm - inset - size / 2 },
      { xMm: inset + size / 2, yMm: couponHeightMm - inset - size / 2 },
    ],
    topRow: buildRow(spec, rowX0, false),
    bottomRow: buildRow(spec, rowX0, true),
    topRowY0Mm,
    topRowY1Mm,
    railY0Mm,
    railY1Mm,
    bottomRowY0Mm,
    bottomRowY1Mm,
  }
}

export function volumetricFlowMm3S(spec: EmTestSpec, layerHeightMm: number): number {
  return spec.printSpeedMmS * spec.nominalLineWidthMm * layerHeightMm
}

export function accelRampMm(speedMmS: number, accelMmS2: number): number {
  return (speedMmS * speedMmS) / (2 * accelMmS2)
}
