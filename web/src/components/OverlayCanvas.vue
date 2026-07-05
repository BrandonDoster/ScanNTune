<script setup lang="ts">
import { onMounted, ref, watch } from 'vue'

const props = defineProps<{ bitmap: ImageBitmap | null; label?: string }>()
const canvas = ref<HTMLCanvasElement | null>(null)

function draw(): void {
  const c = canvas.value
  const b = props.bitmap
  if (!c || !b) return
  c.width = b.width
  c.height = b.height
  c.getContext('2d')?.drawImage(b, 0, 0)
}

onMounted(draw)
watch(() => props.bitmap, draw)
</script>

<template>
  <figure class="ma-0">
    <canvas ref="canvas" class="overlay" />
    <figcaption v-if="label" class="text-caption text-center mt-1">{{ label }}</figcaption>
  </figure>
</template>

<style scoped>
.overlay {
  width: 100%;
  height: auto;
  display: block;
  border-radius: 6px;
}
</style>
