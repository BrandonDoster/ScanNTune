import type { CV, Mat } from '@techstark/opencv-js'

// The OpenCV.js module type (cv.Mat, cv.cvtColor, ...). Engine functions take this as a parameter
// so the wasm import stays centralised here (and out of the main bundle) and tests can inject it.
export type OpenCv = CV
export type { Mat }

let cached: Promise<OpenCv> | null = null

// @techstark/opencv-js (Emscripten MODULARIZE) exports a Promise that resolves to the initialized
// module. Load it once and cache the ready instance.
export function loadOpenCv(): Promise<OpenCv> {
  cached ??= import('@techstark/opencv-js').then((mod) => {
    const value = (mod as unknown as { default?: unknown }).default ?? mod
    return value as unknown as PromiseLike<OpenCv>
  })
  return cached
}
