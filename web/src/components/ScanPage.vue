<script setup lang="ts">
import { computed, ref, toRaw } from 'vue'
import { useApp } from '../stores/useApp'
import { useCalibration } from '../stores/useCalibration'
import { useScans } from '../stores/useScans'
import { readBytes } from '../util/preview'
import { analyzeScan } from '../workerClient'
import { reconcileScans } from '../engine/multiPlaneCombiner'
import { asAligned, defaultCouponSpec } from '../engine/types'
import type { CouponSpec, Plane } from '../engine/types'
import { ScanState } from '../model/skewCouponScan'
import { skewFlavours, resetSkewCommand } from '../engine/correctionFormatter'
import NumericField from './NumericField.vue'
import CouponGlyph from './CouponGlyph.vue'
import ScanIsland from './ScanIsland.vue'
import CodeBlock from './CodeBlock.vue'

const app = useApp()
const calibration = useCalibration()
const store = useScans()

const dpi = ref<number | null>(1200)
const baselineMm = ref<number | null>(100)
const gridN = ref<number | null>(5)

const isError = ref(false)
const statusText = ref('')

const isCalibrated = computed(() => calibration.calibration !== null)
const calibrationLine = computed(() =>
  isCalibrated.value
    ? `Calibrated · ${Math.round(calibration.calibration!.dpi)} dpi. Absolute scale is anchored to your scanner.`
    : 'Optional. Calibrate to report absolute size; skip it for anisotropy and skew only.',
)
const scanDpiHint = computed(() =>
  isCalibrated.value ? `Scan every plate at ${Math.round(calibration.calibration!.dpi)} dpi.` : '',
)

// Coupon geometry locks once any scan is loaded: the per-scan analysis is cached against these
// values, so letting them change mid-batch would silently mismatch the loaded scans.
const fieldsLocked = computed(() => store.scans.length > 0)
const anyPending = computed(() => store.scans.some((s) => s.state === ScanState.Pending))
const notReady = computed(() => store.scans.filter((s) => !s.isMeasured))

// Data-driven: analysable only when every scan measured a plane and those planes pair up into
// complete plates. So the button never lets a bad scan through, and combine can't surface a
// picture-stage error.
const planesPair = computed(() => {
  const measured = store.scans.filter((s) => s.isMeasured)
  if (measured.length === 0) return false
  const byPlane = new Map<Plane, number>()
  for (const s of measured) byPlane.set(s.plane!, (byPlane.get(s.plane!) ?? 0) + 1)
  for (const count of byPlane.values()) if (count !== 2) return false
  return true
})
const canAnalyze = computed(() => {
  const n = store.scans.length
  return !anyPending.value && n >= 2 && n <= 6 && notReady.value.length === 0 && planesPair.value
})
const analyzeLabel = computed(() => {
  if (anyPending.value) return 'Checking scans...'
  const n = store.scans.length
  if (n === 0) return 'Add 2 scans to analyze'
  if (n > 6) return `Remove ${n - 6} scan${n - 6 === 1 ? '' : 's'} (6 max)`
  const bad = notReady.value.length
  if (bad > 0) return `Fix ${bad} scan${bad === 1 ? '' : 's'} to analyze`
  if (!planesPair.value) return 'Each plate needs two scans a quarter-turn apart'
  return `Analyze ${n} scans`
})

const resetFlavour = ref<string>(skewFlavours[0])
const resetCommand = computed(() => resetSkewCommand(resetFlavour.value))

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
  const coupon = buildCoupon()
  for (const file of files) {
    let bytes: Uint8Array
    try {
      bytes = await readBytes(file)
    } catch (err) {
      console.error('Could not read a picked scan', err)
      isError.value = true
      statusText.value = `Could not read ${file.name}.`
      continue
    }
    const id = store.add(file.name, bytes)
    // Fire the analysis without blocking the next file. The worker serialises the calls, so scans are
    // still decoded one at a time (bounded memory), and each island fills in as its scan finishes.
    void analyzeItem(id, bytes, coupon)
  }
}

async function analyzeItem(id: number, bytes: Uint8Array, coupon: CouponSpec): Promise<void> {
  try {
    store.applyProcessing(id, await analyzeScan(bytes, coupon))
  } catch (e) {
    console.error('Per-scan analysis failed', e)
    store.fail(id, e instanceof Error ? e.message : String(e))
  }
}

