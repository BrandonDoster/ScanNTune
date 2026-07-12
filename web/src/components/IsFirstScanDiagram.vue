<script setup lang="ts">
// Diagram: the first scan of the resonance coupon on the flatbed, in the shared scanner
// pictogram style (device body, scan-direction arrow, dashed scan bed, side legend). The
// coupon miniature is computed from the engine's real coupon geometry (plate, window,
// fiducial holes, and every test line), so it matches the actual print by construction;
// the solid origin corner lands at the top left.
import { isCouponMiniature } from './isCouponMiniature'

const m = isCouponMiniature(206, 112, 92)
</script>

<template>
  <svg
    viewBox="0 0 480 200"
    class="diagram"
    role="img"
    aria-label="First scan: the resonance coupon lies on the scanner glass with the printed top face down, the corner without a hole at the top left and the fiducial holes at the other three corners. The corner without a hole marks the origin and the ringing is read from the test lines."
  >
    <line x1="172" y1="18" x2="300" y2="18" class="sec" stroke-width="2" />
    <polyline points="291,13 300,18 291,23" class="sec" fill="none" stroke-width="1.8" />
    <text x="66" y="22" class="lbl">scan direction</text>

    <rect x="56" y="28" width="250" height="164" rx="12" class="body" />
    <rect x="56" y="28" width="250" height="12" rx="6" class="lid" />
    <circle cx="96" cy="34" r="2" class="dotFill" />
    <circle cx="266" cy="34" r="2" class="dotFill" />

    <rect x="72" y="46" width="210" height="140" rx="6" class="platen" />
    <rect x="84" y="58" width="186" height="116" rx="4" class="dash" />

    <rect x="120" y="46" width="6" height="140" rx="2" class="sweep" />
    <polyline points="132,110 139,117 132,124" class="sweepStroke" fill="none" stroke-width="1.5" />
    <polyline points="144,110 151,117 144,124" class="sweepStroke" fill="none" stroke-width="1.5" />

    <defs>
      <!-- The window and the three fiducial holes are cut out of the band, so the coupon
           renders as one object with holes. -->
      <mask id="is-first-scan-cutout">
        <rect
          :x="m.plate.x"
          :y="m.plate.y"
          :width="m.plate.width"
          :height="m.plate.height"
          fill="#fff"
        />
        <rect
          :x="m.window.x"
          :y="m.window.y"
          :width="m.window.width"
          :height="m.window.height"
          fill="#000"
        />
        <rect
          v-for="(f, i) in m.fiducials"
          :key="i"
          :x="f.x"
          :y="f.y"
          :width="f.width"
          :height="f.height"
          fill="#000"
        />
      </mask>
    </defs>

    <rect
      :x="m.plate.x"
      :y="m.plate.y"
      :width="m.plate.width"
      :height="m.plate.height"
      class="couponFill"
      mask="url(#is-first-scan-cutout)"
    />
    <!-- The two crossing line groups, straight from the engine geometry: each line is one
         continuous L (run-up leg, ringing corner, measured run into the opposite band). -->
    <polyline
      v-for="(pts, i) in m.linePoints"
      :key="i"
      :points="pts"
      class="green"
      fill="none"
      :stroke-width="m.pitchPx * 0.35"
    />

    <text x="336" y="88" class="lbl">the corner without a hole marks the origin</text>
    <rect x="316" y="108" width="14" height="4" rx="2" class="greenFill" />
    <text x="336" y="113" class="lbl">ringing is read from the lines</text>
    <text x="316" y="136" class="lbl">printed top face lies on the glass</text>
  </svg>
</template>

<style scoped>
.diagram {
  width: 100%;
  max-width: 420px;
  height: auto;
}
.sec {
  stroke: rgba(var(--v-theme-on-surface), 0.5);
}
.lbl {
  fill: rgba(var(--v-theme-on-surface), 0.6);
  font-size: 11px;
}
.body {
  fill: rgb(var(--v-theme-surface));
  stroke: rgba(var(--v-theme-on-surface), 0.25);
}
.lid {
  fill: rgb(var(--v-theme-background));
  stroke: rgba(var(--v-theme-on-surface), 0.15);
}
.dotFill {
  fill: rgba(var(--v-theme-on-surface), 0.5);
}
.platen {
  fill: rgb(var(--v-theme-background));
  stroke: rgba(var(--v-theme-on-surface), 0.15);
}
.dash {
  fill: none;
  stroke: rgba(var(--v-theme-on-surface), 0.5);
  stroke-dasharray: 4 3;
}
.sweep {
  fill: rgb(var(--v-theme-primary));
}
.sweepStroke {
  stroke: rgb(var(--v-theme-primary));
}
.couponFill {
  fill: rgba(var(--v-theme-on-surface), 0.25);
}
.green {
  stroke: rgb(var(--v-theme-success));
}
.greenFill {
  fill: rgb(var(--v-theme-success));
}
</style>
