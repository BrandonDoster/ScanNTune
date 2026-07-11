<script setup lang="ts">
// Diagram: the resonance coupon layout. A frame band with three fiducial holes and a solid
// origin corner, and one axis group of test lines: a run-up leg along the band, a sharp
// 90 degree corner, and the measured segment where the ringing appears as a wiggle.
</script>

<template>
  <svg
    viewBox="0 0 480 210"
    class="diagram"
    role="img"
    aria-label="The resonance coupon: a frame with three corner holes and a solid origin corner; each test line approaches along a slow run-up leg, turns a sharp 90 degree corner, accelerates to the test speed, and the ringing is recorded as a wiggle on the measured segment"
  >
    <!-- Coupon frame: outer edge and open window. -->
    <rect x="40" y="24" width="220" height="164" rx="6" class="couponFill" />
    <rect x="64" y="48" width="172" height="116" rx="3" class="window" />

    <!-- Fiducial holes in three corners; the origin corner (bottom-left) stays solid. -->
    <rect x="238" y="34" width="12" height="12" rx="2" class="hole" />
    <rect x="238" y="166" width="12" height="12" rx="2" class="hole" />
    <rect x="50" y="34" width="12" height="12" rx="2" class="hole" />
    <circle cx="56" cy="172" r="2.5" class="solidDot" />
    <line x1="62" y1="172" x2="286" y2="172" class="callout" />
    <text x="290" y="176" class="lbl">solid corner marks the origin</text>

    <!-- One test line: run-up leg along the inside of the band, then the 90 degree corner. -->
    <line x1="88" y1="154" x2="148" y2="154" class="runup" stroke-width="2.5" />
    <polyline points="140,149 148,154 140,159" class="runupStroke" fill="none" stroke-width="1.8" />
    <!-- Measured segment: ringing wiggle right after the corner, settling further on. -->
    <path
      d="M148 154 L148 146 C144 142 152 138 148 134 C144 130 151 126 148 122 C146 119 150 116 148 113 L148 60"
      class="measured"
      fill="none"
      stroke-width="2.5"
    />
    <!-- Neighbour lines of the same group, drawn plain. -->
    <line x1="162" y1="154" x2="162" y2="60" class="plain" stroke-width="2" />
    <line x1="176" y1="154" x2="176" y2="60" class="plain" stroke-width="2" />
    <line x1="190" y1="154" x2="190" y2="60" class="plain" stroke-width="2" />

    <!-- Corner marker. -->
    <circle cx="148" cy="154" r="4" class="cornerRing" fill="none" stroke-width="1.6" />

    <line x1="112" y1="148" x2="112" y2="118" class="callout" />
    <line x1="112" y1="118" x2="286" y2="118" class="callout" />
    <text x="290" y="122" class="lbl">slow run-up leg approaches the corner</text>

    <line x1="152" y1="158" x2="200" y2="196" class="callout" />
    <line x1="200" y1="196" x2="286" y2="196" class="callout" />
    <text x="290" y="200" class="lbl">sharp 90 degree corner rings the axis</text>

    <line x1="142" y1="130" x2="120" y2="80" class="callout" />
    <line x1="120" y1="80" x2="286" y2="80" class="callout" />
    <text x="290" y="84" class="lbl">ringing recorded as a wiggle</text>
  </svg>
</template>

<style scoped>
.diagram {
  width: 100%;
  max-width: 440px;
  height: auto;
}
.lbl {
  fill: rgba(var(--v-theme-on-surface), 0.6);
  font-size: 11px;
}
.couponFill {
  fill: rgba(var(--v-theme-on-surface), 0.22);
}
.window {
  fill: rgb(var(--v-theme-surface));
  stroke: rgba(var(--v-theme-on-surface), 0.15);
}
.hole {
  fill: rgb(var(--v-theme-surface));
  stroke: rgba(var(--v-theme-on-surface), 0.35);
}
.solidDot {
  fill: rgba(var(--v-theme-on-surface), 0.55);
}
.callout {
  stroke: rgba(var(--v-theme-on-surface), 0.35);
  stroke-width: 1;
}
.runup {
  stroke: rgb(var(--v-theme-primary));
}
.runupStroke {
  stroke: rgb(var(--v-theme-primary));
}
.measured {
  stroke: rgb(var(--v-theme-success));
}
.plain {
  stroke: rgba(var(--v-theme-on-surface), 0.4);
}
.cornerRing {
  stroke: rgb(var(--v-theme-warning));
}
</style>
