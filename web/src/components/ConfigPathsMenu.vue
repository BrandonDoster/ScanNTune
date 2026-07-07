<script setup lang="ts">
import { computed, ref } from 'vue'
import { useCopyPath } from '../composables/useCopyPath'
import { useSlicerPresets } from '../stores/useSlicerPresets'

const props = defineProps<{
  /** Which preset folders to show: printer/machine presets or filament presets. */
  kind: 'printer' | 'filament'
}>()

type Os = 'Windows' | 'macOS' | 'Linux'
const OS_CYCLE: Os[] = ['Windows', 'macOS', 'Linux']

function detectOs(): Os {
  const ua = `${navigator.platform ?? ''} ${navigator.userAgent ?? ''}`.toLowerCase()
  if (ua.includes('mac')) return 'macOS'
  if (ua.includes('linux') && !ua.includes('android')) return 'Linux'
  return 'Windows'
}

const os = ref<Os>(detectOs())
const open = ref(false)
const { copiedPath, copyPath } = useCopyPath()

function cycleOs(): void {
  os.value = OS_CYCLE[(OS_CYCLE.indexOf(os.value) + 1) % OS_CYCLE.length]
}

const ORCA_PATHS: Record<'printer' | 'filament', Record<Os, string>> = {
  printer: {
    Windows: '%APPDATA%\\OrcaSlicer\\user\\default\\machine\\',
    macOS: '~/Library/Application Support/OrcaSlicer/user/default/machine/',
    Linux: '~/.config/OrcaSlicer/user/default/machine/',
  },
  filament: {
    Windows: '%APPDATA%\\OrcaSlicer\\user\\default\\filament\\',
    macOS: '~/Library/Application Support/OrcaSlicer/user/default/filament/',
    Linux: '~/.config/OrcaSlicer/user/default/filament/',
  },
}
const PRUSA_PATHS: Record<'printer' | 'filament', Record<Os, string>> = {
  printer: {
    Windows: '%APPDATA%\\PrusaSlicer\\printer\\',
    macOS: '~/Library/Application Support/PrusaSlicer/printer/',
    Linux: '~/.config/PrusaSlicer/printer/',
  },
  filament: {
    Windows: '%APPDATA%\\PrusaSlicer\\filament\\',
    macOS: '~/Library/Application Support/PrusaSlicer/filament/',
    Linux: '~/.config/PrusaSlicer/filament/',
  },
}

const orcaPath = computed(() => ORCA_PATHS[props.kind][os.value])
const prusaPath = computed(() => PRUSA_PATHS[props.kind][os.value])

const presetStore = useSlicerPresets()

function onInstallPathInput(value: string): void {
  presetStore.setInstallPath(value)
}
</script>

<template>
  <div class="d-flex justify-end">
    <v-menu v-model="open" :close-on-content-click="false" location="bottom end">
      <template #activator="{ props: menuProps }">
        <a
          href="#"
          class="configs-link"
          v-bind="menuProps"
          :data-testid="`config-paths-${kind}`"
          @click.prevent
        >
          Where are my configs?
        </a>
      </template>
      <v-card class="paths-card" max-width="440">
        <div class="text-caption text-medium-emphasis mb-2">
          Showing paths for {{ os }}.
          <a href="#" class="configs-link" @click.prevent="cycleOs">change</a>
        </div>
        <div class="slicer-name">OrcaSlicer</div>
        <div class="path-row">
          <code class="copy-path">{{ orcaPath }}</code>
          <v-btn
            icon="mdi-content-copy"
            size="x-small"
            variant="text"
            title="Copy"
            @click="copyPath(orcaPath)"
          />
          <span v-if="copiedPath === orcaPath" class="text-success text-caption">copied</span>
        </div>
        <div class="slicer-name mt-3">PrusaSlicer</div>
        <div class="text-caption text-medium-emphasis">File, Export, Export Config, or:</div>
        <div class="path-row">
          <code class="copy-path">{{ prusaPath }}</code>
          <v-btn
            icon="mdi-content-copy"
            size="x-small"
            variant="text"
            title="Copy"
            @click="copyPath(prusaPath)"
          />
          <span v-if="copiedPath === prusaPath" class="text-success text-caption">copied</span>
        </div>
        <div class="slicer-name mt-3">OrcaSlicer install folder (optional)</div>
        <div class="text-caption text-medium-emphasis">
          Used to show full paths to base presets a preset builds on.
        </div>
        <v-text-field
          :model-value="presetStore.installPath ?? ''"
          density="compact"
          hide-details
          placeholder="C:\Program Files\OrcaSlicer"
          class="mt-1 install-path-field"
          data-testid="install-path-input"
          @update:model-value="onInstallPathInput"
        />
      </v-card>
    </v-menu>
  </div>
</template>

<style scoped>
.configs-link {
  font-size: 12px;
  color: rgb(var(--v-theme-primary));
  text-decoration: none;
}
.configs-link:hover {
  text-decoration: underline;
}
.paths-card {
  padding: 12px 14px;
}
.slicer-name {
  font-size: 12.5px;
  font-weight: 600;
}
.path-row {
  display: flex;
  align-items: center;
  gap: 4px;
  margin-top: 2px;
}
.install-path-field :deep(input) {
  font-family: 'Roboto Mono', ui-monospace, monospace;
  font-size: 11.5px;
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
</style>
