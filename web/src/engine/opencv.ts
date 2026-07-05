import type { CV, Mat } from '@techstark/opencv-js'
// @techstark/opencv-js sets `module.exports` to a Promise that resolves to the initialized cv module.
// A bundler's default import of a CJS module returns module.exports directly (the real Promise), which
// avoids the broken thenable module-namespace a `* as` / dynamic import produces for a Promise export.
import cvReady from '@techstark/opencv-js'

// The OpenCV.js module type (cv.Mat, cv.cvtColor, ...). Engine functions take this as a parameter so
// the wasm import stays centralised here (and out of the main bundle) and tests can inject it.
export type OpenCv = CV
export type { Mat }

let cached: Promise<OpenCv> | null = null

// Load OpenCV.js once and cache the ready instance.
export function loadOpenCv(): Promise<OpenCv> {
  cached ??= Promise.resolve(cvReady as unknown as PromiseLike<OpenCv>)
  return cached
}
