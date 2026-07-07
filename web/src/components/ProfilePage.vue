<script setup lang="ts">
import { computed, ref } from 'vue'
import { useApp } from '../stores/useApp'
import { usePrinterProfiles } from '../stores/usePrinterProfiles'
import { useProfileForm } from '../composables/useProfileForm'
import type { ImportKind } from '../composables/useProfileForm'
import type { Firmware } from '../engine/pa/types'
import NumericField from './NumericField.vue'
import ConfigPathsMenu from './ConfigPathsMenu.vue'
import ImportSummaryPanel from './ImportSummaryPanel.vue'

const app = useApp()
const store = usePrinterProfiles()
const form = useProfileForm()

const firmwares: Firmware[] = ['Klipper', 'Marlin', 'RepRapFirmware']

const editedId = app.profilePayload?.profileId ?? null
const existing = editedId === null ? null : store.profiles.find((p) => p.id === editedId) ?? null
if (existing) {
  form.load(existing)
} else {
  form.loadNew()
}

const title = computed(() =>
  existing ? form.name.value.trim() || existing.name : 'New printer profile',
)

const tab = ref<ImportKind>('printer')

const printerFileInput = ref<HTMLInputElement | null>(null)
const filamentFileInput = ref<HTMLInputElement | null>(null)

function onImportFiles(event: Event, kind: ImportKind): void {
  const input = event.target as HTMLInputElement
  const files = Array.from(input.files ?? [])
  // Clear the input so picking the same file again still fires change.
  input.value = ''
  void form.importFiles(files, kind)
}

function back(): void {
  if (form.isDirty.value && !window.confirm('Discard the unsaved profile changes?')) return
  app.goPa()
}

function save(): void {
  if (!form.canSave.value) return
  const id = store.upsert(form.toProfile())
  store.select(id)
  app.goPa()
}
</script>

