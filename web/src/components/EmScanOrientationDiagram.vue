<script setup lang="ts">
// Diagram: the flow coupon on the flatbed, showing that the test lines must run parallel to
// the lamp's sweep direction (clean read) rather than across it (the lamp shadows the narrow
// gaps between lines). A 180 degree turn of the coupon does not matter, only a 90 degree one.
</script>

<template>
  <svg
    viewBox="0 0 480 200"
    class="diagram"
    role="img"
    aria-label="Place the flow coupon with its test lines parallel to the scanner lamp's travel; a 180 degree turn is fine, a 90 degree turn shadows the gaps"
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

    <!-- Upper coupon: lines running with the lamp's travel (horizontal), the gaps stay lit. -->
    <rect x="150" y="64" width="70" height="48" rx="4" class="couponFill" />
    <line x1="154" y1="72" x2="216" y2="72" class="green" stroke-width="2" />
    <line x1="154" y1="80" x2="216" y2="80" class="green" stroke-width="2" />
    <line x1="154" y1="88" x2="216" y2="88" class="green" stroke-width="2" />
    <line x1="154" y1="96" x2="216" y2="96" class="green" stroke-width="2" />
    <line x1="154" y1="104" x2="216" y2="104" class="green" stroke-width="2" />
    <path d="M226 86 l4 4 l7 -8" class="greenStroke" fill="none" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" />

    <!-- Lower coupon: lines across the travel (vertical bars), the gaps get shadowed. -->
    <rect x="150" y="120" width="70" height="48" rx="4" class="couponFill" />
    <line x1="158" y1="124" x2="158" y2="164" class="amber" stroke-width="2" />
    <line x1="166" y1="124" x2="166" y2="164" class="amber" stroke-width="2" />
    <line x1="174" y1="124" x2="174" y2="164" class="amber" stroke-width="2" />
    <line x1="182" y1="124" x2="182" y2="164" class="amber" stroke-width="2" />
    <line x1="190" y1="124" x2="190" y2="164" class="amber" stroke-width="2" />
    <line x1="227" y1="140" x2="235" y2="148" class="amberStroke" stroke-width="2.4" stroke-linecap="round" />
    <line x1="235" y1="140" x2="227" y2="148" class="amberStroke" stroke-width="2.4" stroke-linecap="round" />

    <rect x="316" y="86" width="14" height="4" rx="2" class="greenFill" />
    <text x="336" y="91" class="lbl">lines parallel: reads clean</text>
    <rect x="316" y="112" width="14" height="4" rx="2" class="amberFill" />
    <text x="336" y="117" class="lbl">lines across: gaps shadow</text>
    <text x="316" y="138" class="lbl">a 180 degree turn is fine</text>
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
.amber {
  stroke: rgb(var(--v-theme-warning));
}
.greenStroke {
  stroke: rgb(var(--v-theme-success));
}
.amberStroke {
  stroke: rgb(var(--v-theme-warning));
}
.greenFill {
  fill: rgb(var(--v-theme-success));
}
.amberFill {
  fill: rgb(var(--v-theme-warning));
}
</style>
