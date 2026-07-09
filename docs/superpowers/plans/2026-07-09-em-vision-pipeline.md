# EM Vision Pipeline (Stage 2) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Measure the deposited line width from a flatbed scan of the EM coupon and emit the flow correction, validated by a synthetic ground-truth renderer (rule 1) and a real end-to-end browser test over the owner's actual scan.

**Architecture:** Mirror the PA vision pipeline: a synthetic renderer in tests/helpers gates the math; engine modules under `web/src/engine/em/` (aligner, gap measurer, analyzer, correction formatter, overlay); a new `analyzeEmScan` in the existing Comlink worker; scan-upload + results UI on the Flow page. All engine functions take `cv` as a parameter.

**Tech Stack:** TypeScript, OpenCV.js (via existing loader), Comlink worker, Vue 3 + Vuetify, Vitest + pngjs fixtures, Playwright.

## Global Constraints

- Branch `feature/extrusion-multiplier`, standing commit grant, NO push.
- Commit messages: single short sentence; optional `Co-Authored-By: Claude <noreply@anthropic.com>` trailer; no other AI attribution. Never use the em-dash character anywhere. No rule-number citations in shipped source/UI.
- Rule 1 (measurement integrity): every estimator must be a named standard method (mean, median, MAD outlier rejection, parabolic sub-pixel interpolation, reference-artifact bias correction). NO tuned fudge constants in the math path. The synthetic render-recovery tests are the gate: do not trust any pipeline change that regresses them.
- Rule 2: a scan that cannot be analyzed returns `{ success: false, failureReason }` (user-worded); only an unreadable image throws.
- Rule 3: engine modules framework-agnostic, `cv` injected.
- Measurement principle (from docs/superpowers/specs/2026-07-08-em-calibration-design.md):
  - Coupon: 13 blocks x 7 lines x 2 mirrored rows, pitches 0.70-1.10 mm (`pitchForBlock`), 2 mm separators, frame band 12 mm, rail 4 mm, rows 25 mm tall, `ANCHOR_OVERLAP_MM = 1`, geometry from `emCouponGeometry(spec)`.
  - Per gap: `w = pitchLocal_measured - (gap_measured - b)` where `b = separator_measured - BLOCK_GAP_MM` (median over all separators). All distances in TRUE mm via the scanner card calibration px/mm (HARD requirement), never via the affine scale.
  - The affine scale (from fiducials, commanded geometry) divided by card px/mm = printer X-scale diagnostic `pitchScale`.
  - Final `wMm` = median over per-gap estimates from BOTH rows after MAD outlier rejection (3.5 sigma-equivalent, standard). `newFlow% = currentFlow% * nominal / wMm`.
- Test tolerances (rule-1 gate): synthetic recovery of `trueWidthMm` within 0.005 mm on clean renders and 0.008 mm with noise + rotation + flip + inverted polarity, across trueWidth 0.36-0.50 mm.
- Definition of done: `npm run build`, `npm test`, `npm run e2e` all green, INCLUDING a Playwright test that uploads the owner's real scan (`em_real_scan.png`) through the browser and receives a successful flow result.
- Real scan source file: `C:\Users\jakob\Documents\IMG_20260709_0002.png` (600 dpi, 4960x7015). Copy into `web/e2e/fixtures/em_real_scan.png` (binary copy, no re-encode).
- Reference dry-run numbers for the real scan (crude thresholding, expect the pipeline to be consistent, not identical): separators measure ~1.99 mm (b ~ -0.01), fine gaps 0.17-0.64 mm, plausible w 0.40-0.45, flow correction ~0.95-1.05.
- The printed coupon used defaults: pitch 0.70-1.10, 13 blocks, 7 lines/block, lineLength 25, nominal 0.42, printed at 75 mm/s.

---

### Task 1: Synthetic EM coupon renderer (rule-1 ground truth)

**Files:**
- Create: `web/tests/helpers/emRender.ts`
- Test: `web/tests/engine/em/emRender.spec.ts`

