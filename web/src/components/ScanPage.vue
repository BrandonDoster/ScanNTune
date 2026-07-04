<script setup lang="ts">
import { computed, reactive, ref } from 'vue'
import { useApp } from '../stores/useApp'
import { useCalibration } from '../stores/useCalibration'
import { readBytes, makePreviewUrl } from '../util/preview'
import { analyzeTwoScans } from '../workerClient'
import { defaultCouponSpec } from '../engine/types'
import type { CouponSpec } from '../engine/types'
import NumericField from './NumericField.vue'
import OverlayCanvas from './OverlayCanvas.vue'

const app = useApp()
const calibration = useCalibration()

const dpi = ref<number | null>(1200)
const baselineMm = ref<number | null>(100)
const gridN = ref<number | null>(5)

interface Slot {
  name: string
  bytes: Uint8Array | null
  preview: string | null
  loading: boolean
  failed: boolean
  note: string
  overlay: ImageBitmap | null
}
function makeSlot(): Slot {
  return { name: '', bytes: null, preview: null, loading: false, failed: false, note: '', overlay: null }
}
const slot1 = reactive(makeSlot())
const slot2 = reactive(makeSlot())

const busy = ref(false)
const isError = ref(false)
const statusText = ref('')

const isCalibrated = computed(() => calibration.calibration !== null)
const calibrationLine = computed(() =>
  isCalibrated.value
    ? `Calibrated at ${Math.round(calibration.calibration!.dpi)} dpi`
    : 'Optional: calibrate the scanner to report absolute size',
)
const scanDpiHint = computed(() =>
  isCalibrated.value ? `Scan both at ${Math.round(calibration.calibration!.dpi)} dpi.` : '',
)
const canAnalyze = computed(() => !busy.value && slot1.bytes !== null && slot2.bytes !== null)

function buildCoupon(): CouponSpec {
  return {
    ...defaultCouponSpec(),
    baselineMm: baselineMm.value ?? 100,
    gridN: gridN.value ?? 5,
  }
}

async function onPick(slot: Slot, event: Event): Promise<void> {
  const file = (event.target as HTMLInputElement).files?.[0] ?? null
  slot.failed = false
  slot.note = ''
  slot.overlay = null
  if (!file) {
    Object.assign(slot, makeSlot())
    return
  }
  slot.loading = true
  try {
    slot.name = file.name
    slot.bytes = await readBytes(file)
    slot.preview = await makePreviewUrl(file)
  } catch (e) {
    slot.note = 'Could not read the file.'
    console.error('Could not read the picked file', e)
  } finally {
    slot.loading = false
  }
}

async function analyze(): Promise<void> {
  if (!slot1.bytes || !slot2.bytes) return
  busy.value = true
  isError.value = false
  statusText.value = 'Analyzing both scans...'
  slot1.failed = slot2.failed = false
  slot1.note = slot2.note = ''
  slot1.overlay = slot2.overlay = null
  try {
    const coupon = buildCoupon()
    let pxPerMm: number | null
    if (calibration.calibration) pxPerMm = calibration.calibration.pxPerMm
    else if (dpi.value != null && dpi.value >= 50) pxPerMm = dpi.value / 25.4
    else pxPerMm = null

    const response = await analyzeTwoScans(slot1.bytes, slot2.bytes, { coupon, pxPerMm })
    if (response.ok) {
      statusText.value = ''
      app.showResults({
        result: response.result,
        overlayA: response.overlayA,
        overlayB: response.overlayB,
        coupon,
      })
    } else {
      const slot = response.isFirst ? slot1 : slot2
      slot.failed = true
      slot.note = response.message
      slot.overlay = response.overlay
      isError.value = true
      statusText.value =
        response.ringCount > 0
          ? `The ${response.isFirst ? 'first' : 'second'} scan: found ${response.ringCount} rings but could not align the coupon.`
          : 'No rings detected. The coupon may be out of frame or too faint.'
    }
  } catch (e) {
    isError.value = true
    statusText.value = `${e instanceof Error ? e.message : String(e)} Check the scan quality and that the two-solid marker is visible.`
    console.error('Two-scan analysis failed', e)
  } finally {
    busy.value = false
  }
}

