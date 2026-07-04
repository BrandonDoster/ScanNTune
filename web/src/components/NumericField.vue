<script setup lang="ts">
// A labelled numeric stepper. No Maximum (never cap what the user may enter); a sensible floor and
// per-field increment are passed in.
defineProps<{
  label: string
  modelValue: number | null
  step?: number
  min?: number
  hint?: string
}>()
defineEmits<{ 'update:modelValue': [number | null] }>()
</script>

<template>
  <v-number-input
    :label="label"
    :model-value="modelValue"
    :step="step ?? 1"
    :min="min"
    :hint="hint"
    :persistent-hint="!!hint"
    control-variant="stacked"
    density="comfortable"
    @update:model-value="$emit('update:modelValue', $event)"
  />
</template>
