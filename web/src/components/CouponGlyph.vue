<script setup lang="ts">
// A stylised coupon: a 3x3 ring lattice with the origin corner and its +X neighbour drawn solid (the
// two indigo rings) as the orientation marker, so a quarter-turn is visually obvious.
defineProps<{ rotate?: number; size?: number }>()
</script>

<template>
  <svg
    :width="size ?? 84"
    :height="size ?? 84"
    viewBox="0 0 100 100"
    class="glyph"
    :style="{ transform: `rotate(${rotate ?? 0}deg)` }"
    aria-hidden="true"
  >
    <rect x="6" y="6" width="88" height="88" rx="7" class="bg" />
    <circle cx="28" cy="28" r="7.5" class="solid" />
    <circle cx="50" cy="28" r="7.5" class="solid" />
    <circle cx="72" cy="28" r="7.5" class="ring" />
    <circle cx="28" cy="50" r="7.5" class="ring" />
    <circle cx="50" cy="50" r="7.5" class="ring" />
    <circle cx="72" cy="50" r="7.5" class="ring" />
    <circle cx="28" cy="72" r="7.5" class="ring" />
    <circle cx="50" cy="72" r="7.5" class="ring" />
    <circle cx="72" cy="72" r="7.5" class="ring" />
  </svg>
</template>

<style scoped>
.glyph {
  transition: transform 0.6s ease;
}
.bg {
  fill: rgba(var(--v-theme-on-surface), 0.04);
  stroke: rgba(var(--v-theme-on-surface), 0.25);
  stroke-width: 1.5;
}
.solid {
  fill: rgb(var(--v-theme-primary));
}
.ring {
  fill: none;
  stroke: rgba(var(--v-theme-on-surface), 0.5);
  stroke-width: 2;
}
</style>
