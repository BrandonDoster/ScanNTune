export type Firmware = 'Klipper' | 'Marlin' | 'RepRapFirmware'

export interface FilamentProfile {
  id: string
  name: string
  filamentType: string
  filamentDiameterMm: number
  nozzleTempC: number
  bedTempC: number
  chamberTempC: number
}

export interface PrinterProfile {
  id: string
  name: string
  firmware: Firmware
  bedWidthMm: number
  bedDepthMm: number
  nozzleDiameterMm: number
  filaments: FilamentProfile[]
  selectedFilamentId: string | null
  travelSpeedMmS: number
  printAccelMmS2: number
  /** Klipper square corner velocity, Marlin XY jerk, in mm/s. */
  squareCornerVelocityMmS: number
  layerHeightMm: number
  retractMm: number
  retractSpeedMmS: number
  startGcode: string
  pauseGcode: string
  endGcode: string
  /** The printer's current input shaper and pressure advance settings; absent means unknown. */
  inputShaperTypeX?: string
  inputShaperTypeY?: string
  inputShaperFreqXHz?: number
  inputShaperFreqYHz?: number
  inputShaperDampingX?: number
  inputShaperDampingY?: number
  pressureAdvance?: number
}

export function defaultFilamentProfile(): FilamentProfile {
  return {
    id: '',
    name: 'Default',
    filamentType: 'PLA',
    filamentDiameterMm: 1.75,
    nozzleTempC: 210,
    bedTempC: 60,
    chamberTempC: 0,
  }
}

export function defaultPrinterProfile(): PrinterProfile {
  return {
    id: '',
    name: 'My printer',
    firmware: 'Klipper',
    bedWidthMm: 220,
    bedDepthMm: 220,
    nozzleDiameterMm: 0.4,
    filaments: [defaultFilamentProfile()],
    selectedFilamentId: null,
    travelSpeedMmS: 150,
    printAccelMmS2: 3000,
    squareCornerVelocityMmS: 5,
    layerHeightMm: 0.2,
    retractMm: 0.8,
    retractSpeedMmS: 35,
    startGcode:
      'M140 S[first_layer_bed_temperature]\n' +
      'M104 S[first_layer_temperature]\n' +
      'M190 S[first_layer_bed_temperature]\n' +
      'M109 S[first_layer_temperature]\n' +
      'G28\n' +
      'G90',
    pauseGcode: 'PAUSE',
    endGcode: 'M104 S0\nM140 S0\nG91\nG1 Z10 F600\nG90\nM84',
  }
}
