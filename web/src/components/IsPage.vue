<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useApp } from '../stores/useApp'
import { useCalibration } from '../stores/useCalibration'
import { usePrinterProfiles } from '../stores/usePrinterProfiles'
import {
  generateIsGcodeWithReport,
  HIGH_FLOW_WARNING_THRESHOLD_MM3_S,
} from '../engine/is/gcodeGenerator'
import {
  defaultIsTestSpec,
  fitSpecToBed,
  MIN_CORNER_SPEED_MM_S,
  rampWarnings,
  validateIsSpec,
  type IsAxis,
  type IsTestSpec,
} from '../engine/is/types'
import { isCouponGeometry } from '../engine/is/couponGeometry'
import { NOMINAL_WIDTH_FACTOR } from '../engine/gcode/emitter'
import { defaultPrinterProfile } from '../engine/pa/types'
import PrinterProfileCard from './PrinterProfileCard.vue'
import IsGuideDiagram from './IsGuideDiagram.vue'
import NumericField from './NumericField.vue'

const app = useApp()
const store = usePrinterProfiles()

// The scan step (arriving later) measures the ringing wavelength in true millimetres, which
// needs the card-derived px/mm; generation itself does not depend on the calibration.
const calibration = useCalibration()
const isCalibrated = computed(() => calibration.calibration !== null)
const calibrationLine = computed(() =>
  isCalibrated.value
    ? `${Math.round(calibration.calibration!.dpi)} dpi`
    : 'Not calibrated',
)

// Spec defaults follow the selected printer; the fields start prefilled with them and
// refill whenever another printer is selected (edits between switches are one-shot).
const specDefaults = computed(() => defaultIsTestSpec(store.selected ?? defaultPrinterProfile()))
const tierSpeed = ref<number | null>(specDefaults.value.speedsMmS[0])
const cornerSpeed = ref<number | null>(specDefaults.value.cornerSpeedMmS)
const linesPerSpeed = ref<number | null>(specDefaults.value.linesPerSpeed)
const measuredLine = ref<number | null>(specDefaults.value.measuredLineMm)
const linePitch = ref<number | null>(specDefaults.value.linePitchMm)
type AxisChoice = 'both' | 'x' | 'y'
const axisChoice = ref<AxisChoice>('both')
const axisItems = [
  { title: 'X and Y', value: 'both' },
  { title: 'X only', value: 'x' },
  { title: 'Y only', value: 'y' },
]

watch(
  () => store.selected?.id,
  () => {
    tierSpeed.value = specDefaults.value.speedsMmS[0]
    cornerSpeed.value = specDefaults.value.cornerSpeedMmS
    linesPerSpeed.value = specDefaults.value.linesPerSpeed
    measuredLine.value = specDefaults.value.measuredLineMm
    linePitch.value = specDefaults.value.linePitchMm
    axisChoice.value = 'both'
  },
)

const spec = computed<IsTestSpec>(() => {
  const corner = cornerSpeed.value ?? specDefaults.value.cornerSpeedMmS
  return {
    ...specDefaults.value,
    speedsMmS: [tierSpeed.value ?? specDefaults.value.speedsMmS[0]],
    cornerSpeedMmS: corner,
    // The square corner velocity follows the corner speed: the corner is only taken
    // without deceleration when the firmware allows at least that junction speed.
    squareCornerVelocityMmS: corner,
    linesPerSpeed: linesPerSpeed.value ?? specDefaults.value.linesPerSpeed,
    measuredLineMm: measuredLine.value ?? specDefaults.value.measuredLineMm,
    linePitchMm: linePitch.value ?? specDefaults.value.linePitchMm,
    axes: (axisChoice.value === 'both' ? ['x', 'y'] : [axisChoice.value]) as IsAxis[],
  }
})