**Interfaces:**
- Consumes: `EmTestSpec`, `emCouponGeometry`, `pitchForBlock` from `src/engine/em/types`; RgbaImage shape from `paRender.ts` (`{ data: Uint8ClampedArray, width, height }`).
- Produces:
```ts
export interface EmRenderOptions {
  spec: EmTestSpec
  /** Ground-truth deposited bead width in mm (the value the pipeline must recover). */
  trueWidthMm: number
  pxPerMm?: number            // default 12
  rotationDegrees?: number    // default 0, small rotations (not quarter turns)
  quarterTurns?: 0 | 1 | 2 | 3 // default 0
  flipped?: boolean           // default false
  noiseSigma?: number         // default 0
  blurSigmaMm?: number        // default 0.04 (edge softness)
  plasticGray?: number        // default 40
  backgroundGray?: number     // default 245 (set below plasticGray to invert polarity)
  /** Uniform pitch scale simulating printer axis stretch (default 1). */
  pitchScale?: number
  marginMm?: number           // background border around the coupon, default 8
}
export function renderEmScan(options: EmRenderOptions): RgbaImage
```
- Rendering model (pure pixel buffer, supersample 3x3 like `paRender.ts`, deterministic seeded noise):
  - Background = backgroundGray. Coupon rectangle = plasticGray EXCEPT: the window interior between band/rail/rows margins = backgroundGray; fiducial holes = backgroundGray squares; and within each comb row, vertical stripes: for each block b and line j at x-center `c = (x0 + first + j*pitch) * pitchScale` (all coupon-frame mm mapped through rotation/flip/px scale), plastic where `|x - c| <= trueWidthMm/2`, background elsewhere inside the row's y-range. Between blocks: separators read as background (width = BLOCK_GAP_MM * pitchScale between scaled block edges).
  - IMPORTANT: build a coupon-frame signed-distance/coverage function and evaluate per supersample: for a pixel's coupon-frame (xMm, yMm): plastic if inside band ring, rail, or within trueWidthMm/2 of a line center while inside its row's y-range (rows include ANCHOR_OVERLAP_MM overrun), else background if inside window, plastic if inside band. Blur: treat coverage transition linearly over blurSigmaMm (box-filter approximation is fine and deterministic).
  - `pitchScale` scales the x-position of line centers AND block layout (simulates a stretched X axis: the whole comb pattern stretches; band/window/fiducials scale too: apply pitchScale to all coupon xMm coordinates).

- [ ] **Step 1: Write failing smoke tests** (`emRender.spec.ts`): render default spec at trueWidth 0.42, assert dimensions match coupon+margins at pxPerMm, assert 3 background-colored fiducial squares at expected px positions, assert a horizontal scanline through the top row's middle has >= 13 blocks' worth of alternating plastic/background transitions, assert an inverted-polarity render swaps histogram dominance.
- [ ] **Step 2: Run to verify failure** (`npx vitest run tests/engine/em/emRender.spec.ts` fails: module missing).
- [ ] **Step 3: Implement `emRender.ts`** per the model above. Read `web/tests/helpers/paRender.ts` FIRST and copy its supersampling, rotation mapping, seeded-noise, and RgbaImage plumbing; replace the coupon coverage function.
- [ ] **Step 4: Tests pass.**
- [ ] **Step 5: Commit** (`Add the synthetic EM coupon renderer`).

---

### Task 2: EM fiducial aligner

**Files:**
- Create: `web/src/engine/em/fiducialAligner.ts`
- Test: `web/tests/engine/em/fiducialAligner.spec.ts`

