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
const scannerAnisoText = computed(() =>
  result.value ? `${signedFixed(result.value.scanner.anisotropyPercent, 3)} %` : '',
)
</script>

<template>
  <v-container v-if="result && combined" class="page">
    <div class="d-flex align-center justify-space-between mb-3">
      <h1 class="text-h5">Results</h1>
      <v-btn variant="text" prepend-icon="mdi-refresh" data-testid="startover-btn" @click="app.goScan()">
        New calibration
      </v-btn>
    </div>

    <div class="tiles mb-2">
      <div class="tile">
        <div class="text-caption">X scale</div>
        <div class="text-h5" data-testid="x-scale">{{ signedPercent(combined.xScalePercent) }}</div>
      </div>
      <div class="tile">
        <div class="text-caption">Y scale</div>
        <div class="text-h5" data-testid="y-scale">{{ signedPercent(combined.yScalePercent) }}</div>
      </div>
      <div class="tile">
        <div class="text-caption">Skew</div>
        <div class="text-h5" data-testid="skew">{{ signedDegrees(combined.skewDegrees) }}</div>
      </div>
    </div>

    <v-alert v-if="rotationWarning" type="warning" variant="tonal" density="compact" class="mb-2" :text="rotationWarning" />

    <v-card variant="tonal" class="mb-4">
      <v-card-text>
        <div class="d-flex align-center justify-space-between">
          <span data-testid="summary">{{ summary }}</span>
          <v-btn size="small" variant="text" @click="scannerExpanded = !scannerExpanded">
            {{ scannerExpanded ? 'Hide' : 'Scanner detail' }}
          </v-btn>
        </div>
        <div v-if="scannerExpanded" class="mt-2 text-body-2">
          <div>Scanner X/Y bias {{ scannerAnisoText }}, skew {{ signedDegrees(result.scanner.skewDegrees) }}</div>
          <div class="text-caption text-medium-emphasis">
            Your scanner's own error, measured and removed from the result above.
          </div>
        </div>
      </v-card-text>
    </v-card>

    <v-card class="mb-4">
      <v-card-item><v-card-title class="text-subtitle-1">Fix skew</v-card-title></v-card-item>
      <v-card-text>
        <v-select v-model="skewFlavour" :items="skewFlavours" label="Firmware" density="comfortable" class="mb-2" />
        <template v-if="skew">
          <CodeBlock :code="skew.code" :caption="skew.primaryCaption" />
          <CodeBlock v-if="skew.secondaryCode" :code="skew.secondaryCode" :caption="skew.secondaryCaption" />
          <div v-if="skew.hint" class="text-caption text-medium-emphasis">{{ skew.hint }}</div>
        </template>
      </v-card-text>
    </v-card>

    <v-card class="mb-4">
      <v-card-item><v-card-title class="text-subtitle-1">Fix size</v-card-title></v-card-item>
      <v-card-text>
        <v-select v-model="sizeFlavour" :items="sizeFlavours" label="Format" density="comfortable" class="mb-2" />
        <div v-if="showCurrent" class="fields mb-2">
          <NumericField v-model="currentX" :label="`X ${currentLabel}`" :step="0.1" :min="0" />
          <NumericField v-model="currentY" :label="`Y ${currentLabel}`" :step="0.1" :min="0" />
        </div>
        <template v-if="size">
          <CodeBlock :code="size.code" />
          <div v-if="size.hint" class="text-caption text-medium-emphasis">{{ size.hint }}</div>
        </template>
      </v-card-text>
    </v-card>

    <div class="overlays">
      <OverlayCanvas :bitmap="payload!.overlayA" label="Scan 1 (as placed)" />
      <OverlayCanvas :bitmap="payload!.overlayB" label="Scan 2 (quarter-turned)" />
    </div>
  </v-container>

  <v-container v-else class="page">
    <v-alert type="info" variant="tonal" text="No results yet." />
    <v-btn class="mt-3" @click="app.goScan()">Back to start</v-btn>
  </v-container>
</template>

<style scoped>
.page {
  max-width: 720px;
}
.tiles {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 12px;
}
.tile {
  text-align: center;
}
.fields {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 12px;
}
.overlays {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
  gap: 16px;
}
</style>
