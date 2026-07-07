<script setup lang="ts">
import { computed, ref } from 'vue'
import { useSlicerPresets } from '../stores/useSlicerPresets'
import type { SlicerName, OsName } from '../stores/useSlicerPresets'
import type { ImportKind, useProfileForm } from '../composables/useProfileForm'
import { useCopyPath } from '../composables/useCopyPath'
import { configPathHint } from './slicerConfigPaths'
import ImportSummaryPanel from './ImportSummaryPanel.vue'

const props = defineProps<{
  kind: ImportKind
  form: ReturnType<typeof useProfileForm>
}>()
const emit = defineEmits<{ done: [] }>()

const presets = useSlicerPresets()
const { copiedPath, copyPath } = useCopyPath()

const fileInput = ref<HTMLInputElement | null>(null)

const SLICERS: SlicerName[] = ['OrcaSlicer', 'PrusaSlicer']
const OSES: OsName[] = ['Windows', 'macOS', 'Linux']

const title = computed(() =>
  props.kind === 'printer' ? 'Import printer settings' : 'Import filament settings',
)
const subtitle = computed(() =>
  props.kind === 'printer'
    ? 'Fill the printer fields from an OrcaSlicer or PrusaSlicer preset.'
    : 'Fill the filament fields from an OrcaSlicer or PrusaSlicer preset.',
)

const pathHint = computed(() => configPathHint(presets.slicer, presets.os, props.kind))
const isOrca = computed(() => presets.slicer === 'OrcaSlicer')

const summary = computed(() =>
  props.form.importSummary.value?.kind === props.kind ? props.form.importSummary.value : null,
)
const applyLabel = computed(() =>
  summary.value ? `Apply ${summary.value.importedCount} fields` : 'Done',
)

function onFiles(event: Event): void {
  const input = event.target as HTMLInputElement
  const files = Array.from(input.files ?? [])
  input.value = ''
  void props.form.importFiles(files, props.kind)
}

function onUploadParent(file: File): void {
  void props.form.importParentFile(file)
}

function onInstallPath(value: string): void {
  presets.setInstallPath(value)
}
</script>

<template>
  <div class="import-view" data-testid="import-view">
    <div class="import-header">
      <v-btn
        icon="mdi-arrow-left"
        variant="text"
        size="small"
        title="Back"
        data-testid="import-back"
        @click="emit('done')"
      />
      <div class="header-text">
        <div class="header-title">{{ title }}</div>
        <div class="header-subtitle">{{ subtitle }}</div>
      </div>
      <v-spacer />
      <v-btn variant="text" size="small" data-testid="import-cancel" @click="emit('done')">
        Cancel
      </v-btn>
      <v-btn
        color="primary"
        variant="flat"
        size="small"
        data-testid="import-apply"
        @click="emit('done')"
      >
        {{ applyLabel }}
      </v-btn>
    </div>

    <div class="import-body">
      <div class="row">
        <v-select
          :model-value="presets.slicer"
          :items="SLICERS"
          label="Slicer"
          density="comfortable"
          hide-details
          data-testid="import-slicer"
          @update:model-value="presets.setSlicer"
        />
        <v-select
          :model-value="presets.os"
          :items="OSES"
          label="Operating system"
          density="comfortable"
          hide-details
          data-testid="import-os"
          @update:model-value="presets.setOs"
        />
      </div>

      <div class="paths mt-4">
        <div class="group-caption">Where are my configs?</div>
        <div v-if="pathHint.note" class="text-caption text-medium-emphasis">{{ pathHint.note }}</div>
        <div class="path-row">
          <code class="copy-path" data-testid="config-path">{{ pathHint.path }}</code>
          <v-btn
            icon="mdi-content-copy"
            size="x-small"
            variant="text"
            title="Copy"
            data-testid="config-path-copy"
            @click="copyPath(pathHint.path)"
          />
          <span v-if="copiedPath === pathHint.path" class="text-success text-caption">copied</span>
        </div>
      </div>

      <v-text-field
        v-if="isOrca"
        :model-value="presets.installPath ?? ''"
        label="OrcaSlicer install folder (optional, enables full base-preset paths)"
        density="comfortable"
        class="mt-3 install-path-field"
        data-testid="install-path-input"
        @update:model-value="onInstallPath"
      />

      <input
        ref="fileInput"
        type="file"
        accept=".ini,.json,.cfg,.txt"
        multiple
        class="d-none"
        data-testid="import-file-input"
        @change="onFiles"
      />
      <v-btn
        variant="tonal"
        color="primary"
        prepend-icon="mdi-import"
        class="mt-4"
        data-testid="import-pick-files"
        @click="fileInput?.click()"
      >
        Choose preset file
      </v-btn>

      <ImportSummaryPanel
        v-if="summary"
        :summary="summary"
        class="mt-4"
        @upload-parent="onUploadParent"
      />
    </div>
  </div>
</template>

<style scoped>
.import-header {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 4px 0 12px;
  border-bottom: 1px solid rgba(var(--v-theme-on-surface), 0.08);
}
.header-text {
  min-width: 0;
}
.header-title {
  font-weight: 600;
  font-size: 16px;
}
.header-subtitle {
  font-size: 12px;
  color: rgba(var(--v-theme-on-surface), 0.6);
}
.import-body {
  padding-top: 16px;
}
.row {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
}
.row > * {
  flex: 1 1 200px;
  max-width: 320px;
}
.group-caption {
  font-size: 12px;
  color: rgba(var(--v-theme-on-surface), 0.6);
  margin: 0 0 4px;
}
.path-row {
  display: flex;
  align-items: center;
  gap: 4px;
  margin-top: 2px;
}
.copy-path {
  font-family: 'Roboto Mono', ui-monospace, monospace;
  font-size: 11.5px;
  user-select: all;
  background: rgba(128, 128, 128, 0.15);
  border-radius: 4px;
  padding: 1px 5px;
  word-break: break-all;
}
.install-path-field {
  max-width: 480px;
}
.install-path-field :deep(input) {
  font-family: 'Roboto Mono', ui-monospace, monospace;
  font-size: 12px;
}
</style>