function analyze(): void {
  const measured = store.scans.filter((s) => s.isMeasured)
  const pxPerMm = calibration.calibration
    ? calibration.calibration.pxPerMm
    : dpi.value != null && dpi.value >= 50
      ? dpi.value / 25.4
      : null
  try {
    const result = reconcileScans(
      measured.map((s) => asAligned(toRaw(s.result!))),
      pxPerMm,
    )
    // The Results page reuses each scan's overlay straight from the scans store, so nothing is copied
    // here; only the reconciled numbers travel in the payload.
    app.showResults({ result, coupon: buildCoupon() })
  } catch (e) {
    isError.value = true
    statusText.value = e instanceof Error ? e.message : String(e)
    console.error('Reconcile failed', e)
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

    <!-- 2. Reset printer skew -->
    <section class="step mb-3">
      <div class="step-head mb-2">
        <span class="num">2</span><span class="step-title">Reset printer skew</span>
      </div>
      <div class="warn-box mb-3">
        <v-icon color="warning" size="16" class="warn-icon">mdi-alert-outline</v-icon>
        <span>
          <strong class="warn-lead">Coupons must be printed with skew correction disabled.</strong>
          A correction still active bends the coupon before it prints, so the skew fix ScanNTune
          calculates from it will be wrong.
        </span>
      </div>
      <div class="reset-row">
        <v-select
          v-model="resetFlavour"
          :items="skewFlavours"
          label="Firmware"
          density="comfortable"
          hide-details
          class="reset-select"
        />
        <CodeBlock :code="resetCommand.code" class="reset-code" />
      </div>
      <p v-if="resetCommand.hint" class="tip mt-0">{{ resetCommand.hint }}</p>
    </section>

    <!-- 3. Print the plates -->
    <section class="step mb-3">
      <div class="step-head mb-1">
        <span class="num">3</span><span class="step-title">Print the plate(s)</span>
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

    <!-- 4. Scan your prints -->
    <section class="step mb-3">
      <div class="step-head mb-1">
        <span class="num">4</span><span class="step-title">Scan your prints</span>
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

    <!-- 5. Upload your scans -->
    <section class="step mb-3">
      <div class="step-head mb-1">
        <span class="num">5</span><span class="step-title">Upload your scans</span>
      </div>
      <p class="tip mb-3">
        Drop in every scan at once: two per plate, up to three plates (6 scans). Each scan is checked the
        moment you add it, so you see what registered before you analyze.
      </p>

      <label class="dropzone">
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

      <div v-if="store.scans.length" class="islands mt-3" data-testid="islands">
        <ScanIsland
          v-for="s in store.scans"
          :key="s.id"
          :scan="s"
          @remove="store.remove(s.id)"
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
        <NumericField
          v-model="baselineMm"
          label="Coupon baseline (mm)"
          :step="10"
          :min="10"
          :readonly="fieldsLocked"
        />
        <NumericField
          v-model="gridN"
          label="Rings per side"
          :step="1"
          :min="2"
          :readonly="fieldsLocked"
        />
      </div>
      <p v-if="fieldsLocked" class="lock-hint">
        Baseline and rings per side lock while scans are loaded. Remove every scan to change them.
      </p>

      <v-btn
        data-testid="analyze-btn"
        color="primary"
        size="large"
        block
        class="mt-4"
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
.warn-box {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  background: rgba(var(--v-theme-warning), 0.12);
  border: 1px solid rgba(var(--v-theme-warning), 0.35);
  border-radius: 8px;
  padding: 9px 11px;
  font-size: 12.5px;
  line-height: 1.55;
}
.warn-icon {
  margin-top: 1px;
  flex-shrink: 0;
}
.warn-lead {
  color: rgb(var(--v-theme-warning));
  font-weight: 500;
}
.reset-row {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-end;
  gap: 12px;
}
.reset-select {
  flex: 0 1 180px;
  min-width: 140px;
}
.reset-code {
  flex: 1 1 220px;
  min-width: 220px;
  margin-bottom: 0;
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
.islands {
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.fields {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
}
.fields > * {
  flex: 1 1 160px;
}
.lock-hint {
  font-size: 11.5px;
  color: rgba(var(--v-theme-on-surface), 0.42);
  margin-top: 8px;
}
</style>
