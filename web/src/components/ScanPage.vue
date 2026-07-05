<script setup lang="ts">
import { computed, ref } from 'vue'
import { useApp } from '../stores/useApp'
import { useCalibration } from '../stores/useCalibration'
import { readBytes, makePreviewUrl } from '../util/preview'
import { analyzeScans } from '../workerClient'
import { defaultCouponSpec } from '../engine/types'
import type { CouponSpec } from '../engine/types'
import NumericField from './NumericField.vue'
import CouponGlyph from './CouponGlyph.vue'

const app = useApp()
const calibration = useCalibration()

const dpi = ref<number | null>(1200)
const baselineMm = ref<number | null>(100)
const gridN = ref<number | null>(5)

interface ScanItem {
  id: number
  name: string
  bytes: Uint8Array
  preview: string | null
}
let nextId = 0
const scans = ref<ScanItem[]>([])

const busy = ref(false)
const isError = ref(false)
const statusText = ref('')
const notes = ref<string[]>([])

const isCalibrated = computed(() => calibration.calibration !== null)
const calibrationLine = computed(() =>
  isCalibrated.value
    ? `Calibrated · ${Math.round(calibration.calibration!.dpi)} dpi. Absolute scale is anchored to your scanner.`
    : 'Optional. Calibrate to report absolute size; skip it for anisotropy and skew only.',
)
const scanDpiHint = computed(() =>
  isCalibrated.value ? `Scan every plate at ${Math.round(calibration.calibration!.dpi)} dpi.` : '',
)
const loading = ref(false)
// Analyze stays disabled while a batch of files is still being read, so a user (or a test) can't fire
// analysis on a partially-loaded set and silently drop the scans that hadn't finished loading yet.
// A valid batch is an EVEN number (each plate is a flat + quarter-turn pair) from 2 to 6 (at most the
// three planes). Also stays disabled while a batch is still loading.
const canAnalyze = computed(() => {
  const n = scans.value.length
  return !busy.value && !loading.value && n >= 2 && n <= 6 && n % 2 === 0
})
// The button always states what's expected: add the minimum, complete the odd pair, or trim the excess.
const analyzeLabel = computed(() => {
  const n = scans.value.length
  if (n === 0) return 'Add 2 scans to analyze'
  if (n > 6) return `Remove ${n - 6} scan${n - 6 === 1 ? '' : 's'} (6 max)`
  if (n % 2 === 1) return 'Add 1 more scan'
  return `Analyze ${n} scans`
})

const plates: ReadonlyArray<{ key: string; label: string; file: string }> = [
  { key: 'xy', label: 'XY plate (flat)', file: 'calibration_coupon_xy.stl' },
  { key: 'xz', label: 'XZ plate (standing)', file: 'calibration_coupon_xz.stl' },
  { key: 'yz', label: 'YZ plate (standing)', file: 'calibration_coupon_yz.stl' },
]

function buildCoupon(): CouponSpec {
  return { ...defaultCouponSpec(), baselineMm: baselineMm.value ?? 100, gridN: gridN.value ?? 5 }
}

async function onPick(e: Event): Promise<void> {
  const input = e.target as HTMLInputElement
  const files = Array.from(input.files ?? [])
  // Clear the input so picking the same file again still fires change.
  input.value = ''
  loading.value = true
  try {
    for (const file of files) {
      try {
        const bytes = await readBytes(file)
        let preview: string | null = null
        try {
          preview = await makePreviewUrl(file)
        } catch (err) {
          console.warn('Could not render a preview for a picked scan', err)
        }
        scans.value = [...scans.value, { id: nextId++, name: file.name, bytes, preview }]
      } catch (err) {
        console.error('Could not read a picked scan', err)
        isError.value = true
        statusText.value = `Could not read ${file.name}.`
      }
    }
  } finally {
    loading.value = false
  }
}

function removeScan(id: number): void {
  scans.value = scans.value.filter((s) => s.id !== id)
}

