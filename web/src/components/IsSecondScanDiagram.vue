<script setup lang="ts">
// Diagram: the second scan of the resonance coupon, in the shared scanner pictogram style.
// The same part is rotated a quarter turn clockwise relative to the first scan, so the
// solid origin corner moves to the top right and the two line groups swap directions.
</script>

<template>
  <svg
    viewBox="0 0 480 200"
    class="diagram"
    role="img"
    aria-label="Second scan: the same coupon rotated a quarter turn clockwise, so the solid corner sits at the top right and the fiducial holes at the other three corners."
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
      <!-- The quarter-turned coupon: portrait, with the window and the three fiducial
           holes cut out of the band. -->
      <mask id="is-second-scan-cutout">
        <rect x="160" y="60" width="92" height="112" rx="5" fill="#fff" />
        <rect x="176" y="76" width="60" height="80" rx="3" fill="#000" />
        <rect x="165" y="65" width="9" height="9" rx="2" fill="#000" />
        <rect x="165" y="158" width="9" height="9" rx="2" fill="#000" />
        <rect x="238" y="158" width="9" height="9" rx="2" fill="#000" />
      </mask>
    </defs>

    <rect
      x="160"
      y="60"
      width="92"
      height="112"
      rx="5"
      class="couponFill"
      mask="url(#is-second-scan-cutout)"
    />
    <!-- Solid origin corner: after the quarter turn it sits at the top right. -->
    <circle cx="243" cy="69" r="2.5" class="solidDot" />

    <!-- The line groups after the quarter turn: the former horizontal group is now
         vertical on the right, the former vertical group horizontal at the top left. -->
    <line x1="212" y1="82" x2="212" y2="150" class="green" stroke-width="1.8" />
    <line x1="219" y1="82" x2="219" y2="150" class="green" stroke-width="1.8" />
    <line x1="226" y1="82" x2="226" y2="150" class="green" stroke-width="1.8" />
    <line x1="180" y1="86" x2="202" y2="86" class="green" stroke-width="1.8" />
    <line x1="180" y1="93" x2="202" y2="93" class="green" stroke-width="1.8" />
    <line x1="180" y1="100" x2="202" y2="100" class="green" stroke-width="1.8" />

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
.solidDot {
  fill: rgba(var(--v-theme-on-surface), 0.55);
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