// The spec as the generator will actually print it: validated, then shrunk to the
// configured bed with a user-worded note per reduction. Validation and fitting failures
// both surface as the error text.
const fitted = computed<{ spec: IsTestSpec; notes: string[] } | { error: string }>(() => {
  try {
    validateIsSpec(spec.value)
    return fitSpecToBed(spec.value, store.selected ?? defaultPrinterProfile())
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) }
  }
})
const fitError = computed(() => ('error' in fitted.value ? fitted.value.error : ''))
const fittedSpec = computed(() => ('spec' in fitted.value ? fitted.value.spec : null))
const fitNotes = computed(() => ('notes' in fitted.value ? fitted.value.notes : []))

const tiersText = computed(() =>
  fittedSpec.value ? `speeds ${fittedSpec.value.speedsMmS.join(' / ')} mm/s` : '',
)
const footprintText = computed(() => {
  if (!fittedSpec.value) return ''
  const g = isCouponGeometry(fittedSpec.value)
  return `coupon ${Math.round(g.couponWidthMm)} x ${Math.round(g.couponHeightMm)} mm`
})
const rampNotes = computed(() => (fittedSpec.value ? rampWarnings(fittedSpec.value) : []))
// The acceleration is not editable here: it comes from the printer profile, floored by
// the generator when the profile value is too weak for a readable trace.
const accelNote = computed(() => {
  const p = store.selected
  if (!p || !fittedSpec.value) return ''
  const a = fittedSpec.value.accelMmS2
  return a > p.printAccelMmS2
    ? `The test accelerates at ${a} mm/s^2, raised above the profile's ` +
      `${p.printAccelMmS2} mm/s^2 because a weaker ramp leaves too faint a ringing trace.`
    : `The test accelerates at the profile's ${a} mm/s^2 print acceleration.`
})
const highFlowText = computed(() => {
  const s = fittedSpec.value
  const p = store.selected
  if (!s || !p) return ''
  const nominal = p.nozzleDiameterMm * NOMINAL_WIDTH_FACTOR
  const flow = Math.max(...s.speedsMmS) * nominal * p.layerHeightMm
  if (flow <= HIGH_FLOW_WARNING_THRESHOLD_MM3_S) return ''
  return (
    `The selected line speed extrudes ${flow.toFixed(1)} mm^3/s of filament; a typical ` +
    `hotend melts about ${HIGH_FLOW_WARNING_THRESHOLD_MM3_S} mm^3/s and thins the lines ` +
    'above that. The ringing wavelength is still readable from slightly thinned lines.'
  )
})

const generateError = ref('')
const unknownVariables = ref<string[]>([])
const templateWarnings = ref<string[]>([])
const canGenerate = computed(() => store.selected !== null && store.selectedFilament !== null)

function sanitizeName(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '') || 'printer'
}
const filename = computed(() =>
  store.selected ? `is_resonance_test_${sanitizeName(store.selected.name)}.gcode` : '',
)