async function analyze(): Promise<void> {
  if (scans.value.length < 2) return
  busy.value = true
  isError.value = false
  notes.value = []
  statusText.value = `Analyzing ${scans.value.length} scans...`
  try {
    const coupon = buildCoupon()
    let pxPerMm: number | null
    if (calibration.calibration) pxPerMm = calibration.calibration.pxPerMm
    else if (dpi.value != null && dpi.value >= 50) pxPerMm = dpi.value / 25.4
    else pxPerMm = null

    const response = await analyzeScans(
      scans.value.map((s) => s.bytes),
      { coupon, pxPerMm },
    )
    if (response.ok) {
      statusText.value = ''
      app.showResults({
        result: response.result,
        overlays: response.overlays.map((o) => ({ plane: o.plane, a: o.a, b: o.b })),
        notes: response.notes,
        coupon,
      })
    } else {
      isError.value = true
      notes.value = response.notes
      statusText.value = 'No plane could be analyzed. Check that each plate has two scans a quarter-turn apart.'
    }
  } catch (e) {
    isError.value = true
    statusText.value = `${e instanceof Error ? e.message : String(e)} Check the scans and that each carries the two-solid marker.`
    console.error('Multi-scan analysis failed', e)
  } finally {
    busy.value = false
  }
}

function getCoupon(file: string): void {
  const a = document.createElement('a')
  a.href = `${import.meta.env.BASE_URL}${file}`
  a.download = file
  a.click()
}
</script>

<template>
  <v-container class="page">
    <header class="mb-4">
      <h1 class="text-h5 font-weight-bold">Scan calibration</h1>
      <p class="text-body-2 text-medium-emphasis mt-1">
        Print a plate for each plane you want to calibrate, scan each one twice (flat, then a quarter-turn),
        and drop all the scans in. The app sorts them by plate and works out X/Y/Z scale and skew.
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

    <!-- 2. Print the plates -->
    <section class="step mb-3">
      <div class="step-head mb-1">
        <span class="num">2</span><span class="step-title">Print the plate(s)</span>
      </div>
      <p class="tip mb-2">
        Print only the planes you want. XY is flat; XZ and YZ print standing (add a brim if adhesion is
        tricky). Each has to contrast with the scan background, so back a light plate with a coloured sheet.
      </p>
      <div class="plate-btns">
        <v-btn
          v-for="p in plates"
          :key="p.key"
          variant="tonal"
          size="small"
          prepend-icon="mdi-download"
          @click="getCoupon(p.file)"
        >
          {{ p.label }}
        </v-btn>
      </div>
    </section>

    <!-- 3. Scan your prints -->
    <section class="step mb-3">
      <div class="step-head mb-1">
        <span class="num">3</span><span class="step-title">Scan your prints</span>
      </div>
      <p class="tip mb-3">
        Scan each plate twice: lay it flat and scan, then give it a quarter-turn and scan again. Averaging
        the pair cancels your scanner's own stretch and skew. Repeat for every plate you printed.
      </p>
      <p v-if="scanDpiHint" class="tip mb-3">{{ scanDpiHint }}</p>

      <div class="scan-flow">
        <div class="glyph-step">
          <CouponGlyph :rotate="0" :size="76" />
          <span class="glyph-cap">1 · scan flat</span>
        </div>
        <div class="connector">
          <v-icon class="arrow" color="primary" size="26">mdi-rotate-right</v-icon>
          <span class="deg">turn 90°</span>
        </div>
        <div class="glyph-step">
          <div class="roll">
            <div class="glyph-wrap"><CouponGlyph :size="76" /></div>
          </div>
          <span class="glyph-cap">2 · scan again</span>
        </div>
      </div>

      <p class="text-caption text-medium-emphasis text-center mt-3">
        The two solid corner rings let the app align the pair; the dots by the corner tell it which plane the
        plate is.
      </p>
    </section>

    <!-- 4. Upload your scans -->
    <section class="step mb-3">
      <div class="step-head mb-1">
        <span class="num">4</span><span class="step-title">Upload your scans</span>
      </div>
      <p class="tip mb-3">
        Drop in every scan at once: two per plate, up to three plates (6 scans). The app sorts them by plate
        for you.
      </p>

      <label class="dropzone" :class="{ busy }">
        <input
          type="file"
          accept="image/*"
          multiple
          class="file-input"
          data-testid="scans-input"
          @change="onPick"
        />
        <v-icon size="28" color="primary">mdi-image-plus</v-icon>
        <span class="dz-label">Choose scan images</span>
        <span class="dz-sub">or drop them here · you can add more later</span>
      </label>

      <div v-if="scans.length" class="thumbs mt-3" data-testid="thumbs">
        <div v-for="s in scans" :key="s.id" class="thumb">
          <img v-if="s.preview" :src="s.preview" :alt="s.name" />
          <div v-else class="thumb-fallback"><v-icon>mdi-file-image-outline</v-icon></div>
          <button class="thumb-x" type="button" title="Remove" @click="removeScan(s.id)">
            <v-icon size="16">mdi-close</v-icon>
          </button>
        </div>
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
        {{ analyzeLabel }}
      </v-btn>

      <v-alert
        v-if="statusText"
        :type="isError ? 'error' : 'info'"
        variant="tonal"
        class="mt-3"
        :text="statusText"
        data-testid="status"
      />
      <v-alert v-if="notes.length" type="warning" variant="tonal" density="compact" class="mt-2">
        <ul class="notes">
          <li v-for="(n, i) in notes" :key="i">{{ n }}</li>
        </ul>
      </v-alert>
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
.plate-btns {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}
.scan-flow {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 18px;
  padding: 6px 0 2px;
}
.glyph-step {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
}
.glyph-cap {
  font-size: 12px;
  color: rgba(var(--v-theme-on-surface), 0.7);
}
/* The second coupon pivots about its top-right corner (transform-origin 0 0 plus translateX by one
   glyph width pins that corner on screen) so it ROLLS in from the right onto the quarter-turned
   resting frame, rather than spinning in place. This mirrors the desktop app's slot-2 animation. */
