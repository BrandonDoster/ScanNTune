<script setup lang="ts">
import { computed, ref } from 'vue'
import type { ImportSummary } from '../composables/useProfileForm'
import { useCopyPath } from '../composables/useCopyPath'
import { fieldLabel } from './fieldLabels'
import { importHeadline, plainWarnings as computePlainWarnings } from './importSummaryText'

const props = defineProps<{ summary: ImportSummary }>()

const { copiedPath, copyPath } = useCopyPath()

const missingExpanded = ref(false)

const headline = computed(() => importHeadline(props.summary))
const plainWarnings = computed(() => computePlainWarnings(props.summary))
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
    <template v-else>
      <div class="d-flex align-center ga-2 text-body-2">
        <v-icon icon="mdi-check-circle" color="success" size="18" />
        <span data-testid="import-headline">{{ headline }}</span>
      </div>

      <div v-if="summary.filled.length > 0" class="chip-row mt-2" data-testid="import-filled-chips">
        <v-chip
          v-for="field in summary.filled"
          :key="field"
          size="small"
          color="success"
          variant="tonal"
        >
          {{ fieldLabel(field) }}
        </v-chip>
      </div>

      <div v-if="summary.missing.length > 0" class="mt-2">
        <button
          type="button"
          class="missing-toggle text-caption text-medium-emphasis"
          data-testid="import-missing-toggle"
          @click="missingExpanded = !missingExpanded"
        >
          <v-icon
            :icon="missingExpanded ? 'mdi-chevron-down' : 'mdi-chevron-right'"
            size="16"
          />
          {{ summary.missing.length }} fields not in the file (kept as-is)
        </button>
        <div v-if="missingExpanded" class="chip-row mt-1" data-testid="import-missing-chips">
          <v-chip
            v-for="field in summary.missing"
            :key="field"
            size="small"
            variant="outlined"
            class="text-medium-emphasis"
          >
            {{ fieldLabel(field) }}
          </v-chip>
        </div>
      </div>

      <v-alert
        v-for="(warning, i) in plainWarnings"
        :key="i"
        type="warning"
        density="compact"
        variant="tonal"
        class="mt-2 text-body-2"
        :text="warning"
      />

      <div
        v-for="(parent, i) in summary.unresolvedParents"
        :key="i"
        class="unresolved-parent mt-2 text-body-2"
        data-testid="import-unresolved-parent"
      >
        <div class="font-weight-bold">Base preset not uploaded</div>
        <div class="mt-1">
          This preset inherits from
          <code class="preset-chip">{{ parent.presetName }}</code>
          which was not uploaded.
        </div>
        <div v-if="parent.pathHint !== null" class="d-flex align-center ga-1 mt-1">
          <code class="copy-path">{{ parent.pathHint }}</code>
          <v-btn
            icon="mdi-content-copy"
            size="x-small"
            variant="text"
            title="Copy"
            @click="copyPath(parent.pathHint)"
          />
          <span v-if="copiedPath === parent.pathHint" class="text-success">copied</span>
        </div>
        <div v-else class="text-caption text-medium-emphasis mt-1">
          Find it under your OrcaSlicer installation's resources\profiles\&lt;vendor&gt;\machine\
          folder.
        </div>
      </div>
    </template>
  </div>
</template>

<style scoped>
.chip-row {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}
.missing-toggle {
  display: inline-flex;
  align-items: center;
  background: none;
  border: none;
  padding: 0;
  cursor: pointer;
  color: inherit;
}
.unresolved-parent {
  background: rgba(var(--v-theme-warning), 0.1);
  border-radius: 4px;
  padding: 8px 12px;
}
.preset-chip {
  font-family: 'Roboto Mono', ui-monospace, monospace;
  background: rgba(128, 128, 128, 0.15);
  border-radius: 4px;
  padding: 0 4px;
}
.copy-path {
  font-family: 'Roboto Mono', ui-monospace, monospace;
  user-select: all;
  background: rgba(128, 128, 128, 0.15);
  border-radius: 4px;
  padding: 0 4px;
  word-break: break-all;
}
</style>
