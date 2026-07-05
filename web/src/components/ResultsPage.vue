<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import { useApp } from '../stores/useApp'
import {
  skewFlavours,
  sizeFlavours,
  skewCorrectionMulti,
  axisSizeCorrection,
  currentValueLabel,
} from '../engine/correctionFormatter'
import { planeAxes } from '../engine/types'
import type { Plane } from '../engine/types'
import { signedPercent, signedDegrees } from '../util/format'
import CodeBlock from './CodeBlock.vue'
import OverlayCanvas from './OverlayCanvas.vue'
import NumericField from './NumericField.vue'

const app = useApp()

const payload = computed(() => app.payload)
const result = computed(() => payload.value?.result ?? null)
const scales = computed(() => result.value?.scales ?? [])
const skews = computed(() => result.value?.skews ?? [])
const planes = computed(() => result.value?.planes ?? [])

const skewFlavour = ref<string>(skewFlavours[0])
const sizeFlavour = ref<string>(sizeFlavours[0])
const currents = reactive<Record<'X' | 'Y' | 'Z', number | null>>({ X: null, Y: null, Z: null })

const currentLabel = computed(() => currentValueLabel(sizeFlavour.value))
const showCurrent = computed(() => currentLabel.value !== null)
const currentAxes = computed(() => scales.value.map((s) => s.axis))

// A steps/mm value is meaningless as a rotation distance, so clear entered currents on format change.
watch(sizeFlavour, () => {
  currents.X = currents.Y = currents.Z = null
})

const skewFix = computed(() =>
  result.value && payload.value
    ? skewCorrectionMulti(skewFlavour.value, skews.value, payload.value.coupon)
    : null,
)
const sizeFix = computed(() =>
  result.value ? axisSizeCorrection(sizeFlavour.value, scales.value, currents) : null,
)

function planeAxisLabel(p: Plane): string {
  const [a, b] = planeAxes(p)
  return `${a}${b}`
}

const overlayFor = (p: Plane) => payload.value?.overlays.find((o) => o.plane === p) ?? null

function planeSummary(p: Plane): string {
  const a = planes.value.find((x) => x.plane === p)
  if (!a) return ''
  const c = a.twoScan.combined
  return `${c.ringsDetected} rings · ${c.rmsResidualPx.toFixed(2)} px fit · ${a.twoScan.relativeRotationDegrees.toFixed(0)}° turn`
}
function planeValid(p: Plane): boolean {
  return planes.value.find((x) => x.plane === p)?.twoScan.rotationLooksValid ?? true
}
</script>

<template>
  <v-container v-if="result && planes.length" class="page">
    <div class="header">
      <h1 class="text-h4 font-weight-bold">Results</h1>
      <v-btn variant="text" prepend-icon="mdi-refresh" data-testid="startover-btn" @click="app.goScan()">
        New calibration
      </v-btn>
    </div>

    <!-- Hero: the answer -->
    <section class="hero mb-4">
      <div class="group-label">Scale</div>
      <div class="tiles">
        <div v-for="s in scales" :key="s.axis" class="tile">
          <div class="tlab">{{ s.axis }} scale</div>
          <div class="tval" :data-testid="`scale-${s.axis}`">{{ signedPercent(s.scalePercent) }}</div>
        </div>
      </div>
      <div class="group-label mt-3">Skew</div>
      <div class="tiles">
        <div v-for="k in skews" :key="k.plane" class="tile">
          <div class="tlab">{{ planeAxisLabel(k.plane) }} skew</div>
          <div class="tval" :data-testid="`skew-${k.plane}`">{{ signedDegrees(k.skewDegrees) }}</div>
        </div>
      </div>
    </section>

    <v-alert
      v-if="payload && payload.notes.length"
      type="warning"
      variant="tonal"
      density="compact"
      class="mb-4"
    >
      <ul class="notes">
        <li v-for="(n, i) in payload.notes" :key="i">{{ n }}</li>
      </ul>
    </v-alert>

    <div class="result-body">
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
          <template v-if="skewFix">
            <CodeBlock :code="skewFix.code" :caption="skewFix.primaryCaption" data-testid="skew-code" />
            <CodeBlock
              v-if="skewFix.secondaryCode"
              :code="skewFix.secondaryCode"
              :caption="skewFix.secondaryCaption"
            />
            <div v-if="skewFix.hint" class="hint">{{ skewFix.hint }}</div>
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
            <NumericField
              v-for="axis in currentAxes"
              :key="axis"
              v-model="currents[axis]"
              :label="`${axis} ${currentLabel}`"
              :step="0.1"
              :min="0"
              :precision="3"
            />
          </div>
          <template v-if="sizeFix">
            <CodeBlock :code="sizeFix.code" data-testid="size-code" />
            <div v-if="sizeFix.hint" class="hint">{{ sizeFix.hint }}</div>
          </template>
        </section>
      </div>

      <!-- The annotated scans, grouped by plane -->
      <section class="scans-col">
        <div v-for="a in planes" :key="a.plane" class="plane-block">
          <div class="plane-head">
            <span class="plane-name">{{ planeAxisLabel(a.plane) }} plate</span>
            <span class="plane-summary">{{ planeSummary(a.plane) }}</span>
            <v-icon :color="planeValid(a.plane) ? 'primary' : 'warning'" size="16">
              {{ planeValid(a.plane) ? 'mdi-check' : 'mdi-alert' }}
            </v-icon>
          </div>
          <div class="scan-pair">
            <div class="scan-card">
              <div class="scan-title">Scan 1 (as placed)</div>
              <OverlayCanvas :bitmap="overlayFor(a.plane)?.a ?? null" />
            </div>
            <div class="scan-card">
              <div class="scan-title">Scan 2 (quarter-turned)</div>
              <OverlayCanvas :bitmap="overlayFor(a.plane)?.b ?? null" />
            </div>
          </div>
        </div>
      </section>
    </div>
  </v-container>

  <v-container v-else class="page">
    <v-alert type="info" variant="tonal" text="No results yet." />
    <v-btn class="mt-3" @click="app.goScan()">Back to start</v-btn>
  </v-container>
</template>

<style scoped>
.page {
  max-width: 1440px;
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
.group-label {
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: rgba(var(--v-theme-on-surface), 0.6);
  margin-bottom: 8px;
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
  font-size: clamp(15px, 4.2vw, 26px);
  white-space: nowrap;
  font-weight: 500;
  font-family: 'Roboto Mono', ui-monospace, monospace;
  margin-top: 2px;
}
.notes {
  margin: 0;
  padding-left: 18px;
  font-size: 12.5px;
}

.result-body {
  display: grid;
  gap: 14px;
  grid-template-columns: 1fr;
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
  grid-template-columns: repeat(auto-fit, minmax(120px, 1fr));
  gap: 12px;
}
.scans-col {
  display: flex;
  flex-direction: column;
  gap: 16px;
}
.plane-head {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 6px;
}
.plane-name {
  font-weight: 600;
  font-size: 14px;
}
.plane-summary {
  flex: 1;
  font-size: 12.5px;
  color: rgba(var(--v-theme-on-surface), 0.6);
}
.scan-pair {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
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

/* Desktop: corrections beside the scans so the whole result is visible without scrolling. */
@media (min-width: 900px) {
  .result-body {
    grid-template-columns: minmax(0, 1fr) 340px;
    align-items: start;
  }
  .fix-col {
    order: 2;
  }
  .scans-col {
    order: 1;
  }
}
</style>
