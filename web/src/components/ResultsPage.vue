<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useApp } from '../stores/useApp'
import {
  skewFlavours,
  sizeFlavours,
  skewCorrection,
  sizeCorrection,
  currentValueLabel,
} from '../engine/correctionFormatter'
import { signedPercent, signedDegrees, signedFixed } from '../util/format'
import CodeBlock from './CodeBlock.vue'
import OverlayCanvas from './OverlayCanvas.vue'
import NumericField from './NumericField.vue'

const app = useApp()

const payload = computed(() => app.payload)
const result = computed(() => payload.value?.result ?? null)
const combined = computed(() => result.value?.combined ?? null)

const skewFlavour = ref<string>(skewFlavours[0])
const sizeFlavour = ref<string>(sizeFlavours[0])
const currentX = ref<number | null>(null)
const currentY = ref<number | null>(null)
const scannerExpanded = ref(false)

const currentLabel = computed(() => currentValueLabel(sizeFlavour.value))
const showCurrent = computed(() => currentLabel.value !== null)

// A steps/mm value is meaningless as a rotation distance, so clear the entered current values when the
// size format changes.
watch(sizeFlavour, () => {
  currentX.value = null
  currentY.value = null
})

const skew = computed(() =>
  combined.value && payload.value
    ? skewCorrection(skewFlavour.value, combined.value.skewDegrees, payload.value.coupon)
    : null,
)
const size = computed(() =>
  combined.value
    ? sizeCorrection(
        sizeFlavour.value,
        combined.value.xScalePercent,
        combined.value.yScalePercent,
        currentX.value,
        currentY.value,
      )
    : null,
)

const summary = computed(() => {
  const r = result.value
  if (!r) return ''
  return `${r.combined.ringsDetected} rings · ${r.combined.rmsResidualPx.toFixed(2)} px fit · ${r.relativeRotationDegrees.toFixed(0)}° turn`
})
const rotationWarning = computed(() => {
  const r = result.value
  if (!r || r.rotationLooksValid) return ''
  return r.flipMismatch
    ? 'One scan is mirror-flipped relative to the other, so the figures cannot be trusted.'
    : "The scans aren't a quarter-turn apart, so the scanner error could not be cancelled."
})

const scannerLine = computed(() => {
  const r = result.value
  if (!r) return ''
  return `Scanner  X/Y bias ${signedFixed(r.scanner.anisotropyPercent, 3)} %,  skew ${signedDegrees(r.scanner.skewDegrees)}`
})
const scanALine = computed(() => {
  const s = result.value?.scanA
  if (!s) return ''
  return `Scan 1   X ${signedFixed(s.xScalePercent, 3)} %,  Y ${signedFixed(s.yScalePercent, 3)} %,  skew ${signedDegrees(s.skewDegrees)}`
})
const scanBLine = computed(() => {
  const s = result.value?.scanB
  if (!s) return ''
  return `Scan 2   X ${signedFixed(s.xScalePercent, 3)} %,  Y ${signedFixed(s.yScalePercent, 3)} %,  skew ${signedDegrees(s.skewDegrees)}`
})
</script>