.roll {
  position: relative;
  width: 152px;
  height: 76px;
}
.glyph-wrap {
  position: absolute;
  left: 0;
  top: 0;
  transform-origin: 0 0;
  animation: roll-turn 2.6s ease infinite;
}
@keyframes roll-turn {
  0%,
  25% {
    transform: translateX(76px) rotate(0deg);
  }
  65%,
  100% {
    transform: translateX(76px) rotate(90deg);
  }
}
@media (prefers-reduced-motion: reduce) {
  .glyph-wrap {
    animation: none;
    transform: translateX(76px) rotate(90deg);
  }
}
.connector {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
}
.deg {
  font-size: 11px;
  color: rgba(var(--v-theme-on-surface), 0.6);
}
.dropzone {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 4px;
  padding: 22px;
  border: 1.5px dashed rgba(var(--v-theme-primary), 0.5);
  border-radius: 12px;
  background: rgb(var(--v-theme-surface-bright));
  cursor: pointer;
  position: relative;
  transition: border-color 0.15s ease;
}
.dropzone:hover {
  border-color: rgb(var(--v-theme-primary));
}
.file-input {
  position: absolute;
  inset: 0;
  opacity: 0;
  cursor: pointer;
}
.dz-label {
  font-weight: 500;
  font-size: 14px;
}
.dz-sub {
  font-size: 12px;
  color: rgba(var(--v-theme-on-surface), 0.6);
}
.thumbs {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(84px, 1fr));
  gap: 8px;
}
.thumb {
  position: relative;
  aspect-ratio: 1;
  border-radius: 8px;
  overflow: hidden;
  background: rgb(var(--v-theme-surface-bright));
}
.thumb img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}
.thumb-fallback {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  color: rgba(var(--v-theme-on-surface), 0.4);
}
.thumb-x {
  position: absolute;
  top: 2px;
  right: 2px;
  background: rgba(0, 0, 0, 0.55);
  border: none;
  border-radius: 50%;
  width: 22px;
  height: 22px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #fff;
  cursor: pointer;
}
.notes {
  margin: 0;
  padding-left: 18px;
  font-size: 12.5px;
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
