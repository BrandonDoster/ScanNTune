<script setup lang="ts">
// Diagram: a card on the flatbed with the sweep direction, the two edges to measure (green, run with
// the sweep so they stay shadow-free) and the shadow-prone edges (amber). Ported from the desktop app.
</script>

<template>
  <svg viewBox="0 0 420 200" class="diagram" role="img" aria-label="How to place the card on the scanner">
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

    <rect x="162" y="82" width="48" height="76" rx="7" fill="#2F80D8" />
    <rect x="168" y="90" width="11" height="8" rx="2" fill="#BCD8F2" />
    <line x1="162" y1="82" x2="210" y2="82" class="green" stroke-width="4" />
    <line x1="162" y1="158" x2="210" y2="158" class="green" stroke-width="4" />
    <line x1="162" y1="82" x2="162" y2="158" class="amber" stroke-width="2.2" />
    <line x1="210" y1="82" x2="210" y2="158" class="amber" stroke-width="2.2" />

    <rect x="316" y="92" width="14" height="4" rx="2" class="greenFill" />
    <text x="336" y="97" class="lbl">measure · clean</text>
    <rect x="316" y="118" width="14" height="4" rx="2" class="amberFill" />
    <text x="336" y="123" class="lbl">may shadow</text>
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
.green {
  stroke: rgb(var(--v-theme-success));
}
.amber {
  stroke: rgb(var(--v-theme-warning));
}
.greenFill {
  fill: rgb(var(--v-theme-success));
}
.amberFill {
  fill: rgb(var(--v-theme-warning));
}
</style>