<template>
  <v-container v-if="result && combined" class="page">
    <div class="header">
      <h1 class="text-h4 font-weight-bold">Results</h1>
      <v-btn variant="text" prepend-icon="mdi-refresh" data-testid="startover-btn" @click="app.goScan()">
        New calibration
      </v-btn>
    </div>

    <!-- Hero: the answer, plus the collapsible scanner check -->
    <section class="hero mb-4">
      <div class="tiles">
        <div class="tile">
          <div class="tlab">X scale</div>
          <div class="tval" data-testid="x-scale">{{ signedPercent(combined.xScalePercent) }}</div>
        </div>
        <div class="tile">
          <div class="tlab">Y scale</div>
          <div class="tval" data-testid="y-scale">{{ signedPercent(combined.yScalePercent) }}</div>
        </div>
        <div class="tile">
          <div class="tlab">Skew</div>
          <div class="tval" data-testid="skew">{{ signedDegrees(combined.skewDegrees) }}</div>
        </div>
      </div>

      <button class="scanner-row" type="button" @click="scannerExpanded = !scannerExpanded">
        <span class="scanner-name">Scanner</span>
        <span class="scanner-summary" data-testid="summary">{{ summary }}</span>
        <v-icon :color="result.rotationLooksValid ? 'primary' : 'warning'" size="18">
          {{ result.rotationLooksValid ? 'mdi-check' : 'mdi-alert' }}
        </v-icon>
        <v-icon size="18" class="chev" :class="{ open: scannerExpanded }">mdi-chevron-down</v-icon>
      </button>
      <v-expand-transition>
        <div v-if="scannerExpanded" class="scanner-detail">
          <div class="mono">{{ scannerLine }}</div>
          <div class="mono">{{ scanALine }}</div>
          <div class="mono">{{ scanBLine }}</div>
          <div class="text-caption text-medium-emphasis mt-2">
            Your scanner's own error, measured and removed from the result above.
          </div>
        </div>
      </v-expand-transition>
    </section>

    <v-alert
      v-if="rotationWarning"
      type="warning"
      variant="tonal"
      density="compact"
      class="mb-4"
      :text="rotationWarning"
    />

    <div class="result-body">
      <!-- Corrections: first on mobile, right column on desktop -->
      <div class="fix-col">
        <section class="card mb-3">
          <h2 class="card-title">Fix skew</h2>
          <v-select
            v-model="skewFlavour"
            :items="skewFlavours"
            label="Firmware"
            density="comfortable"
            hide-details
            class="mb-3"
          />
          <template v-if="skew">
            <CodeBlock :code="skew.code" :caption="skew.primaryCaption" />
            <CodeBlock v-if="skew.secondaryCode" :code="skew.secondaryCode" :caption="skew.secondaryCaption" />
            <div v-if="skew.hint" class="hint">{{ skew.hint }}</div>
          </template>
        </section>

        <section class="card">
          <h2 class="card-title">Fix size</h2>
          <v-select
            v-model="sizeFlavour"
            :items="sizeFlavours"
            label="Format"
            density="comfortable"
            hide-details
            class="mb-3"
          />
          <div v-if="showCurrent" class="current-fields mb-3">
            <NumericField v-model="currentX" :label="`X ${currentLabel}`" :step="0.1" :min="0" :precision="3" />
            <NumericField v-model="currentY" :label="`Y ${currentLabel}`" :step="0.1" :min="0" :precision="3" />
          </div>
          <template v-if="size">
            <CodeBlock :code="size.code" />
            <div v-if="size.hint" class="hint">{{ size.hint }}</div>
          </template>
        </section>
      </div>

      <!-- The annotated scans: below on mobile, left column (filling) on desktop -->
      <div class="scans-col">
        <section class="scan-card">
          <div class="scan-title">Scan 1 (as placed)</div>
          <OverlayCanvas :bitmap="payload!.overlayA" />
        </section>
        <section class="scan-card">
          <div class="scan-title">Scan 2 (quarter-turned)</div>
          <OverlayCanvas :bitmap="payload!.overlayB" />
        </section>
      </div>
    </div>
  </v-container>

  <v-container v-else class="page">
    <v-alert type="info" variant="tonal" text="No results yet." />
    <v-btn class="mt-3" @click="app.goScan()">Back to start</v-btn>
  </v-container>
</template>

<style scoped>
.page {
  max-width: 1000px;
}
.header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 16px;
}

.hero {
  background: rgb(var(--v-theme-surface-light));
  border-radius: 14px;
  padding: 16px;
}
.tiles {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 12px;
}
.tile {
  background: rgb(var(--v-theme-surface-bright));
  border-radius: 10px;
  padding: 14px 8px;
  text-align: center;
}
.tlab {
  font-size: 11px;
  color: rgba(var(--v-theme-on-surface), 0.6);
  text-transform: uppercase;
  letter-spacing: 0.05em;
}
.tval {
  /* Shrink to fit a narrow tile and never wrap the value onto a second line. */
  font-size: clamp(15px, 4.2vw, 26px);
  white-space: nowrap;
  font-weight: 500;
  font-family: 'Roboto Mono', ui-monospace, monospace;
  margin-top: 2px;
}

.scanner-row {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  margin-top: 12px;
  padding: 10px 12px;
  background: rgb(var(--v-theme-surface-bright));
  border-radius: 10px;
  border: none;
  color: inherit;
  font: inherit;
  text-align: left;
  cursor: pointer;
}
.scanner-name {
  font-weight: 500;
}
.scanner-summary {
  flex: 1;
  color: rgba(var(--v-theme-on-surface), 0.6);
  font-size: 13px;
}
.chev {
  transition: transform 0.2s ease;
}
.chev.open {
  transform: rotate(180deg);
}
.scanner-detail {
  padding: 12px 4px 2px;
  overflow-x: auto;
}
.mono {
  font-family: 'Roboto Mono', ui-monospace, monospace;
  font-size: 12.5px;
  color: rgba(var(--v-theme-on-surface), 0.7);
  white-space: nowrap;
  line-height: 1.7;
}

.result-body {
  display: grid;
  gap: 14px;
}
.card {
  background: rgb(var(--v-theme-surface-light));
  border-radius: 14px;
  padding: 16px;
}
.card-title {
  font-size: 16px;
  font-weight: 600;
  margin-bottom: 12px;
}
.hint {
  font-size: 12px;
  color: rgba(var(--v-theme-on-surface), 0.6);
  margin-top: 6px;
}
.current-fields {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
}
.scans-col {
  display: flex;
  flex-direction: column;
  gap: 14px;
}
.scan-card {
  background: rgb(var(--v-theme-surface-light));
  border-radius: 14px;
  padding: 10px;
}
.scan-title {
  font-size: 12px;
  color: rgba(var(--v-theme-on-surface), 0.6);
  margin: 2px 4px 6px;
}

@media (min-width: 900px) {
  .result-body {
    grid-template-columns: minmax(0, 1fr) 400px;
    align-items: start;
  }
  .scans-col {
    grid-column: 1;
    grid-row: 1;
  }
  .fix-col {
    grid-column: 2;
    grid-row: 1;
  }
}
</style>
