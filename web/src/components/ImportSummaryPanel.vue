<script setup lang="ts">
import { computed, ref } from 'vue'
import type { ImportSummary } from '../composables/useProfileForm'
import { useCopyPath } from '../composables/useCopyPath'
import { fieldLabel } from './fieldLabels'
import {
  importHeadline,
  plainWarnings as computePlainWarnings,
  splitMissing,
} from './importSummaryText'

const props = defineProps<{ summary: ImportSummary }>()
const emit = defineEmits<{ uploadParent: [file: File] }>()

const { copiedPath, copyPath } = useCopyPath()

const missingExpanded = ref(false)
const parentFileInput = ref<HTMLInputElement | null>(null)

const headline = computed(() => importHeadline(props.summary))
const plainWarnings = computed(() => computePlainWarnings(props.summary))
const missing = computed(() => splitMissing(props.summary))

/** How many filled-field label chips a source card shows before collapsing into "+N more". */
const CARD_LABEL_LIMIT = 5

function cardLabels(filled: string[]): string[] {
  return filled.slice(0, CARD_LABEL_LIMIT).map(fieldLabel)
}

function onParentPicked(event: Event): void {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  // Clear the input so picking the same file again still fires change.
  input.value = ''
  if (file !== undefined) emit('uploadParent', file)
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
    <template v-else>
      <div
        v-for="source in summary.sources"
        :key="source.fileName"
        class="source-card"
        data-testid="import-source-card"
      >
        <div class="d-flex align-center ga-2 text-body-2">
          <v-icon icon="mdi-check-circle" color="success" size="18" />
          <span class="font-weight-medium file-name">{{ source.fileName }}</span>
          <span class="text-medium-emphasis text-caption">
            {{ source.filled.length }} {{ source.filled.length === 1 ? 'field' : 'fields' }} filled
          </span>
        </div>
        <div v-if="source.filled.length > 0" class="chip-row mt-1">
          <v-chip
            v-for="label in cardLabels(source.filled)"
            :key="label"
            size="small"
            color="success"
            variant="tonal"
          >
            {{ label }}
          </v-chip>
          <v-chip v-if="source.filled.length > CARD_LABEL_LIMIT" size="small" variant="tonal">
            +{{ source.filled.length - CARD_LABEL_LIMIT }} more
          </v-chip>
        </div>
      </div>
      <div v-if="summary.sources.length === 0" class="d-flex align-center ga-2 text-body-2">
        <v-icon icon="mdi-check-circle" color="success" size="18" />
        <span data-testid="import-headline">{{ headline }}</span>
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

      <input
        ref="parentFileInput"
        type="file"
        accept=".json,.info,.txt"
        class="d-none"
        data-testid="import-parent-input"
        @change="onParentPicked"
      />
      <div
        v-for="(parent, i) in summary.unresolvedParents"
        :key="i"
        class="unresolved-parent mt-2 text-body-2"
        data-testid="import-unresolved-parent"
      >
        <div>
          Builds on
          <code class="preset-chip">{{ parent.presetName }}</code>
        </div>
        <div class="text-caption text-medium-emphasis mt-1">
          Upload it to fill more fields. It will be remembered for future imports.
        </div>
        <div class="d-flex align-center ga-2 mt-2 flex-wrap">
          <v-btn
            size="small"
            variant="tonal"
            color="warning"
            prepend-icon="mdi-upload"
            data-testid="import-parent-upload"
            @click="parentFileInput?.click()"
          >
            Upload base preset
          </v-btn>
          <template v-if="parent.pathHint !== null">
            <code class="copy-path">{{ parent.pathHint }}</code>
            <v-btn
              icon="mdi-content-copy"
              size="x-small"
              variant="text"
              title="Copy"
              @click="copyPath(parent.pathHint)"
            />
            <span v-if="copiedPath === parent.pathHint" class="text-success">copied</span>
          </template>
        </div>
        <div v-if="parent.pathHint === null" class="text-caption text-medium-emphasis mt-1">
          Find it under your OrcaSlicer installation's resources\profiles folder.
        </div>
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
        <div v-if="missingExpanded" class="mt-1">
          <div v-if="missing.inBasePreset.length > 0" data-testid="import-missing-base">
            <div class="text-caption text-medium-emphasis">In the base preset:</div>
            <div class="chip-row mt-1">
              <v-chip
                v-for="field in missing.inBasePreset"
                :key="field"
                size="small"
                color="warning"
                variant="tonal"
              >
                {{ fieldLabel(field) }}
              </v-chip>
            </div>
          </div>
          <div
            v-if="missing.setManually.length > 0"
            :class="{ 'mt-1': missing.inBasePreset.length > 0 }"
            data-testid="import-missing-chips"
          >
            <div v-if="missing.inBasePreset.length > 0" class="text-caption text-medium-emphasis">
              Set manually:
            </div>
            <div class="chip-row mt-1">
              <v-chip
                v-for="field in missing.setManually"
                :key="field"
                size="small"
                variant="outlined"
                class="text-medium-emphasis"
              >
                {{ fieldLabel(field) }}
              </v-chip>
            </div>
          </div>
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
.source-card {
  border: 1px solid rgba(var(--v-theme-success), 0.35);
  border-radius: 4px;
  padding: 8px 12px;
  margin-top: 8px;
}
.source-card:first-child {
  margin-top: 0;
}
.file-name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.unresolved-parent {
  background: rgba(var(--v-theme-warning), 0.08);
  border: 1px solid rgba(var(--v-theme-warning), 0.45);
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
  font-size: 11.5px;
  user-select: all;
  background: rgba(128, 128, 128, 0.15);
  border-radius: 4px;
  padding: 0 4px;
  word-break: break-all;
}
</style>
