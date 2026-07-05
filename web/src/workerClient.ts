import * as Comlink from 'comlink'
import type { AnalysisApi, MultiScanResponse } from './worker/analysis.worker'
import type { AnalysisOptions, ScaleReferenceResult } from './engine/types'

// Lazily create the analysis worker (which pulls in OpenCV.js) only when the user first analyzes, so
// the wasm is not loaded on the initial page paint.
let api: Comlink.Remote<AnalysisApi> | null = null

function getApi(): Comlink.Remote<AnalysisApi> {
  if (!api) {
    const worker = new Worker(new URL('./worker/analysis.worker.ts', import.meta.url), {
      type: 'module',
    })
    api = Comlink.wrap<AnalysisApi>(worker)
  }
  return api
}

export async function analyzeScans(
  scans: Uint8Array[],
  options: AnalysisOptions,
): Promise<MultiScanResponse> {
  const buffers = scans.map((s) => s.slice().buffer)
  return getApi().analyzeScans(Comlink.transfer(buffers, buffers), options)
}

export async function measureCardScan(
  bytes: Uint8Array,
  knownLongSideMm: number,
  nominalDpi: number,
): Promise<ScaleReferenceResult> {
  const b = bytes.slice().buffer
  return getApi().measureCardScan(Comlink.transfer(b, [b]), knownLongSideMm, nominalDpi)
}

export type { MultiScanResponse }
