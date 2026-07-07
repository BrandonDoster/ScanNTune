<script setup lang="ts">
// A labelled numeric stepper. No Maximum (never cap what the user may enter); a sensible floor and
// per-field increment are passed in. `precision` sets the decimal places (0 = integer, the default of
// the underlying control, which would otherwise round decimals away).
defineProps<{
  label: string
  modelValue: number | null
  step?: number
  min?: number
  precision?: number
  placeholder?: string
  hint?: string
  disabled?: boolean
}>()
defineEmits<{ 'update:modelValue': [number | null] }>()
</script>

<template>
  <v-number-input
    :label="label"
    :model-value="modelValue"
    :step="step ?? 1"
    :min="min"
    :precision="precision"
    :placeholder="placeholder"
    :hint="hint"
    :disabled="disabled"
    :persistent-hint="!!hint"
    control-variant="stacked"
    density="comfortable"
    @update:model-value="$emit('update:modelValue', $event)"
  />
</template>
