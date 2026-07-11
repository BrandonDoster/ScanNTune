<script setup lang="ts">
// Diagram: the resonance coupon layout. A frame band with three fiducial holes and a solid
// origin corner. Each test line enters through the frame band, runs up inside the open
// window, takes a sharp 90 degree corner there, and the measured segment records the
// ringing as a wiggle before crossing the other axis group's lines further on.
</script>

<template>
  <svg
    viewBox="0 0 480 210"
    class="diagram"
    role="img"
    aria-label="The resonance coupon: a frame with three corner holes and a solid origin corner; each test line enters through the frame band, runs up inside the open window, turns a sharp 90 degree corner there, accelerates to the test speed, and the ringing is recorded as a wiggle on the measured segment, which continues into the zone where the two axis groups cross"
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

    <!-- One test line: it enters through the bottom band, runs up inside the window,
         and turns the sharp corner in the open window. -->
    <line x1="88" y1="188" x2="88" y2="134" class="runup" stroke-width="2.5" />
    <polyline points="83,142 88,134 93,142" class="runupStroke" fill="none" stroke-width="1.8" />
    <!-- Measured segment: ringing wiggle right after the corner, settling further on. -->
    <path
      d="M88 134 L96 134 C100 130 104 138 108 134 C112 130 116 141 120 134 C123 131 126 137 129 134 L236 134"
      class="measured"
      fill="none"
      stroke-width="2.5"
    />
    <!-- Neighbour lines of the same group, drawn plain. -->
    <line x1="82" y1="188" x2="82" y2="146" class="plain" stroke-width="2" />
    <line x1="94" y1="146" x2="236" y2="146" class="plain" stroke-width="2" />
    <line x1="76" y1="188" x2="76" y2="158" class="plain" stroke-width="2" />
    <line x1="88" y1="158" x2="236" y2="158" class="plain" stroke-width="2" />
    <!-- The other axis group's lines crossing far past the read window. -->
    <line x1="206" y1="60" x2="206" y2="188" class="plain" stroke-width="2" />
    <line x1="218" y1="60" x2="218" y2="188" class="plain" stroke-width="2" />

    <!-- Corner marker. -->
    <circle cx="88" cy="134" r="4" class="cornerRing" fill="none" stroke-width="1.6" />

    <line x1="88" y1="166" x2="130" y2="100" class="callout" />
    <line x1="130" y1="100" x2="286" y2="100" class="callout" />
    <text x="290" y="104" class="lbl">run-up leg enters through the frame band</text>

    <line x1="84" y1="130" x2="120" y2="196" class="callout" />
    <line x1="120" y1="196" x2="286" y2="196" class="callout" />
    <text x="290" y="200" class="lbl">sharp 90 degree corner rings the axis</text>

    <line x1="112" y1="130" x2="140" y2="60" class="callout" />
    <line x1="140" y1="60" x2="286" y2="60" class="callout" />
    <text x="290" y="64" class="lbl">ringing recorded as a wiggle</text>

    <line x1="212" y1="120" x2="250" y2="120" class="callout" />
    <line x1="250" y1="120" x2="286" y2="132" class="callout" />
    <text x="290" y="136" class="lbl">groups cross past the read window</text>
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
