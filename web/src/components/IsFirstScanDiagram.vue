<script setup lang="ts">
// Diagram: the first scan of the resonance coupon on the flatbed, in the shared scanner
// pictogram style (device body, scan-direction arrow, dashed scan bed, side legend). The
// coupon lies with the solid origin corner at the top left, fiducial holes at the other
// three corners, and a hint of the two line groups inside the open window.
</script>

<template>
  <svg
    viewBox="0 0 480 200"
    class="diagram"
    role="img"
    aria-label="First scan: the resonance coupon lies on the scanner glass with the printed top face down, the solid corner at the top left and the fiducial holes at the other three corners. The solid corner marks the origin and the ringing is read from the test lines."
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
        <rect x="150" y="66" width="112" height="92" rx="5" fill="#fff" />
        <rect x="166" y="82" width="80" height="60" rx="3" fill="#000" />
        <rect x="248" y="71" width="9" height="9" rx="2" fill="#000" />
        <rect x="248" y="144" width="9" height="9" rx="2" fill="#000" />
        <rect x="155" y="144" width="9" height="9" rx="2" fill="#000" />
      </mask>
    </defs>

    <rect
      x="150"
      y="66"
      width="112"
      height="92"
      rx="5"
      class="couponFill"
      mask="url(#is-first-scan-cutout)"
    />
    <!-- Solid origin corner: the top-left corner has no hole, only a marker dot. -->
    <circle cx="159" cy="75" r="2.5" class="solidDot" />

    <!-- A hint of the two line groups inside the window. -->
    <line x1="172" y1="92" x2="242" y2="92" class="green" stroke-width="1.8" />
    <line x1="172" y1="99" x2="242" y2="99" class="green" stroke-width="1.8" />
    <line x1="172" y1="106" x2="242" y2="106" class="green" stroke-width="1.8" />
    <line x1="178" y1="116" x2="178" y2="138" class="green" stroke-width="1.8" />
    <line x1="185" y1="116" x2="185" y2="138" class="green" stroke-width="1.8" />
    <line x1="192" y1="116" x2="192" y2="138" class="green" stroke-width="1.8" />

    <circle cx="322" cy="84" r="3" class="solidDot" />
    <text x="336" y="88" class="lbl">solid corner marks the origin</text>
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
.solidDot {
  fill: rgba(var(--v-theme-on-surface), 0.55);
}
.green {
  stroke: rgb(var(--v-theme-success));
}
.greenFill {
  fill: rgb(var(--v-theme-success));
}
</style>
