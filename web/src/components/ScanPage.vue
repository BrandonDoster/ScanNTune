<script setup lang="ts">
import { computed, reactive, ref } from 'vue'
import { useApp } from '../stores/useApp'
import { useCalibration } from '../stores/useCalibration'
import { readBytes, makePreviewUrl } from '../util/preview'
import { analyzeTwoScans } from '../workerClient'
import { defaultCouponSpec } from '../engine/types'
import type { CouponSpec } from '../engine/types'
import NumericField from './NumericField.vue'
import DropSlot from './DropSlot.vue'

const app = useApp()
const calibration = useCalibration()

const dpi = ref<number | null>(1200)
const baselineMm = ref<number | null>(100)
const gridN = ref<number | null>(5)

interface Slot {
  bytes: Uint8Array | null
  preview: string | null
  loading: boolean
  failed: boolean
  note: string
  overlay: ImageBitmap | null
}
function makeSlot(): Slot {
  return { bytes: null, preview: null, loading: false, failed: false, note: '', overlay: null }
}
const slot1 = reactive(makeSlot())
const slot2 = reactive(makeSlot())

const busy = ref(false)
const isError = ref(false)
const statusText = ref('')

const isCalibrated = computed(() => calibration.calibration !== null)
const calibrationLine = computed(() =>
  isCalibrated.value
    ? `Calibrated · ${Math.round(calibration.calibration!.dpi)} dpi. Absolute scale is anchored to your scanner.`
    : 'Optional. Calibrate to report absolute size; skip it for anisotropy and skew only.',
)
const scanDpiHint = computed(() =>
  isCalibrated.value ? `Scan both at ${Math.round(calibration.calibration!.dpi)} dpi.` : '',
)
const canAnalyze = computed(() => !busy.value && slot1.bytes !== null && slot2.bytes !== null)

function buildCoupon(): CouponSpec {
  return { ...defaultCouponSpec(), baselineMm: baselineMm.value ?? 100, gridN: gridN.value ?? 5 }
}

async function handleFile(slot: Slot, file: File): Promise<void> {
  slot.failed = false
  slot.note = ''
  slot.overlay = null
  slot.loading = true
  try {
    slot.bytes = await readBytes(file)
  } catch (e) {
    slot.failed = true
    slot.note = 'Could not read the file.'
    console.error('Could not read the picked file', e)
    slot.loading = false
    return
  }
  // A preview failure is not fatal: the raw bytes are already loaded, so analysis can still run.
  try {
    slot.preview = await makePreviewUrl(file)
  } catch (e) {
    console.warn('Could not render a preview for the picked file', e)
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
    <header class="mb-4">
      <h1 class="text-h5 font-weight-bold">Two-scan calibration</h1>
      <p class="text-body-2 text-medium-emphasis mt-1">
        Scan the coupon, turn it a quarter-turn, and scan again. Combining the two cancels your scanner's own
        X/Y stretch and skew.
      </p>
    </header>

    <!-- 1. Calibrate scanner -->
    <section class="step mb-3">
      <div class="step-row">
        <div class="step-head">
          <span class="num">1</span><span class="step-title">Calibrate scanner</span>
        </div>
        <v-btn
          data-testid="calibrate-btn"
          :variant="isCalibrated ? 'text' : 'flat'"
          :color="isCalibrated ? undefined : 'primary'"
          size="small"
          @click="app.goCalibration()"
        >
          {{ isCalibrated ? 'Recalibrate' : 'Calibrate scanner' }}
        </v-btn>
      </div>
      <div class="status-line">
        <v-icon :color="isCalibrated ? 'success' : 'warning'" size="16" class="mr-2">
          {{ isCalibrated ? 'mdi-check-circle' : 'mdi-alert-circle-outline' }}
        </v-icon>
        <span class="text-medium-emphasis">{{ calibrationLine }}</span>
      </div>
    </section>

    <!-- 2. Print the coupon -->
    <section class="step mb-3">
      <div class="step-row">
        <div class="step-head">
          <span class="num">2</span><span class="step-title">Print the coupon</span>
        </div>
        <v-btn variant="tonal" size="small" prepend-icon="mdi-download" @click="getCoupon">Download coupon STL</v-btn>
      </div>
      <p class="tip">
        100 mm model, printed flat. It has to contrast with the scan background: a white coupon on a white lid
        will not work, so back it with a coloured sheet of paper.
      </p>
    </section>

    <!-- 3. Add the two scans -->
    <section class="step mb-3">
      <div class="step-head mb-1">
        <span class="num">3</span><span class="step-title">Add the two scans</span>
      </div>
      <p v-if="scanDpiHint" class="tip mb-3">{{ scanDpiHint }}</p>

      <div class="slots">
        <DropSlot
          class="slot-fill"
          label="First scan"
          sublabel="as placed"
          testid="scan1-input"
          :preview="slot1.preview"
          :failed="slot1.failed"
          :note="slot1.note"
          :loading="slot1.loading"
          :overlay="slot1.overlay"
          @pick="handleFile(slot1, $event)"
        />
        <div class="connector">
          <v-icon class="arrow" color="primary" size="26">mdi-arrow-right</v-icon>
          <span class="deg">90°</span>
        </div>
        <DropSlot
          class="slot-fill"
          label="Second scan"
          sublabel="quarter-turned"
          testid="scan2-input"
          :rotate="90"
          :preview="slot2.preview"
          :failed="slot2.failed"
          :note="slot2.note"
          :loading="slot2.loading"
          :overlay="slot2.overlay"
          @pick="handleFile(slot2, $event)"
        />
      </div>

      <div class="fields mt-4">
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
      </div>

      <v-btn
        data-testid="analyze-btn"
        color="primary"
        size="large"
        block
        class="mt-4"
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

      <p class="text-caption text-medium-emphasis text-center mt-3">
        The two solid rings mark the coupon's corner. The app uses them to align both scans.
      </p>
    </section>
  </v-container>
</template>

<style scoped>
.page {
  max-width: 760px;
}
.step {
  background: rgb(var(--v-theme-surface-light));
  border-radius: 12px;
  padding: 16px;
}
.step-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  flex-wrap: wrap;
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
.status-line {
  display: flex;
  align-items: center;
  margin-top: 8px;
  font-size: 13px;
}
.tip {
  font-size: 12.5px;
  color: rgba(var(--v-theme-on-surface), 0.6);
  margin-top: 8px;
}
.slots {
  display: flex;
  align-items: stretch;
  gap: 12px;
}
.slot-fill {
  flex: 1 1 0;
  min-width: 0;
}
.connector {
  flex: 0 0 auto;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 2px;
}
.connector .arrow {
  transition: transform 0.2s ease;
}
.deg {
  font-size: 11px;
  color: rgba(var(--v-theme-on-surface), 0.6);
}

/* When the slots stack (narrow screen), the connector sits between them and the arrow points down. */
@media (max-width: 560px) {
  .slots {
    flex-direction: column;
  }
  .connector .arrow {
    transform: rotate(90deg);
  }
}
.fields {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
}
.fields > * {
  flex: 1 1 160px;
}
</style>
