<script setup lang="ts">
import CouponGlyph from './CouponGlyph.vue'
import OverlayCanvas from './OverlayCanvas.vue'

defineProps<{
  label: string
  sublabel: string
  rotate?: number
  testid: string
  preview: string | null
  failed: boolean
  note: string
  loading: boolean
  overlay: ImageBitmap | null
}>()
const emit = defineEmits<{ pick: [File] }>()

function onChange(e: Event): void {
  const f = (e.target as HTMLInputElement).files?.[0]
  if (f) emit('pick', f)
}
function onDrop(e: DragEvent): void {
  const f = e.dataTransfer?.files?.[0]
  if (f) emit('pick', f)
}
</script>

<template>
  <label class="slot" :class="{ filled: !!preview || !!overlay, failed }" @dragover.prevent @drop.prevent="onDrop">
    <input
      type="file"
      class="hidden-input"
      accept="image/png,image/jpeg,image/tiff,image/webp"
      :data-testid="testid"
      @change="onChange"
    />
    <div class="slot-head">
      <span class="slot-label">{{ label }}</span>
      <span class="slot-sub">{{ sublabel }}</span>
    </div>
    <div class="slot-body">
      <OverlayCanvas v-if="overlay" :bitmap="overlay" />
      <img v-else-if="preview" :src="preview" class="preview" alt="scan preview" />
      <div v-else class="empty">
        <div class="glyph-wrap" :class="{ turn: !!rotate }">
          <CouponGlyph :size="76" />
        </div>
        <div class="choose">Choose file or drop here</div>
      </div>
    </div>
    <div v-if="failed && note" class="note">{{ note }}</div>
    <div v-if="loading" class="loading">
      <v-progress-circular indeterminate size="28" width="3" />
    </div>
  </label>
</template>

<style scoped>
.slot {
  position: relative;
  display: flex;
  flex-direction: column;
  gap: 8px;
  min-height: 210px;
  padding: 14px;
  border-radius: 12px;
  cursor: pointer;
  border: 1.5px dashed rgba(var(--v-theme-on-surface), 0.28);
  background: rgb(var(--v-theme-surface));
  transition: border-color 0.15s ease;
}
.slot:hover {
  border-color: rgb(var(--v-theme-primary));
}
.slot.filled {
  border-style: solid;
  border-color: rgba(var(--v-theme-on-surface), 0.2);
}
.slot.failed {
  border-style: solid;
  border-color: rgb(var(--v-theme-warning));
}
.slot-head {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
}
.slot-label {
  font-weight: 500;
}
.slot-sub {
  font-size: 12px;
  color: rgba(var(--v-theme-on-surface), 0.6);
}
.slot-body {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
}
.preview {
  max-width: 100%;
  max-height: 220px;
  height: auto;
  border-radius: 6px;
}
.empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
}
/* Slot 2's coupon rests quarter-turned; on hover it replays the turn, sweeping in from an offset to
   the right (upright) onto the centred 90-degree resting frame, holding at each end so the motion is
   easy to follow (matches the desktop app). */
.glyph-wrap {
  display: flex;
}
/* Pivot about the glyph's top-right corner: origin at the element's top-left, shifted right by one
   glyph width (76px) so that fixed screen point is the resting glyph's top-right corner. Rotating
   about it swings the coupon in from the right onto the centred quarter-turned resting frame. */
.glyph-wrap.turn {
  transform-origin: 0 0;
  transform: translateX(76px) rotate(90deg);
}
.slot:hover .glyph-wrap.turn {
  animation: quarter-turn 2.6s ease infinite;
}
@keyframes quarter-turn {
  0%,
  25% {
    transform: translateX(76px) rotate(0deg);
  }
  65%,
  100% {
    transform: translateX(76px) rotate(90deg);
  }
}
.choose {
  color: rgb(var(--v-theme-primary));
  font-size: 13px;
  font-weight: 500;
}
.note {
  font-size: 12px;
  color: rgb(var(--v-theme-warning));
}
.loading {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(0, 0, 0, 0.55);
  border-radius: 12px;
}
.hidden-input {
  position: absolute;
  width: 1px;
  height: 1px;
  opacity: 0;
  pointer-events: none;
}
</style>
