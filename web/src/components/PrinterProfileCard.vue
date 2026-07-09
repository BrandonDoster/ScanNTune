<script setup lang="ts">
import { computed, ref } from 'vue'
import { useApp } from '../stores/useApp'
import { usePrinterProfiles } from '../stores/usePrinterProfiles'
import { defaultPrinterProfile } from '../engine/pa/types'

const app = useApp()
const store = usePrinterProfiles()

const props = withDefaults(defineProps<{ disabled?: boolean; step?: number }>(), {
  disabled: false,
  step: 1,
})

// Profile card state.
const deleteOpen = ref(false)

const NEW_ID = '__new__'
const selectItems = computed(() => [
  ...store.profiles.map((p) => ({ title: p.name, value: p.id })),
  { title: 'New printer...', value: NEW_ID },
])
function onSelect(id: string | null): void {
  if (id === NEW_ID) {
    openNew()
    return
  }
  if (id) store.select(id)
}
function openNew(): void {
  app.goProfile({ profileId: null })
}
function openEdit(): void {
  if (store.selected) app.goProfile({ profileId: store.selected.id })
}
function confirmDelete(): void {
  if (store.selected) store.remove(store.selected.id)
  deleteOpen.value = false
}

const filamentItems = computed(() =>
  (store.selected?.filaments ?? []).map((f) => ({ title: f.name, value: f.id })),
)
function onSelectFilament(filamentId: string | null): void {
  if (store.selected && filamentId) store.selectFilament(store.selected.id, filamentId)
}

const summaryChips = computed(() => {
  const p = store.selected
  const f = store.selectedFilament
  if (!p || !f) return []
  const chips = [
    `${p.firmware} · ${p.nozzleDiameterMm} mm nozzle`,
    `${p.bedWidthMm} × ${p.bedDepthMm} mm bed`,
    `${f.filamentType} · ${f.nozzleTempC} °C / ${f.bedTempC} °C`,
  ]
  const d = defaultPrinterProfile()
  if (p.startGcode !== d.startGcode || p.pauseGcode !== d.pauseGcode || p.endGcode !== d.endGcode) {
    chips.push('custom start/pause/end G-code')
  }
  return chips
})
</script>

<template>
  <section class="step mb-3">
    <div class="step-head mb-2">
      <span class="num">{{ props.step }}</span><span class="step-title">Printer profile</span>
    </div>
    <div class="profile-row">
      <v-select
        :model-value="store.selectedId"
        :items="selectItems"
        label="Printer"
        density="comfortable"
        hide-details
        placeholder="Choose or create a printer"
        class="profile-select"
        :disabled="props.disabled"
        data-testid="profile-select"
        @update:model-value="onSelect"
      />
      <v-select
        v-if="store.selected"
        :model-value="store.selectedFilament?.id ?? null"
        :items="filamentItems"
        label="Filament"
        density="comfortable"
        hide-details
        class="filament-select"
        :disabled="props.disabled"
        data-testid="pa-filament-select"
        @update:model-value="onSelectFilament"
      />
      <v-btn
        variant="tonal"
        size="small"
        :disabled="!store.selected || props.disabled"
        data-testid="profile-edit"
        @click="openEdit"
      >
        Edit
      </v-btn>
      <v-btn
        variant="text"
        size="small"
        :disabled="!store.selected || props.disabled"
        data-testid="profile-delete"
        @click="deleteOpen = true"
      >
        Delete
      </v-btn>
    </div>
    <div v-if="!store.profiles.length" class="mt-3">
      <v-btn color="primary" size="small" prepend-icon="mdi-plus" :disabled="props.disabled" data-testid="profile-new" @click="openNew">
        New printer profile
      </v-btn>
    </div>
    <div v-if="summaryChips.length" class="chips mt-3">
      <v-chip v-for="c in summaryChips" :key="c" size="small" variant="tonal">{{ c }}</v-chip>
    </div>
  </section>

  <v-dialog v-model="deleteOpen" max-width="380">
    <v-card title="Delete printer profile?">
      <v-card-text>
        "{{ store.selected?.name }}" will be removed. This cannot be undone.
      </v-card-text>
      <v-card-actions>
        <v-spacer />
        <v-btn variant="text" @click="deleteOpen = false">Cancel</v-btn>
        <v-btn color="error" variant="flat" :disabled="props.disabled" data-testid="profile-delete-confirm" @click="confirmDelete">
          Delete
        </v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>

<style scoped>
.step {
  background: rgb(var(--v-theme-surface-light));
  border-radius: 12px;
  padding: 16px;
}
.step-head {
  display: flex;
  align-items: center;
  gap: 8px;
}
.num {
  color: rgb(var(--v-theme-primary));
  font-weight: 600;
  font-size: 14px;
}
.step-title {
  font-weight: 500;
  font-size: 14px;
}
.profile-row {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}
.profile-select {
  flex: 1 1 220px;
}
.filament-select {
  flex: 1 1 160px;
}
.chips {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}
</style>
