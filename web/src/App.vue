<script setup lang="ts">
import { useApp } from './stores/useApp'
import ScanPage from './components/ScanPage.vue'
import CalibrationPage from './components/CalibrationPage.vue'
import ResultsPage from './components/ResultsPage.vue'

const app = useApp()
</script>

<template>
  <v-app>
    <v-main>
      <ScanPage v-if="app.screen === 'scan'" />
      <CalibrationPage v-else-if="app.screen === 'calibration'" />
      <ResultsPage v-else />
    </v-main>
  </v-app>
</template>
