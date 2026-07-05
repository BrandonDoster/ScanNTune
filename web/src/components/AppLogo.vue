<script setup lang="ts">
// The app mark: the coupon's two-solid ring lattice, matching the favicon.
defineProps<{ size?: number }>()
</script>

<template>
  <svg :width="size ?? 24" :height="size ?? 24" viewBox="0 0 100 100" aria-hidden="true">
    <rect width="100" height="100" rx="22.5" fill="#22262d" />
    <circle cx="20" cy="20" r="11.68" fill="#818cf8" />
    <circle cx="50" cy="20" r="11.68" fill="#818cf8" />
    <g fill="none" stroke="#e7e9ee" stroke-width="3.32">
      <circle cx="80" cy="20" r="11.68" />
      <circle cx="20" cy="50" r="11.68" />
      <circle cx="50" cy="50" r="11.68" />
      <circle cx="80" cy="50" r="11.68" />
      <circle cx="20" cy="80" r="11.68" />
      <circle cx="50" cy="80" r="11.68" />
      <circle cx="80" cy="80" r="11.68" />
    </g>
  </svg>
</template>
