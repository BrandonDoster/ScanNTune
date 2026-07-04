<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useApp } from '../stores/useApp'
import { useCalibration } from '../stores/useCalibration'
import { readBytes } from '../util/preview'
import { measureCardScan } from '../workerClient'
import { signedFixed } from '../util/format'
import NumericField from './NumericField.vue'

const app = useApp()
const calibration = useCalibration()

const measuredMm = ref<number | null>(calibration.calibration?.referenceMm ?? 85.5)
const dpi = ref<number | null>(calibration.calibration?.dpi ?? 600)

const detecting = ref(false)
const isError = ref(false)
const statusText = ref('')
const saved = ref(false)

const measuredWidthPx = ref<number | null>(calibration.calibration?.measuredWidthPx ?? null)
const straightnessPx = ref(calibration.calibration?.straightnessPx ?? 0)
const parallelismDegrees = ref(calibration.calibration?.parallelismDegrees ?? 0)
const hasResult = ref(calibration.calibration !== null)

const canUpload = computed(() => (measuredMm.value ?? 0) > 0 && (dpi.value ?? 0) >= 50)

const pxPerMm = computed(() =>
  measuredWidthPx.value && measuredMm.value ? measuredWidthPx.value / measuredMm.value : 0,
)
const effectiveDpi = computed(() => pxPerMm.value * 25.4)
const detectedMm = computed(() =>
  measuredWidthPx.value && dpi.value ? measuredWidthPx.value / (dpi.value / 25.4) : 0,
)
const sizeDiff = computed(() => Math.abs(detectedMm.value - (measuredMm.value ?? 0)))
const sizeCheckOk = computed(() => hasResult.value && sizeDiff.value < 0.3)
const percentVsNominal = computed(() =>
  dpi.value ? (pxPerMm.value / (dpi.value / 25.4) - 1) * 100 : 0,
)

async function onPick(event: Event): Promise<void> {
  const file = (event.target as HTMLInputElement).files?.[0] ?? null
  if (!canUpload.value) {
    isError.value = true
    statusText.value = 'Enter your measured size and a DPI of at least 50 first.'
    return
  }
  if (!file) return
  detecting.value = true
  isError.value = false
  saved.value = false
  hasResult.value = false
  statusText.value = 'Detecting the card...'
  try {
    const bytes = await readBytes(file)
    const r = await measureCardScan(bytes, measuredMm.value!, dpi.value!)
    if (!r.success) {
      isError.value = true
      statusText.value = r.message ?? "Couldn't detect the card in that scan."
      return
    }
    measuredWidthPx.value = r.measuredWidthPx
    straightnessPx.value = r.straightnessPx
    parallelismDegrees.value = r.parallelismDegrees
    hasResult.value = true
    statusText.value = ''
    maybeSave()
  } catch (e) {
    isError.value = true
    statusText.value = `Couldn't read the scan: ${e instanceof Error ? e.message : String(e)}`
    console.error('Card detection failed', e)
  } finally {
    detecting.value = false
  }
}

function maybeSave(): void {
  if (
    sizeCheckOk.value &&
    measuredWidthPx.value != null &&
    measuredMm.value != null &&
    dpi.value != null
  ) {
    calibration.save({
      pxPerMm: pxPerMm.value,
      dpi: dpi.value,
      referenceMm: measuredMm.value,
      measuredWidthPx: measuredWidthPx.value,
      straightnessPx: straightnessPx.value,
      parallelismDegrees: parallelismDegrees.value,
      calibratedUtc: new Date().toISOString(),
    })
    saved.value = true
  } else {
    saved.value = false
  }
}

// Editing mm/dpi after a detection re-derives the figures (and re-saves) without a new scan.
watch([measuredMm, dpi], () => {
  if (hasResult.value) maybeSave()
})
</script>

<template>
  <v-container class="page">
    <div class="d-flex align-center mb-3">
      <v-btn variant="text" prepend-icon="mdi-arrow-left" data-testid="back-btn" @click="app.goScan()">Back</v-btn>
    </div>
    <h1 class="text-h5 mb-1">Calibrate the scanner</h1>
    <p class="text-body-2 text-medium-emphasis mb-4">
      Scan a card of known length (a bank card is 85.60 mm) to measure your scanner's true px/mm.
    </p>

    <v-card class="mb-4">
      <v-card-text class="fields">
        <NumericField v-model="measuredMm" label="Measured long side (mm)" :step="0.02" :min="1" />
        <NumericField v-model="dpi" label="Scan DPI" :step="100" :min="50" />
      </v-card-text>
    </v-card>

    <v-card class="mb-4">
      <v-card-item><v-card-title class="text-subtitle-1">Upload the card scan</v-card-title></v-card-item>
      <v-card-text>
        <input
          type="file"
          accept="image/png,image/jpeg,image/tiff,image/webp"
          class="file-input"
          data-testid="card-input"
          @change="onPick"
        />
        <v-progress-linear v-if="detecting" indeterminate class="mt-2" />
      </v-card-text>
    </v-card>

    <v-card v-if="hasResult" class="mb-4" data-testid="calibration-result">
      <v-card-text>
        <div class="tiles">
          <div class="tile">
            <div class="text-caption">px / mm</div>
            <div class="text-h6" data-testid="pxpermm">{{ pxPerMm.toFixed(3) }}</div>
          </div>
          <div class="tile">
            <div class="text-caption">Effective DPI</div>
            <div class="text-h6">{{ effectiveDpi.toFixed(0) }}</div>
          </div>
          <div class="tile">
            <div class="text-caption">vs nominal</div>
            <div class="text-h6">{{ signedFixed(percentVsNominal, 3) }} %</div>
          </div>
        </div>
        <div class="text-body-2 mt-3">
          Detected {{ detectedMm.toFixed(2) }} mm
          <span v-if="sizeCheckOk">, matches your {{ (measuredMm ?? 0).toFixed(2) }} mm.</span>
          <span v-else class="text-warning">
            but you entered {{ (measuredMm ?? 0).toFixed(2) }} mm. Check the DPI or the measured value.
          </span>
        </div>
        <div class="text-caption text-medium-emphasis mt-1">
          Edges straight to {{ straightnessPx.toFixed(2) }} px, parallel to {{ parallelismDegrees.toFixed(3) }}°.
        </div>
        <v-alert
          v-if="saved"
          type="success"
          density="compact"
          variant="tonal"
          class="mt-3"
          text="Calibration saved."
          data-testid="saved"
        />
      </v-card-text>
    </v-card>

    <v-alert v-if="statusText" :type="isError ? 'error' : 'info'" variant="tonal" :text="statusText" />
  </v-container>
</template>

<style scoped>
.page {
  max-width: 640px;
}
.fields {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: 12px;
}
.tiles {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 12px;
}
.tile {
  text-align: center;
}
.file-input {
  width: 100%;
  font-size: 16px;
}
</style>
