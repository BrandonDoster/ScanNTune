export type Firmware = 'Klipper' | 'Marlin' | 'RepRapFirmware'

export interface PrinterProfile {
  id: string
  name: string
  firmware: Firmware
  bedWidthMm: number
  bedDepthMm: number
  nozzleDiameterMm: number
  filamentDiameterMm: number
  nozzleTempC: number
  bedTempC: number
  travelSpeedMmS: number
  layerHeightMm: number
  retractMm: number
  retractSpeedMmS: number
  startGcode: string
  pauseGcode: string
  endGcode: string
}

export interface PaTestSpec {
  lineCount: number
  paStart: number
  paEnd: number
  slowSegmentMm: number
  fastSegmentMm: number
  slowSpeedMmS: number
  fastSpeedMmS: number
  linePitchMm: number
  marginMm: number
  lineWidthMm: number
}

export interface Fiducial {
  xMm: number
  yMm: number
}

export interface CouponGeometry {
  baseWidthMm: number
  baseHeightMm: number
  fiducialInsetMm: number
  fiducialSizeMm: number
  fiducials: Fiducial[]
  /** Line-local x of the two speed transitions. */
  transitionXsMm: [number, number]
  /** Origin (min-x, min-y in coupon frame) of line i's start point. */
  lineStartXMm: number
  lineStartYMm: (index: number) => number
}

export interface PaLineScore {
  index: number
  paValue: number
  /** RMS width deviation in transition windows, in mm of width. */
  score: number
  medianWidthMm: number
  measured: boolean
}

export interface PaResult {
  success: boolean
  failureReason: string | null
  lines: PaLineScore[]
  /** Discrete best line index, null on failure. */
  bestLineIndex: number | null
  /** Parabolic-interpolated PA at the score minimum, null on failure. */
  bestPa: number | null
  flipped: boolean
  rotationQuarterTurns: number
}

export function defaultPrinterProfile(): PrinterProfile {
  return {
    id: '',
    name: 'My printer',
    firmware: 'Klipper',
    bedWidthMm: 220,
    bedDepthMm: 220,
    nozzleDiameterMm: 0.4,
    filamentDiameterMm: 1.75,
    nozzleTempC: 210,
    bedTempC: 60,
    travelSpeedMmS: 150,
    layerHeightMm: 0.2,
    retractMm: 0.8,
    retractSpeedMmS: 35,
    startGcode: 'G28\nG90\nM83',
    pauseGcode: 'PAUSE',
    endGcode: 'M104 S0\nM140 S0\nG91\nG1 Z10 F600\nG90\nM84',
  }
}

export function defaultPaTestSpec(): PaTestSpec {
  return {
    lineCount: 16,
    paStart: 0,
    paEnd: 0.06,
    slowSegmentMm: 20,
    fastSegmentMm: 40,
    slowSpeedMmS: 25,
    fastSpeedMmS: 100,
    linePitchMm: 4,
    marginMm: 8,
    lineWidthMm: 0.45,
  }
}

export function paValueForLine(spec: PaTestSpec, index: number): number {
  return spec.paStart + ((spec.paEnd - spec.paStart) * index) / (spec.lineCount - 1)
}

export function couponGeometry(spec: PaTestSpec): CouponGeometry {
  const lineLen = 2 * spec.slowSegmentMm + spec.fastSegmentMm
  const baseWidthMm = lineLen + 2 * spec.marginMm
  const baseHeightMm = (spec.lineCount - 1) * spec.linePitchMm + 2 * spec.marginMm
  const inset = 4
  const size = 5
  return {
    baseWidthMm,
    baseHeightMm,
    fiducialInsetMm: inset,
    fiducialSizeMm: size,
    // Hole centers; the (min-x, min-y) origin corner deliberately has none.
    fiducials: [
      { xMm: baseWidthMm - inset - size / 2, yMm: inset + size / 2 },
      { xMm: baseWidthMm - inset - size / 2, yMm: baseHeightMm - inset - size / 2 },
      { xMm: inset + size / 2, yMm: baseHeightMm - inset - size / 2 },
    ],
    transitionXsMm: [spec.slowSegmentMm, spec.slowSegmentMm + spec.fastSegmentMm],
    lineStartXMm: spec.marginMm,
    lineStartYMm: (index: number) => spec.marginMm + index * spec.linePitchMm,
  }
}
