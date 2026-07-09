<script setup lang="ts">
import { computed } from 'vue'
import { signedDegrees, signedPercent } from '../util/format'

/** A confidence range shown under the tile's headline value, in the figure's own unit. */
export interface MetricRange {
  low: number
  high: number
  point: number
  unit: '°' | '%'
  scanCount: number
}

const props = defineProps<{
  label: string
  value: string
  testid?: string
  range?: MetricRange | null
  /** The figure's spoken name for the no-correction sentence, e.g. "X scale" or "XY skew". */
  figureName?: string
  rangeTestid?: string
}>()

const spansZero = computed(
  () => !!props.range && props.range.low <= 0 && props.range.high >= 0,
)

// Whisker geometry in a fixed 120 x 20 viewBox. The domain always contains zero and the whole
// range, padded 15% on each side so the zero tick is always visible and the whisker never touches
// the SVG edge.
const geom = computed(() => {
  const r = props.range
  if (!r) return null
  const lo = Math.min(r.low, 0)
  const hi = Math.max(r.high, 0)
  const pad = 0.15 * Math.max(hi - lo, Number.EPSILON)
  const min = lo - pad
  const max = hi + pad
  const x = (v: number) => ((v - min) / (max - min)) * 120
  return { zero: x(0), low: x(r.low), high: x(r.high), point: x(r.point) }
})

function fmt(v: number): string {
  return props.range?.unit === '°' ? signedDegrees(v) : signedPercent(v)
}
const caption = computed(() =>
  props.range
    ? `Likely between ${fmt(props.range.low)} and ${fmt(props.range.high)} (95% from ${props.range.scanCount} scans).`
    : '',
)
const zeroNote = computed(() =>
  spansZero.value && props.figureName
    ? `No correction needed: the measured ${props.figureName} is too small to stand out from the scan-to-scan spread.`
    : '',
)
const ariaLabel = computed(() => (zeroNote.value ? `${caption.value} ${zeroNote.value}` : caption.value))
const zeroNoteTestid = computed(() =>
  props.rangeTestid ? `zero-note-${props.rangeTestid.replace(/^range-/, '')}` : undefined,
)
</script>

<template>
  <div class="tile">
    <div class="tlab">{{ label }}</div>
    <div class="tval" :data-testid="testid">{{ value }}</div>
    <div v-if="range && geom" class="range" :data-testid="rangeTestid">
      <svg
        class="whisker"
        viewBox="0 0 120 20"
        preserveAspectRatio="none"
        role="img"
        :aria-label="ariaLabel"
      >
        <line x1="0" y1="10" x2="120" y2="10" class="track" />
        <line :x1="geom.zero" y1="3" :x2="geom.zero" y2="17" class="zero-tick" />
        <g :class="spansZero ? 'span-ok' : 'span-sig'">
          <line :x1="geom.low" y1="10" :x2="geom.high" y2="10" class="bar" />
          <line :x1="geom.low" y1="6" :x2="geom.low" y2="14" class="cap" />
          <line :x1="geom.high" y1="6" :x2="geom.high" y2="14" class="cap" />
          <circle :cx="geom.point" cy="10" r="3" class="dot" />
        </g>
      </svg>
      <div class="range-cap">{{ caption }}</div>
      <div v-if="zeroNote" class="zero-note" :data-testid="zeroNoteTestid">
        <v-icon size="13" color="success" class="zn-icon">mdi-check-circle</v-icon>
        <span>{{ zeroNote }}</span>
      </div>
    </div>
  </div>
</template>

<style scoped>
.tile {
  background: rgb(var(--v-theme-surface-bright));
  border-radius: 10px;
  padding: 10px 8px;
  text-align: center;
}
.tlab {
  font-size: 11px;
  color: rgba(var(--v-theme-on-surface), 0.6);
  text-transform: uppercase;
  letter-spacing: 0.05em;
}
.tval {
  font-size: clamp(15px, 4.2vw, 20px);
  white-space: nowrap;
  font-weight: 500;
  font-family: 'Roboto Mono', ui-monospace, monospace;
  margin-top: 2px;
}
.range {
  margin-top: 6px;
}
.whisker {
  display: block;
  width: 100%;
  height: 20px;
}
.track {
  stroke: rgba(var(--v-theme-on-surface), 0.18);
  stroke-width: 1;
}
.zero-tick {
  stroke: rgba(var(--v-theme-on-surface), 0.35);
  stroke-width: 1;
  stroke-dasharray: 2 2;
}
.span-sig .bar {
  stroke: rgb(var(--v-theme-primary));
}
.span-sig .cap {
  stroke: rgb(var(--v-theme-primary));
}
.span-sig .dot {
  fill: rgb(var(--v-theme-primary));
}
.span-ok .bar {
  stroke: rgb(var(--v-theme-success));
}
.span-ok .cap {
  stroke: rgb(var(--v-theme-success));
}
.span-ok .dot {
  fill: rgb(var(--v-theme-success));
}
.bar {
  stroke-width: 2;
  stroke-linecap: round;
}
.cap {
  stroke-width: 2;
  stroke-linecap: round;
}
.range-cap {
  font-size: 11px;
  line-height: 1.4;
  color: rgba(var(--v-theme-on-surface), 0.65);
  white-space: normal;
  overflow-wrap: break-word;
  margin-top: 2px;
}
.zero-note {
  display: flex;
  align-items: flex-start;
  gap: 4px;
  text-align: left;
  font-size: 11px;
  line-height: 1.4;
  color: rgb(var(--v-theme-success));
  margin-top: 4px;
}
.zn-icon {
  margin-top: 1px;
  flex-shrink: 0;
}
</style>
