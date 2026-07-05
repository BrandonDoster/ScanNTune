<script setup lang="ts">
// Diagram: which side of the card to measure (the 85.6 mm long side), with the 54 mm short side for
// reference. Ported from the desktop app.
</script>

<template>
  <svg viewBox="0 0 300 170" class="diagram" role="img" aria-label="Measure the long side of the card">
    <rect x="52" y="22" width="158" height="100" rx="10" fill="#2F80D8" />
    <rect x="62" y="31" width="20" height="14" rx="3" fill="#BCD8F2" />
    <circle cx="185" cy="106" r="9" fill="#E0563F" />
    <circle cx="197" cy="106" r="9" fill="#EAA63F" />

    <line x1="52" y1="122" x2="52" y2="150" class="border" />
    <line x1="210" y1="122" x2="210" y2="150" class="border" />
    <line x1="52" y1="146" x2="210" y2="146" class="primaryStroke" stroke-width="1.6" />
    <polyline points="60,141 52,146 60,151" class="primaryStroke" fill="none" stroke-width="1.5" />
    <polyline points="202,141 210,146 202,151" class="primaryStroke" fill="none" stroke-width="1.5" />
    <rect x="103" y="136" width="56" height="20" rx="6" class="pill" />
    <text x="111" y="150" class="primaryText">85.6 mm</text>

    <line x1="210" y1="22" x2="242" y2="22" class="border" />
    <line x1="210" y1="122" x2="242" y2="122" class="border" />
    <line x1="236" y1="22" x2="236" y2="122" class="sec" stroke-width="1.4" />
    <polyline points="231,30 236,22 241,30" class="sec" fill="none" stroke-width="1.3" />
    <polyline points="231,114 236,122 241,114" class="sec" fill="none" stroke-width="1.3" />
    <text x="246" y="76" class="lbl">54 mm</text>
  </svg>
</template>

<style scoped>
.diagram {
  width: 100%;
  max-width: 300px;
  height: auto;
}
.border {
  stroke: rgba(var(--v-theme-on-surface), 0.2);
}
.sec {
  stroke: rgba(var(--v-theme-on-surface), 0.5);
}
.primaryStroke {
  stroke: rgb(var(--v-theme-primary));
}
.pill {
  fill: rgb(var(--v-theme-surface-light));
}
.primaryText {
  fill: rgb(var(--v-theme-primary));
  font-size: 12px;
}
.lbl {
  fill: rgba(var(--v-theme-on-surface), 0.6);
  font-size: 11px;
}
</style>
