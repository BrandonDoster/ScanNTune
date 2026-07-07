<script setup lang="ts">
import type { ImportSummary } from '../composables/useProfileForm'
import { useCopyPath } from '../composables/useCopyPath'

defineProps<{ summary: ImportSummary }>()

const { copiedPath, copyPath } = useCopyPath()

/**
 * Path hint embedded in an unresolved-inherits warning, if any. Returns null when the vendor
 * folder is unknown (the literal "<vendor>" placeholder): that text is guidance, not a real path,
 * so it is shown as plain text rather than offered behind a misleading copy button.
 */
function parentPathHint(warning: string): string | null {
  const match = warning.match(/(resources\\profiles\\[^\s]+)$/)
  if (match === null || match[1].includes('<vendor>')) return null
  return match[1]
}
</script>

<template>
  <div data-testid="import-summary">
    <v-alert
      v-if="summary.wrongKind"
      type="warning"
      density="compact"
      variant="tonal"
      class="mb-1 text-body-2"
      :text="summary.wrongKind"
      data-testid="import-wrong-kind"
    />
    <div v-else class="text-body-2">
      Filled {{ summary.importedCount }}
      {{ summary.importedCount === 1 ? 'field' : 'fields' }} from the imported config.
    </div>
    <div
      v-if="!summary.wrongKind && summary.missing.length > 0"
      class="text-caption text-medium-emphasis"
    >
      Not in the file (kept as-is): {{ summary.missing.join(', ') }}
    </div>
    <v-alert
      v-for="(warning, i) in summary.warnings"
      :key="i"
      type="warning"
      density="compact"
      variant="tonal"
      class="mt-1 text-body-2"
    >
      <div>{{ warning }}</div>
      <div v-if="parentPathHint(warning)" class="d-flex align-center ga-1 mt-1">
        <code class="copy-path">{{ parentPathHint(warning) }}</code>
        <v-btn
          icon="mdi-content-copy"
          size="x-small"
          variant="text"
          title="Copy"
          @click="copyPath(parentPathHint(warning)!)"
        />
        <span v-if="copiedPath === parentPathHint(warning)" class="text-success">copied</span>
      </div>
    </v-alert>
  </div>
</template>

<style scoped>
.copy-path {
  font-family: 'Roboto Mono', ui-monospace, monospace;
  user-select: all;
  background: rgba(128, 128, 128, 0.15);
  border-radius: 4px;
  padding: 0 4px;
  word-break: break-all;
}
</style>
