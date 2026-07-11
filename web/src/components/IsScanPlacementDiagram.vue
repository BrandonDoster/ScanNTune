<script setup lang="ts">
// Diagram: the two recommended coupon placements on the scanner glass, seen from above.
// The first scan lies with the solid corner at the top left; the second is the same part
// rotated a quarter turn clockwise, so the solid corner moves to the top right. The three
// fiducial holes and the solid corner are the orientation cues; both coupons render as one
// surface with the window and holes cut out via a mask, matching the guide diagram style.
</script>

<template>
  <svg
    viewBox="0 0 480 210"
    class="diagram"
    role="img"
    aria-label="The two scan placements. First scan: the coupon lies with the solid corner at the top left and the fiducial holes at the other three corners. Second scan: the same part rotated a quarter turn clockwise, so the solid corner sits at the top right."
  >
    <defs>
      <marker
        id="is-place-arrow"
        viewBox="0 0 8 8"
        refX="7"
        refY="4"
        markerWidth="7"
        markerHeight="7"
        orient="auto-start-reverse"
      >
        <path d="M0 0 L8 4 L0 8 z" class="arrowHead" />
      </marker>
      <!-- First placement: landscape, solid corner top left, holes at the other corners. -->
      <mask id="is-place-cutout-1">
        <rect x="30" y="44" width="156" height="108" rx="6" fill="#fff" />
        <rect x="50" y="60" width="116" height="68" rx="3" fill="#000" />
        <rect x="168" y="50" width="12" height="12" rx="2" fill="#000" />
        <rect x="168" y="134" width="12" height="12" rx="2" fill="#000" />
        <rect x="36" y="134" width="12" height="12" rx="2" fill="#000" />
      </mask>
      <!-- Second placement: the same coupon a quarter turn clockwise, solid corner top right. -->
      <mask id="is-place-cutout-2">
        <rect x="310" y="20" width="108" height="156" rx="6" fill="#fff" />
        <rect x="330" y="40" width="68" height="116" rx="3" fill="#000" />
        <rect x="316" y="26" width="12" height="12" rx="2" fill="#000" />
        <rect x="316" y="158" width="12" height="12" rx="2" fill="#000" />
        <rect x="400" y="158" width="12" height="12" rx="2" fill="#000" />
      </mask>
    </defs>

    <!-- First scan. -->
    <rect
      x="30"
      y="44"
      width="156"
      height="108"
      rx="6"
      class="couponFill"
      mask="url(#is-place-cutout-1)"
    />
    <circle cx="42" cy="56" r="3" class="solidDot" />
    <text x="108" y="172" text-anchor="middle" class="lbl">First scan</text>

    <!-- The solid corner callout on the first placement. -->
    <polyline points="44,53 62,14 130,14" class="callout" fill="none" />
    <text x="134" y="18" class="lbl">solid corner, no hole</text>

    <!-- Quarter-turn arrow between the placements. -->
    <path
      d="M204 104 Q246 66 288 104"
      class="turnArrow"
      fill="none"
      marker-end="url(#is-place-arrow)"
    />
    <text x="246" y="126" text-anchor="middle" class="lbl">quarter turn</text>
    <text x="246" y="140" text-anchor="middle" class="lbl">clockwise</text>

    <!-- Second scan. -->
    <rect
      x="310"
      y="20"
      width="108"
      height="156"
      rx="6"
      class="couponFill"
      mask="url(#is-place-cutout-2)"
    />
    <circle cx="406" cy="32" r="3" class="solidDot" />
    <text x="364" y="196" text-anchor="middle" class="lbl">Second scan</text>
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
.solidDot {
  fill: rgba(var(--v-theme-on-surface), 0.55);
}
.callout {
  stroke: rgba(var(--v-theme-on-surface), 0.35);
  stroke-width: 1;
}
.turnArrow {
  stroke: rgb(var(--v-theme-primary));
  stroke-width: 2;
}
.arrowHead {
  fill: rgb(var(--v-theme-primary));
}
</style>