<template>
  <div class="profile-header" data-testid="profile-page">
    <div class="header-inner">
      <v-btn
        icon="mdi-arrow-left"
        variant="text"
        size="small"
        title="Back"
        data-testid="profile-back"
        @click="back"
      />
      <span class="header-title">{{ title }}</span>
      <v-spacer />
      <v-btn variant="text" size="small" data-testid="profile-cancel" @click="back">Cancel</v-btn>
      <v-btn
        color="primary"
        variant="flat"
        size="small"
        :disabled="!form.canSave.value"
        data-testid="profile-save"
        @click="save"
      >
        Save
      </v-btn>
    </div>
    <v-tabs v-model="tab" density="compact" color="primary" class="header-tabs">
      <v-tab value="printer" data-testid="profile-tab-printer">Printer</v-tab>
      <v-tab value="filament" data-testid="profile-tab-filament">Filament</v-tab>
    </v-tabs>
  </div>

  <v-container class="page">
    <v-tabs-window v-model="tab">
      <!-- Printer tab -->
      <v-tabs-window-item value="printer">
        <div class="toolbar">
          <input
            ref="printerFileInput"
            type="file"
            accept=".ini,.json,.cfg,.txt"
            multiple
            class="d-none"
            data-testid="import-printer-input"
            @change="onImportFiles($event, 'printer')"
          />
          <v-btn
            variant="tonal"
            size="small"
            prepend-icon="mdi-import"
            data-testid="import-printer"
            @click="printerFileInput?.click()"
          >
            Import printer settings
          </v-btn>
        </div>
        <ConfigPathsMenu kind="printer" />
        <ImportSummaryPanel
          v-if="form.importSummary.value?.kind === 'printer'"
          :summary="form.importSummary.value"
          class="mt-2"
        />

        <div class="column mt-4">
          <div class="group-caption">Printer</div>
          <v-text-field
            v-model="form.name.value"
            label="Profile name"
            density="comfortable"
            data-testid="profile-name"
          />
          <v-select
            v-model="form.firmware.value"
            :items="firmwares"
            label="Firmware"
            density="comfortable"
            data-testid="profile-firmware"
          />

          <div class="group-caption">Bed</div>
          <div class="row">
            <NumericField v-model="form.bedWidthMm.value" label="Bed width (mm)" :step="10" :min="10" />
            <NumericField v-model="form.bedDepthMm.value" label="Bed depth (mm)" :step="10" :min="10" />
          </div>

          <div class="group-caption">Extrusion</div>
          <div class="row">
            <NumericField
              v-model="form.nozzleDiameterMm.value"
              label="Nozzle diameter (mm)"
              :step="0.1"
              :min="0.1"
              :precision="2"
            />
            <NumericField
              v-model="form.layerHeightMm.value"
              label="Layer height (mm)"
              :step="0.05"
              :min="0.05"
              :precision="2"
            />
          </div>

          <div class="group-caption">Retraction</div>
          <div class="row">
            <NumericField
              v-model="form.retractMm.value"
              label="Retraction (mm)"
              :step="0.1"
              :min="0"
              :precision="2"
            />
            <NumericField
              v-model="form.retractSpeedMmS.value"
              label="Retract speed (mm/s)"
              :step="5"
              :min="1"
            />
          </div>

          <div class="group-caption">Motion</div>
          <div class="row">
            <NumericField
              v-model="form.travelSpeedMmS.value"
              label="Travel speed (mm/s)"
              :step="10"
              :min="10"
            />
            <NumericField
              v-model="form.printAccelMmS2.value"
              label="Acceleration (mm/s2)"
              :step="500"
              :min="100"
            />
            <NumericField
              v-model="form.squareCornerVelocityMmS.value"
              label="Square corner velocity (mm/s)"
              :step="1"
              :min="1"
            />
          </div>
        </div>

        <div class="gcode mt-2">
          <div class="group-caption">G-code</div>
          <v-textarea
            v-model="form.startGcode.value"
            label="Start G-code"
            rows="3"
            density="comfortable"
            class="mono mb-2"
          />
          <v-textarea
            v-model="form.pauseGcode.value"
            label="Pause G-code (filament change)"
            rows="2"
            density="comfortable"
            class="mono mb-2"
          />
          <v-textarea
            v-model="form.endGcode.value"
            label="End G-code"
            rows="3"
            density="comfortable"
            class="mono"
          />
        </div>
      </v-tabs-window-item>

      <!-- Filament tab -->
      <v-tabs-window-item value="filament">
        <div class="toolbar">
          <v-select
            v-model="form.filamentIndex.value"
            :items="form.filamentItems.value"
            label="Filament"
            density="comfortable"
            hide-details
            class="filament-select"
            data-testid="filament-select"
          />
          <v-btn
            variant="tonal"
            size="small"
            prepend-icon="mdi-plus"
            data-testid="filament-add"
            @click="form.addFilament"
          >
            Add
          </v-btn>
          <v-btn
            variant="text"
            size="small"
            icon="mdi-delete-outline"
            :disabled="form.filaments.value.length <= 1"
            data-testid="filament-delete"
            @click="form.removeFilament"
          />
          <v-spacer />
          <input
            ref="filamentFileInput"
            type="file"
            accept=".ini,.json,.cfg,.txt"
            multiple
            class="d-none"
            data-testid="import-filament-input"
            @change="onImportFiles($event, 'filament')"
          />
          <v-btn
            variant="tonal"
            size="small"
            prepend-icon="mdi-import"
            data-testid="import-filament"
            @click="filamentFileInput?.click()"
          >
            Import filament
          </v-btn>
        </div>
        <ConfigPathsMenu kind="filament" />
        <ImportSummaryPanel
          v-if="form.importSummary.value?.kind === 'filament'"
          :summary="form.importSummary.value"
          class="mt-2"
        />

        <div v-if="form.currentFilament.value" class="column mt-4">
          <div class="group-caption">Filament</div>
          <v-text-field
            v-model="form.currentFilament.value.name"
            label="Filament name"
            density="comfortable"
            data-testid="filament-name"
          />
          <div class="row">
            <v-text-field
              v-model="form.currentFilament.value.filamentType"
              label="Filament type"
              density="comfortable"
              data-testid="profile-filament-type"
            />
            <NumericField
              v-model="form.currentFilament.value.filamentDiameterMm"
              label="Filament diameter (mm)"
              :step="0.05"
              :min="0.5"
              :precision="2"
            />
          </div>
          <div class="group-caption">Temperatures</div>
          <div class="row">
            <NumericField
              v-model="form.currentFilament.value.nozzleTempC"
              label="Nozzle temp (°C)"
              :step="5"
              :min="0"
            />
            <NumericField
              v-model="form.currentFilament.value.bedTempC"
              label="Bed temp (°C)"
              :step="5"
              :min="0"
            />
            <NumericField
              v-model="form.currentFilament.value.chamberTempC"
              label="Chamber temp (°C)"
              :step="5"
              :min="0"
            />
          </div>
        </div>
      </v-tabs-window-item>
    </v-tabs-window>
  </v-container>
</template>

<style scoped>
.profile-header {
  position: sticky;
  top: 48px;
  z-index: 5;
  background: rgb(var(--v-theme-surface));
  border-bottom: 1px solid rgba(var(--v-theme-on-surface), 0.08);
}
.header-inner {
  display: flex;
  align-items: center;
  gap: 8px;
  max-width: 760px;
  margin: 0 auto;
  padding: 8px 16px 0;
}
.header-title {
  font-weight: 600;
  font-size: 16px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.header-tabs {
  max-width: 760px;
  margin: 0 auto;
  padding: 0 16px;
}
.page {
  max-width: 760px;
}
.toolbar {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}
.filament-select {
  flex: 1 1 200px;
  max-width: 280px;
}
.column {
  max-width: 480px;
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.row {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
}
.row > * {
  flex: 1 1 140px;
}
.group-caption {
  font-size: 12px;
  color: rgba(var(--v-theme-on-surface), 0.6);
  margin: 6px 0 4px;
}
.mono :deep(textarea) {
  font-family: 'Roboto Mono', ui-monospace, monospace;
  font-size: 0.85rem;
}
</style>