function generate(): void {
  const profile = store.selected
  const filament = store.selectedFilament
  if (!profile || !filament) return
  generateError.value = ''
  unknownVariables.value = []
  templateWarnings.value = []
  let gcode: string
  try {
    const report = generateIsGcodeWithReport(profile, filament, spec.value)
    gcode = report.gcode
    unknownVariables.value = report.unknownVariables
    templateWarnings.value = report.warnings
  } catch (e) {
    generateError.value = e instanceof Error ? e.message : String(e)
    console.error('Input shaper G-code generation failed', e)
    return
  }
  const blob = new Blob([gcode], { type: 'text/x-gcode' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename.value
  a.click()
  URL.revokeObjectURL(url)
}
</script>

<template>
  <v-container class="page">
    <header class="mb-4">
      <h1 class="text-h5 font-weight-bold">Input shaper calibration</h1>
      <p class="text-body-2 text-medium-emphasis mt-1">
        Print a resonance test coupon whose lines record the ringing after a sharp corner. A
        scan of the coupon will measure the resonance frequency per axis; this flow currently
        generates the test print, and the scan analysis arrives in a later update.
      </p>
    </header>

    <!-- 1. Calibrate scanner (needed for the later scan step, not for generation) -->
    <section class="step mb-3">
      <div class="step-row">
        <div class="step-head">
          <span class="num">1</span><span class="step-title">Calibrate scanner</span>
          <span class="status-inline">
            <v-icon :color="isCalibrated ? 'success' : 'warning'" size="15">
              {{ isCalibrated ? 'mdi-check-circle' : 'mdi-alert-circle-outline' }}
            </v-icon>
            <span class="text-medium-emphasis">{{ calibrationLine }}</span>
          </span>
        </div>
        <v-btn
          data-testid="is-calibrate-btn"
          :variant="isCalibrated ? 'text' : 'flat'"
          :color="isCalibrated ? undefined : 'primary'"
          size="small"
          @click="app.goCalibration()"
        >
          {{ isCalibrated ? 'Recalibrate' : 'Calibrate scanner' }}
        </v-btn>
      </div>
      <p v-if="!isCalibrated" class="text-body-2 text-medium-emphasis mt-2 mb-0">
        Needed before the scan step. The analysis measures the ringing in millimetres, which
        needs the true scanner resolution from the card calibration. Generating the test
        print works without it.
      </p>
    </section>

    <!-- 2. Printer profile -->
    <PrinterProfileCard :step="2" />

    <!-- 3. Test settings -->
    <section class="step mb-3">
      <div class="step-head mb-2">
        <span class="num">3</span><span class="step-title">Test settings</span>
      </div>
      <div class="diagram-wrap mb-3">
        <IsGuideDiagram />
      </div>
      <div class="field-group">
        <span class="group-label">Speeds</span>
        <p class="tip mt-0 mb-2">
          The corner between the run-up and the measured line is taken at the corner speed
          without deceleration. Higher values ring the frame harder and make the waves
          easier to read; lower the corner speed for lightly built printers. The line
          speed is the cruise speed of the measured lines and cannot be below the corner
          speed.
        </p>
        <div class="fields">
          <NumericField
            v-model="tierSpeed"
            label="Line speed (mm/s)"
            :step="10"
            :min="cornerSpeed ?? MIN_CORNER_SPEED_MM_S"
            data-testid="is-tier-speed"
          />
          <NumericField
            v-model="cornerSpeed"
            label="Corner speed (mm/s)"
            :step="10"
            :min="MIN_CORNER_SPEED_MM_S"
            data-testid="is-corner-speed"
          />
        </div>
        <p v-if="accelNote" class="tip mb-0">{{ accelNote }}</p>
      </div>
      <div class="field-group mt-1">
        <span class="group-label">Test lines</span>
        <p class="tip mt-0 mb-2">
          The clean read length is the guaranteed undisturbed stretch of every line after
          the corner's acceleration ramp. It should cover at least five wavelengths of the
          lowest resonance of interest at the tier speed. The printed lines are longer:
          they continue into the zone where the two axis groups cross.
        </p>
        <div class="fields">
          <NumericField v-model="linesPerSpeed" label="Lines per speed" :step="1" :min="3" />
          <NumericField v-model="measuredLine" label="Clean read length (mm)" :step="5" :min="20" />
          <NumericField v-model="linePitch" label="Line pitch (mm)" :step="0.1" :min="0.1" :precision="2" />
        </div>
      </div>
      <div class="field-group mt-1">
        <span class="group-label">Axes</span>
        <div class="fields">
          <v-select
            v-model="axisChoice"
            :items="axisItems"
            label="Axes to test"
            density="comfortable"
            hide-details
            data-testid="is-axes"
          />
        </div>
      </div>
      <div class="facts mt-2">
        <v-chip
          v-if="tiersText"
          size="small"
          variant="tonal"
          prepend-icon="mdi-speedometer"
          data-testid="is-tiers"
        >
          {{ tiersText }}
        </v-chip>
        <v-chip
          v-if="footprintText"
          size="small"
          variant="tonal"
          prepend-icon="mdi-ruler-square"
          data-testid="is-footprint"
        >
          {{ footprintText }}
        </v-chip>
        <span v-if="!canGenerate" class="tip mt-0">Choose a printer profile first.</span>
      </div>
      <v-alert
        v-if="fitError"
        type="error"
        variant="tonal"
        density="compact"
        class="mt-3 soft-alert"
        :text="fitError"
        data-testid="is-fit-error"
      />
      <v-alert
        v-if="fitNotes.length > 0"
        type="info"
        variant="tonal"
        density="compact"
        class="mt-3 soft-alert"
        :text="fitNotes.join(' ')"
        data-testid="is-fit-notes"
      />
      <v-alert
        v-if="rampNotes.length > 0"
        type="warning"
        variant="tonal"
        density="compact"
        class="mt-3 soft-alert"
        :text="rampNotes.join(' ')"
        data-testid="is-ramp-warning"
      />
      <v-alert
        v-if="highFlowText"
        type="warning"
        variant="tonal"
        density="compact"
        class="mt-3 soft-alert"
        data-testid="is-flow-warning"
        :text="highFlowText"
      />
    </section>

    <!-- 4. Generate -->
    <section class="step mb-3">
      <div class="step-head mb-2">
        <span class="num">4</span><span class="step-title">Generate</span>
      </div>
      <div class="gen-row">
        <v-btn
          color="primary"
          prepend-icon="mdi-download"
          :disabled="!canGenerate"
          data-testid="is-generate"
          @click="generate"
        >
          Generate G-code
        </v-btn>
        <span v-if="filename" class="tip mt-0">{{ filename }}</span>
      </div>
      <v-alert
        v-if="generateError"
        type="error"
        variant="tonal"
        class="mt-3"
        :text="generateError"
        data-testid="is-generate-error"
      />
      <v-alert
        v-if="unknownVariables.length > 0"
        type="warning"
        variant="tonal"
        class="mt-3"
        :text="`Unknown slicer variables left as-is: ${unknownVariables.join(', ')}. Replace them with real values if your firmware does not resolve them.`"
        data-testid="is-unknown-variables-warning"
      />
      <v-alert
        v-if="templateWarnings.length > 0"
        type="warning"
        variant="tonal"
        class="mt-3"
        :text="templateWarnings.join(' ')"
        data-testid="is-template-warnings"
      />
    </section>

    <p class="tip">
      <v-icon size="14" class="mr-1">mdi-information-outline</v-icon>
      Print the coupon with the downloaded file and keep the finished part flat. A later
      update adds the scan step that reads the resonance frequency from it.
    </p>
  </v-container>
</template>

<style scoped>
.step-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  flex-wrap: wrap;
}
.status-inline {
  display: flex;
  align-items: center;
  gap: 5px;
  font-size: 12.5px;
}
.page {
  max-width: 760px;
}
.step {
  background: rgb(var(--v-theme-surface-light));
  border-radius: 12px;
  padding: 16px;
}
.step-head {
  display: flex;
  align-items: center;
  gap: 8px;
}
.num {
  color: rgb(var(--v-theme-primary));
  font-weight: 600;
  font-size: 14px;
}
.step-title {
  font-weight: 500;
  font-size: 14px;
}
.tip {
  font-size: 12.5px;
  color: rgba(var(--v-theme-on-surface), 0.6);
  margin-top: 8px;
}
.diagram-wrap {
  display: flex;
  justify-content: center;
}
.fields {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
}
.fields > * {
  flex: 1 1 160px;
}
.field-group .group-label {
  display: block;
  font-size: 0.72rem;
  font-weight: 600;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  opacity: 0.55;
  margin-bottom: 4px;
}
.facts {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}
.soft-alert {
  font-size: 0.875rem;
}
.gen-row {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
}
</style>
