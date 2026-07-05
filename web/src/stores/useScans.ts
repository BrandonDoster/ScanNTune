import { defineStore } from 'pinia'
import { ref } from 'vue'
import { SkewCouponScan } from '../model/skewCouponScan'
import type { ScanProcessing } from '../workerClient'

// Owns the uploaded scans for the session. The list lives here (not in ScanPage) so it survives
// navigation to the Results page, which reuses each scan's rendered overlay, and so disposal of the
// bitmaps has a single home. All mutations go through the store so they happen on the reactive
// instances, never on a detached copy.
export const useScans = defineStore('scans', () => {
  const scans = ref<SkewCouponScan[]>([])
  let nextId = 0

  function add(fileName: string, bytes: Uint8Array): number {
    const id = nextId++
    scans.value = [...scans.value, new SkewCouponScan(id, fileName, bytes)]
    return id
  }

  function get(id: number): SkewCouponScan | undefined {
    return scans.value.find((s) => s.id === id)
  }

  function applyProcessing(id: number, processing: ScanProcessing): void {
    const scan = get(id)
    if (scan) {
      scan.applyProcessing(processing)
    } else {
      // The scan was removed while its analysis was still running: close the now-orphaned bitmaps.
      processing.overlay.close()
      processing.mask?.close()
    }
  }

  function fail(id: number, message: string): void {
    get(id)?.fail(message)
  }

  function remove(id: number): void {
    get(id)?.dispose()
    scans.value = scans.value.filter((s) => s.id !== id)
  }

  function clear(): void {
    for (const s of scans.value) s.dispose()
    scans.value = []
  }

  return { scans, add, get, applyProcessing, fail, remove, clear }
})
