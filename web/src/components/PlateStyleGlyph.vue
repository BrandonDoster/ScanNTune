<script setup lang="ts">
// A small side-view mini of a plate on the bed line: flat (lying on the bed) or standing on edge,
// used to show which plates print upright.
defineProps<{ standing?: boolean }>()
</script>

<template>
  <svg width="72" height="60" viewBox="0 0 72 60" class="glyph" aria-hidden="true">
    <!-- Bed line. -->
    <line x1="4" y1="52" x2="68" y2="52" class="bed" />
    <template v-if="standing">
      <!-- Standing on edge: tall thin slab. -->
      <rect x="30" y="8" width="12" height="44" rx="2" class="plate" />
    </template>
    <template v-else>
      <!-- Flat on the bed: wide thin slab. -->
      <rect x="12" y="42" width="48" height="10" rx="2" class="plate" />
    </template>
  </svg>
</template>

<style scoped>
.bed {
  stroke: rgba(var(--v-theme-on-surface), 0.4);
  stroke-width: 2;
  stroke-linecap: round;
}
.plate {
  fill: rgba(var(--v-theme-primary), 0.18);
  stroke: rgb(var(--v-theme-primary));
  stroke-width: 1.6;
}
</style>
