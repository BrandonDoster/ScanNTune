<script setup lang="ts">
// Diagram: the second scan of the resonance coupon, in the shared scanner pictogram style.
// The coupon miniature is the same engine-computed geometry as the first diagram, rotated
// a quarter turn clockwise as a whole, so the solid origin corner moves to the top right
// and the two line groups swap directions.
import { isCouponMiniature } from './isCouponMiniature'

const m = isCouponMiniature(206, 116, 92)
const turn = 'rotate(90 206 116)'
</script>

<template>
  <svg
    viewBox="0 0 480 200"
    class="diagram"
    role="img"
    aria-label="Second scan: the same coupon rotated a quarter turn clockwise, so the corner without a hole sits at the top right and the fiducial holes at the other three corners."
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
      <!-- The quarter-turned coupon: the first diagram's engine-computed geometry with the
           window and the three fiducial holes cut out of the band, rotated as a whole. -->
      <!-- Mask content is evaluated in the user space of the element referencing it, which
           already sits inside the rotated group, so the cutouts stay unrotated here. -->
      <mask id="is-second-scan-cutout">
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

    <g :transform="turn">
      <rect
        :x="m.plate.x"
        :y="m.plate.y"
        :width="m.plate.width"
        :height="m.plate.height"
        class="couponFill"
        mask="url(#is-second-scan-cutout)"
      />
      <!-- The two crossing line groups from the engine geometry, turned with the coupon:
           the weave now sits near the top-right of the window. -->
      <polyline
        v-for="(pts, i) in m.linePoints"
        :key="i"
        :points="pts"
        class="green"
        fill="none"
        :stroke-width="m.pitchPx * 0.35"
      />
    </g>

    <!-- Quarter-turn arrow above the solid corner. -->
    <path
      d="M256 82 Q276 88 274 108"
      class="turnArrow"
      fill="none"
      marker-end="url(#is-second-scan-arrow)"
    />
    <defs>
      <marker
        id="is-second-scan-arrow"
        viewBox="0 0 8 8"
        refX="7"
        refY="4"
        markerWidth="6"
        markerHeight="6"
        orient="auto-start-reverse"
      >
        <path d="M0 0 L8 4 L0 8 z" class="arrowHead" />
      </marker>
    </defs>

    <text x="316" y="113" class="lbl">same part, a quarter turn</text>
    <text x="316" y="128" class="lbl">clockwise</text>
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
.turnArrow {
  stroke: rgb(var(--v-theme-primary));
  stroke-width: 2;
}
.arrowHead {
  fill: rgb(var(--v-theme-primary));
}
</style>