**Interfaces:**
- Consumes: `cv` (injected), `EmTestSpec`, `emCouponGeometry`. Read `web/src/engine/pa/fiducialAligner.ts` FIRST and mirror its approach and its `PaAlignment` contract shape.
- Produces:
```ts
export interface EmAlignment {
  success: boolean
  failureReason: string | null
  affine: { a: number; b: number; c: number; d: number; tx: number; ty: number } | null
  flipped: boolean
  rotationQuarterTurns: number
}
export function alignEmCoupon(cv: OpenCv, imageBgr: Mat, spec: EmTestSpec): EmAlignment
export function mmToPx(alignment: EmAlignment, xMm: number, yMm: number): { x: number; y: number }
```
- Approach (adapt PA's): dual-polarity Otsu threshold candidates validated against the known coupon size/aspect; morphological close with a kernel derived from the spec's max gap (`pitchForBlock(spec, blockCount-1) - 0.5*nominal`, ~1 mm at defaults, in px via the detected scale) so the comb slots and 2 mm separators close while the 5 mm fiducial holes survive; hole contours filtered by area within [0.4, 2.5]x the expected fiducial area; the three hole centroids + the empty corner resolve rotation and mirror exactly as PA does. Affine solved from the three centroids (Cramer). The EM coupon's interior window is NOT a problem after closing (rows/rail/band merge into a solid block); if the window still fragments the base contour, close again with a larger kernel bounded by half the inner margin.
- Failure contract: no coupon-sized contour, ambiguous fiducials, or missing marker => `{ success: false, failureReason: <user-worded> }`.

- [ ] **Step 1: Failing tests** using `renderEmScan` + `getCv()` from `tests/helpers/cv.ts`: alignment succeeds on default render; recovered affine maps the 3 fiducial mm-centers to within 1.5 px of their rendered positions; succeeds and stays consistent for quarterTurns 0..3, flipped true/false, rotationDegrees 2, inverted polarity; fails cleanly (success=false + failureReason) on a blank image.
- [ ] **Step 2: Verify failure.**
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Tests pass** (run the whole em suite).
- [ ] **Step 5: Commit** (`Add the EM coupon fiducial aligner`).

---

### Task 3: Gap measurer

**Files:**
- Create: `web/src/engine/em/gapMeasurer.ts`
- Test: `web/tests/engine/em/gapMeasurer.spec.ts`

**Interfaces:**
- Consumes: `cv`, gray Mat (use the same value-channel extraction as `lineMeasurer.ts`; read it FIRST and reuse its bilinear sampling + parabolic gradient-peak edge refinement approach), `EmAlignment`, `EmTestSpec`, and `scanPxPerMm` (the CARD calibration value).
- Produces:
```ts
export interface BlockMeasurement {
  row: 0 | 1
  blockIndex: number            // geometry index (pitch order), not visual order
  pitchCommandedMm: number
  /** Sub-pixel line-centre x positions in TRUE mm (scan px / scanPxPerMm), coupon-frame ordered. */
  lineCentersMm: number[]
  /** Gaps between adjacent line inner edges in TRUE mm. */
  gapsMm: number[]
}
export interface SeparatorMeasurement { row: 0 | 1; index: number; widthMm: number }
export interface EmMeasurement {
  blocks: BlockMeasurement[]
  separators: SeparatorMeasurement[]
  /** Affine-implied px/mm divided by scanPxPerMm: the printer X-scale diagnostic. */
  pitchScale: number
}
export function measureEmCoupon(
  cv: OpenCv, gray: Mat, alignment: EmAlignment, spec: EmTestSpec, scanPxPerMm: number,
): EmMeasurement
```
- Method (all named standard techniques):
  - For each row and block, sample N_PROFILES = 9 horizontal intensity profiles across the block's x-span (plus half a separator each side), at y positions spread over the middle 60% of the row (avoids anchor-overlap ends), each profile bilinear-sampled at 0.25 px steps along the TRUE pixel direction of the coupon x-axis (walk in mm through the affine).
  - Median-combine the 9 profiles into one robust profile (rejects the stretched-strand class of defect).
  - Polarity: compare plastic median vs gap median like `lineMeasurer` (median-relative, no fixed threshold).
  - Edges: mid-level crossings (50% between plastic and background plateau levels, computed per profile from percentiles) refined by parabolic interpolation of the gradient peak: same primitive as lineMeasurer.
  - Convert edge px distances to TRUE mm with `scanPxPerMm` (NOT the affine scale).
  - Expected line count per block = spec.linesPerBlock; if a block yields a different count, drop the block (it will be an outlier anyway) but record nothing rather than garbage.
  - Separators: measured from the same profiles between adjacent blocks' outermost line edges minus... measure directly as the background run between block b's last line right edge and block b+1's first line left edge.
  - `pitchScale` = mean over blocks of (measured block pitch span / commanded span), where measured span uses lineCentersMm and commanded uses `pitchForBlock` spacing; equivalently affine-scale/scanPxPerMm: use the line-centers version (more direct).

- [ ] **Step 1: Failing tests**: on a clean render (pxPerMm 12, trueWidth 0.42) all 26 blocks measured with 7 centers and 6 gaps each; per-block center spacing within 0.01 mm of commanded pitch; gaps within 0.015 mm of (pitch - 0.42); separators within 0.02 mm of 2.0; with `pitchScale: 1.01` in the render, measured `pitchScale` in [1.007, 1.013] and gaps consistent with the STRETCHED pitch minus width.
- [ ] **Step 2: Verify failure. Step 3: Implement. Step 4: Pass (full em suite). Step 5: Commit** (`Add the EM gap measurer`).

---

### Task 4: Analyzer + render-recovery gate

**Files:**
- Create: `web/src/engine/em/emAnalyzer.ts`
- Test: `web/tests/engine/em/emAnalyzer.spec.ts` (the rule-1 gate)

**Interfaces:**
- Produces:
```ts
export interface EmResult {
  success: boolean
  failureReason: string | null
  /** Deposited bead width in true mm (median after MAD rejection), null on failure. */
  wMm: number | null
  /** Blur bias from the 2 mm separators, mm. */
  biasMm: number | null
  /** Printer X-scale diagnostic (1 = perfect). */
  pitchScale: number | null
  /** Per-gap w estimates kept after rejection (diagnostics/overlay). */
  samples: { row: 0 | 1; blockIndex: number; wMm: number }[]
  blocksMeasured: number
  flipped: boolean
  rotationQuarterTurns: number
}
export function analyzeEmCoupon(
  cv: OpenCv, imageBgr: Mat, spec: EmTestSpec, scanPxPerMm: number,
): EmResult
```
- Pipeline: align (failure => EmResult failure), value channel, measure, then:
  - `biasMm` = median(separator widths) - BLOCK_GAP_MM.
  - Per gap g between lines j, j+1 of a block: local pitch = lineCenters[j+1] - lineCenters[j]; sample `w = localPitch - (g - biasMm)`.
  - MAD outlier rejection over all samples (reject |x - median| > 3.5 * 1.4826 * MAD), then `wMm` = median of survivors.
  - Failure cases (success=false, worded reasons): alignment failed; fewer than 8 blocks measured; fewer than 30 surviving samples; wMm outside (0.2, 2) mm.
  - `pitchScale` from measurement.

- [ ] **Step 1: Failing rule-1 recovery tests** (the gate; keep them exactly this strong):
```ts
// for trueWidth of [0.36, 0.40, 0.42, 0.46, 0.50]: clean render -> |wMm - trueWidth| <= 0.005
// perturbed: trueWidth 0.42 with {rotationDegrees: 2, flipped: true, quarterTurns: 1,
//   noiseSigma: 8, blurSigmaMm: 0.08} -> |wMm - 0.42| <= 0.008
// inverted polarity (backgroundGray 30, plasticGray 220): |wMm - 0.42| <= 0.008
// pitchScale 1.01 render: wMm still within 0.008 of truth AND result.pitchScale in [1.005, 1.015]
// blank image: success false with failureReason
```
- [ ] **Step 2: Verify failure. Step 3: Implement. Step 4: All pass (full suite). Step 5: Commit** (`Add the EM analyzer with render-recovery validation`).

---

### Task 5: Correction formatter

**Files:**
- Create: `web/src/engine/em/emCorrectionFormatter.ts`
- Test: `web/tests/engine/em/emCorrectionFormatter.spec.ts`

**Interfaces:**
```ts
export interface EmCorrection {
  /** New slicer flow / extrusion multiplier percentage. */
  newFlowPercent: number
  /** Runtime command per firmware, e.g. 'M221 S97' (Marlin/RRF) or Klipper equivalent. */
  command: string
  /** One-line explanation for the UI. */
  summary: string
}
export function emCorrection(
  firmware: Firmware, currentFlowPercent: number, nominalWidthMm: number, wMm: number,
): EmCorrection
```
- `newFlowPercent = currentFlowPercent * nominalWidthMm / wMm`, rounded to 1 decimal. Commands: Marlin `M221 S<pct>`, RepRapFirmware `M221 S<pct>` (both percent), Klipper: no persistent M221 equivalent in config: emit `M221 S<pct>` too (Klipper accepts M221 for gcode flow scaling) plus summary advising to set the slicer flow instead. Summary text mentions the slicer flow value as the durable fix for all firmwares.

- [ ] Steps: failing tests (all three firmwares, ratio math incl. currentFlow 95 case: 95 * 0.42/0.437 = 91.3), implement, pass, commit (`Add the EM correction formatter`).

---

### Task 6: Overlay renderer

**Files:**
- Create: `web/src/engine/em/emOverlayRenderer.ts`
- Test: `web/tests/engine/em/emOverlayRenderer.spec.ts`

**Interfaces:**
- `renderEmOverlayMat(cv, imageBgr, alignment, spec, result): Mat`: mirror `paOverlayRenderer.ts` (read FIRST): draw each measured block as a rectangle tinted by |per-block median w - wMm| (green = close, red = far), fiducials outlined yellow, crop to coupon + 5% margin. Caller deletes the Mat.
- [ ] Steps: failing test (returns Mat of cropped size on a render, requires alignment success), implement, pass, commit (`Add the EM overlay renderer`).

---

### Task 7: Worker + client integration

**Files:**
- Modify: `web/src/worker/analysis.worker.ts`, `web/src/workerClient.ts`
- Test: covered by e2e (worker code is thin plumbing; unit tests stay on the engine)

**Interfaces:**
- Worker: `analyzeEmScan(bytes: ArrayBuffer, spec: EmTestSpec, scanPxPerMm: number, onProgress?)` returning `{ result: EmResult, overlay: ImageBitmap }`: same decode path, progress stages `'decode' | 'align' | 'measure' | 'render'` (new `EmProgress` type in `em/types.ts`), overlay from Task 6 on success, plain decoded scan otherwise. Expose beside `analyzePaScan`.
- Client: `analyzeEmScan(...)` wrapper in `workerClient.ts` mirroring the PA one (transfer bytes, proxy callback, `EmProcessing` type).
- [ ] Steps: implement both (read the PA plumbing first, keep it symmetrical), `npx vue-tsc --noEmit` + full unit suite green, commit (`Wire the EM analysis through the worker`).

---

### Task 8: Flow page scan upload + results UI

**Files:**
- Modify: `web/src/components/EmPage.vue`
- Test: e2e (Task 9); typecheck + existing suites must stay green

**Behavior:**
- New step 5 card "Scan the print" (after Generate): drop/file input (`data-testid="em-scan-input"`), DISABLED with an explanatory line when `!isCalibrated` (hard requirement: the analysis needs the card px/mm): the input must not accept files without calibration. A "current flow %" NumericField (default 100, `data-testid="em-current-flow"`) feeding the correction. Progress line during analysis (reuse the PA pattern: `analyzing` lock, progress text per stage).
- Results card (step 6) on success: measured width (`data-testid="em-width"`), flow correction (`data-testid="em-flow"`), the firmware command in a CodeBlock (copyable), bias + pitchScale as small chips; a warning chip when |pitchScale - 1| > 0.003 advising the skew/size calibration; overlay image (OverlayCanvas component like PA). On failure: the failureReason in an alert. Keep the `analyzedSpec` snapshot pattern from PaPage so results stay consistent when the form changes.
- Calibration px/mm comes from `useCalibration().calibration.pxPerMm`; SCALE it by the ratio of the uploaded scan's implied dpi? NO: like the XYZ flow, the calibration is valid for the dpi it was made at; pass `calibration.pxPerMm` directly and state in the UI note "scan at the calibrated resolution" (already present).
- [ ] Steps: implement, typecheck + unit + existing e2e green, commit (`Add scan upload and flow results to the flow page`).

---

### Task 9: Fixtures + real end-to-end test (definition of done)

**Files:**
- Create: `web/e2e/fixtures/em_real_scan.png` (binary copy of `C:\Users\jakob\Documents\IMG_20260709_0002.png`)
- Create: `web/e2e/fixtures/em_synthetic.png` (write a small script with vite-node using `renderEmScan` at pxPerMm 12, trueWidth 0.42, rotation 2 degrees, noise 6; save via pngjs; the script lives in scratch, only the PNG is committed)
- Create: `web/tests/engine/em/realScan.spec.ts`
- Create: `web/e2e/em.spec.ts`

**Real-scan unit test** (`realScan.spec.ts`, mirror `pa/realScan.spec.ts`): decode `em_real_scan.png` via `decodeE2eFixtureBgr`, `alignEmCoupon` succeeds, `analyzeEmCoupon(cv, img, defaultEmTestSpec(defaultPrinterProfile()), 23.622)` succeeds with: `biasMm` in [-0.06, 0.06], `wMm` in [0.38, 0.47], >= 20 blocks measured, `pitchScale` in [0.99, 1.01]. Timeout 180s. These bounds are physical sanity, not tuned targets; if the pipeline disagrees with them, investigate the pipeline, do not widen bounds without evidence.

**Playwright e2e** (`em.spec.ts`, mirror `pa.spec.ts` patterns incl. localStorage.clear() per test):
1. Synthetic path: goto '/', seed calibration BEFORE app load via `page.addInitScript` writing localStorage key `scanntune.calibration` with `{ pxPerMm: 12, dpi: 304.8, referenceMm: 85.6, measuredWidthPx: 1027.2, straightnessPx: 0.1, parallelismDegrees: 0.02 }` (fields per `useCalibration`/`isUsableCalibration`; read them first and match exactly), create a printer profile via the UI, upload `em_synthetic.png` into `em-scan-input`, expect `em-width` to show 0.42 +/- 0.01 and `em-flow` visible.
2. Real path (THE definition-of-done test): seed calibration with the real scanner's values `{ pxPerMm: 23.622, dpi: 600, ... }` (same field shape), create profile, upload `em_real_scan.png`, wait for the result (120s timeout, 35 MP), assert success UI visible, `em-width` value parses to within [0.38, 0.47], and the correction command block is non-empty.
3. Uncalibrated path: without seeding calibration, the scan input is disabled and the requirement note is visible.
- [ ] Steps: copy fixtures, write specs (they fail: UI/testids exist from Task 8, values real), fix anything they surface, full `npm run build && npm test && npm run e2e` green, commit (`Add EM real-scan and synthetic end-to-end coverage`).

---

### Task 10: Docs + final gate

**Files:**
- Modify: `CLAUDE.md` (extend the "Pressure advance calibration" section pattern with a short EM paragraph: measurement principle, hard calibration requirement, emRender validation contract)
- Modify: ledger `.superpowers/sdd/progress.md`

- [ ] Update CLAUDE.md (concise, mirrors the PA paragraph's altitude).
- [ ] Full gate: `cd web && npm run build && npm test && npm run e2e` all green.
- [ ] Final whole-branch review (subagent-driven flow), fix wave if needed, ledger entry, STOP (no push, no merge: owner approval pending).

---

## Self-review notes

- Spec coverage: renderer gate (T1), aligner (T2), true-mm measurement + stretch diagnostic (T3), estimator w/bias/MAD + failure contract (T4), correction incl. current-flow ratio (T5), overlay (T6), worker (T7), UI incl. hard calibration gate + current flow input (T8), real e2e DoD (T9), docs (T10).
- Rule-1 chain: T1 renders from known truth; T4 tests recover it; T9 pins the real scan within physical bounds.
- Type names cross-checked: EmAlignment/EmMeasurement/EmResult/EmCorrection consistent across tasks; scanPxPerMm naming consistent (never "dpi" in engine APIs).