function getCoupon(): void {
  const a = document.createElement('a')
  a.href = `${import.meta.env.BASE_URL}calibration_coupon.stl`
  a.download = 'calibration_coupon.stl'
  a.click()
}
</script>

<template>
  <v-container class="page">
    <h1 class="text-h5 mb-1">ScanNTune</h1>
    <p class="text-body-2 text-medium-emphasis mb-4">
      Auto-calibrate XY shrinkage and skew from a flatbed scan of the printed coupon.
    </p>

    <v-card variant="tonal" class="mb-4">
      <v-card-text class="d-flex align-center justify-space-between flex-wrap ga-2">
        <span>{{ calibrationLine }}</span>
        <v-btn
          data-testid="calibrate-btn"
          variant="text"
          prepend-icon="mdi-ruler"
          @click="app.goCalibration()"
        >
          {{ isCalibrated ? 'Recalibrate' : 'Calibrate scanner' }}
        </v-btn>
      </v-card-text>
    </v-card>

    <v-card class="mb-4">
      <v-card-item>
        <v-card-title class="text-subtitle-1">1. Print the coupon</v-card-title>
      </v-card-item>
      <v-card-text>
        <v-btn variant="tonal" prepend-icon="mdi-download" @click="getCoupon">Download coupon STL</v-btn>
        <div class="text-caption mt-2">Print flat, single material, then scan on a flatbed with a contrasting backing.</div>
      </v-card-text>
    </v-card>

    <v-card class="mb-4">
      <v-card-item>
        <v-card-title class="text-subtitle-1">2. Upload two scans</v-card-title>
        <v-card-subtitle v-if="scanDpiHint">{{ scanDpiHint }}</v-card-subtitle>
      </v-card-item>
      <v-card-text>
        <div class="slots">
          <div v-for="(slot, i) in [slot1, slot2]" :key="i" class="slot">
            <div class="text-subtitle-2 mb-1">
              {{ i === 0 ? 'First scan (as placed)' : 'Second scan (quarter-turned)' }}
            </div>
            <input
              type="file"
              accept="image/png,image/jpeg,image/tiff,image/webp"
              class="file-input"
              :data-testid="i === 0 ? 'scan1-input' : 'scan2-input'"
              @change="onPick(slot, $event)"
            />
            <v-progress-linear v-if="slot.loading" indeterminate class="mt-2" />
            <img v-if="slot.overlay === null && slot.preview" :src="slot.preview" class="preview mt-2" />
            <OverlayCanvas v-if="slot.overlay" :bitmap="slot.overlay" class="mt-2" />
            <v-alert v-if="slot.failed" type="warning" density="compact" class="mt-2" :text="slot.note" />
          </div>
        </div>
      </v-card-text>
    </v-card>

    <v-card class="mb-4">
      <v-card-item>
        <v-card-title class="text-subtitle-1">3. Settings</v-card-title>
      </v-card-item>
      <v-card-text class="fields">
        <NumericField
          v-if="!isCalibrated"
          v-model="dpi"
          label="Scanner DPI"
          :step="100"
          :min="50"
          hint="DPI / 25.4 = px per mm. Clear for anisotropy and skew only."
        />
        <NumericField v-model="baselineMm" label="Coupon baseline (mm)" :step="10" :min="10" />
        <NumericField v-model="gridN" label="Rings per side" :step="1" :min="2" />
      </v-card-text>
    </v-card>

    <v-btn
      data-testid="analyze-btn"
      color="primary"
      size="large"
      block
      :loading="busy"
      :disabled="!canAnalyze"
      @click="analyze"
    >
      Analyze both scans
    </v-btn>

    <v-alert
      v-if="statusText"
      :type="isError ? 'error' : 'info'"
      variant="tonal"
      class="mt-3"
      :text="statusText"
      data-testid="status"
    />
  </v-container>
</template>

<style scoped>
.page {
  max-width: 720px;
}
.slots {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
  gap: 16px;
}
.fields {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: 12px;
}
.file-input {
  width: 100%;
  font-size: 16px;
}
.preview {
  max-width: 100%;
  height: auto;
  border-radius: 6px;
}
</style>
