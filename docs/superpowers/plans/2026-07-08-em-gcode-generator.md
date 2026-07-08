# EM Calibration Stage 1 (Coupon G-code Generator + UI) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Generate a printable extrusion-multiplier pitch-block coupon G-code from the existing printer profiles, with a new Flow page, reusing the PA G-code machinery through a shared emitter module.

**Architecture:** Extract the private emitter helpers from `pa/gcodeGenerator.ts` into `web/src/engine/gcode/emitter.ts` (PA output byte-identical). New `web/src/engine/em/` holds `EmTestSpec`, coupon geometry, and the generator. UI reuses `usePrinterProfiles` untouched; the PA page's profile card is extracted into a shared component used by both pages. No vision code in this stage.

**Tech Stack:** Vue 3 + TypeScript + Vuetify, Pinia, Vitest. No new dependencies.

## Global Constraints

- Spec: `docs/superpowers/specs/2026-07-08-em-calibration-design.md`.
- Branch `feature/extrusion-multiplier`; commits allowed without prompting (standing grant); NO push.
- Commit messages: single short sentence, optional `Co-Authored-By: Claude <noreply@anthropic.com>` trailer, no other AI attribution.
- Never use the em-dash character anywhere; rewrite instead.
- No rule-number citations in source/comments/UI text.
- No silently swallowed errors; warnings surface through the report/UI.
- PA G-code output must remain byte-identical after the extraction; existing PA tests prove it.
- Verification gate for the stage: `npm run build`, `npm test`, `npm run e2e` (run inside `web/`) all green. STOP after that; the owner does a real print before any vision work.
- Geometry constants (from the approved design): nominal line width = 1.05 x nozzle; pedestal width = 0.72 x nominal; 4 layers total (2 pedestal + 2 measured); frame band 12 mm; center rail 4 mm; default line length 25 mm; block gap 2 mm; default 13 blocks x 10 lines; default pitch range factors 0.81 to 1.38 of nominal; fiducial inset 4 mm / hole 5 mm, origin corner (min-x, min-y) has no hole (same convention as PA).

---

### Task 1: Extract the shared G-code emitter module

**Files:**
- Create: `web/src/engine/gcode/emitter.ts`
- Modify: `web/src/engine/pa/gcodeGenerator.ts`
- Modify: `web/src/engine/pa/types.ts` (re-export `fitsA4` from the shared module)
- Test: existing `web/tests/engine/pa/gcodeGenerator.spec.ts` (unchanged, must stay green)

**Interfaces:**
- Consumes: `PrinterProfile`, `FilamentProfile` from `pa/types` (types only; move nothing).
- Produces (exact exports of `gcode/emitter.ts`):
  - `interface Emitter { lines: string[]; x: number; y: number }`
  - `extrusionMm(lengthMm, lineWidthMm, layerHeightMm, filamentDiameterMm): number`
  - `travel(e, p, x, y): void`
  - `extrude(e, p, f, lineWidthMm, x, y, speedMmS): void`  (width is now a direct parameter, NOT a spec field)
  - `retract(e, p, sign): void`
  - `rectLoop(e, p, f, lineWidthMm, x0, y0, x1, y1, speedMmS): void`
  - `basePerimeters(e, p, f, lineWidthMm, x0, y0, w, h, holes): void`
  - `rasterBase(e, p, f, lineWidthMm, x0, y0, w, h, angle45, holes): void`
  - `motionLimitCommands(p): string[]`
  - `startGcodeHeats(gcode): boolean`, `COLD_PRINT_WARNING: string`
  - `fitsA4(widthMm, heightMm): boolean`
  - Constants: `BASE_LAYERS`, `RASTER_STEP_FACTOR`, `RASTER_SPEED_FACTOR`, `PERIMETER_LOOPS`
  - `type Box = { x0: number; y0: number; x1: number; y1: number }`

- [ ] **Step 1: Create `web/src/engine/gcode/emitter.ts`**

Move these verbatim from `pa/gcodeGenerator.ts`, changing ONLY the width plumbing: every function that read `spec.lineWidthMm` takes `lineWidthMm: number` instead of `spec: PaTestSpec` (`extrude`, `rectLoop`, `basePerimeters`, `rasterBase`); `clipRangeAgainstBox` stays private to the module. Move `fitsA4` (with `A4_SHORT_MM`/`A4_LONG_MM`) here from `pa/types.ts`. Move `startGcodeHeats`, its three regexes, and `COLD_PRINT_WARNING`. Keep every algorithm line untouched: the diff inside function bodies must be only `spec.lineWidthMm` becoming `lineWidthMm`.

```ts
import type { FilamentProfile, PrinterProfile } from '../pa/types'

export interface Emitter {
  lines: string[]
  x: number
  y: number
}

export type Box = { x0: number; y0: number; x1: number; y1: number }

/** Standard slicer volumetric flow: bead cross-section approximated as w * h. */
export function extrusionMm(
  lengthMm: number,
  lineWidthMm: number,
  layerHeightMm: number,
  filamentDiameterMm: number,
): number {
  const filamentArea = Math.PI * (filamentDiameterMm / 2) ** 2
  return (lineWidthMm * layerHeightMm * lengthMm) / filamentArea
}

export function travel(e: Emitter, p: PrinterProfile, x: number, y: number): void { /* moved body */ }

export function extrude(
  e: Emitter,
  p: PrinterProfile,
  f: FilamentProfile,
  lineWidthMm: number,
  x: number,
  y: number,
  speedMmS: number,
): void { /* moved body, extrusionMm(len, lineWidthMm, ...) */ }

export function retract(e: Emitter, p: PrinterProfile, sign: 1 | -1): void { /* moved body */ }
// ... rectLoop, basePerimeters, rasterBase (each with lineWidthMm param), clipRangeAgainstBox (private),
// motionLimitCommands, startGcodeHeats + regexes + COLD_PRINT_WARNING,
// BASE_LAYERS, RASTER_STEP_FACTOR, RASTER_SPEED_FACTOR, PERIMETER_LOOPS,
// fitsA4 + A4_SHORT_MM + A4_LONG_MM
```

Note on `pa/types.ts` importing from `gcode/`: `fitsA4` moves to the shared module and `pa/types.ts` re-exports it (`export { fitsA4 } from '../gcode/emitter'`) so `PaPage.vue` and tests keep their import paths.

- [ ] **Step 2: Rewrite `pa/gcodeGenerator.ts` as a consumer**

Delete the moved code; import from `../gcode/emitter`; keep `paCommand`, `smoothTimeCommand`, `sweepCommand`, `generatePaGcode`, `generatePaGcodeWithReport`, `emitPaGcode` here (PA-specific). Re-export `extrusionMm` for back-compat (`export { extrusionMm } from '../gcode/emitter'`). Every former `extrude(e, profile, filament, spec, ...)` call becomes `extrude(e, profile, filament, spec.lineWidthMm, ...)`, same for `rectLoop`/`basePerimeters`/`rasterBase`.

- [ ] **Step 3: Typecheck and run the full unit suite**

Run: `cd web && npx vue-tsc --noEmit && npm test`
Expected: all existing tests PASS, zero modifications under `web/tests/`.

- [ ] **Step 4: Commit**

```bash
git add web/src/engine/gcode/emitter.ts web/src/engine/pa/gcodeGenerator.ts web/src/engine/pa/types.ts
git commit -m "Extract shared G-code emitter module from the PA generator"
```

---

### Task 2: EM spec types and coupon geometry

**Files:**
- Create: `web/src/engine/em/types.ts`
- Test: `web/tests/engine/em/types.spec.ts`

**Interfaces:**
- Consumes: `PrinterProfile` from `../pa/types`, `fitsA4` from `../gcode/emitter`.
- Produces:
  - `interface EmTestSpec { pitchMinMm; pitchMaxMm; blockCount; linesPerBlock; lineLengthMm; printSpeedMmS; nominalLineWidthMm }` (all `number`)
  - `defaultEmTestSpec(profile: PrinterProfile): EmTestSpec`
  - `pitchForBlock(spec, index): number`
  - `interface EmBlock { index; pitchMm; x0Mm; widthMm; lineXsMm: number[] }`
  - `interface EmCouponGeometry { couponWidthMm; couponHeightMm; frameBandMm; railWidthMm; fiducialInsetMm; fiducialSizeMm; fiducials: {xMm,yMm}[]; topRow: EmBlock[]; bottomRow: EmBlock[]; topRowY0Mm; topRowY1Mm; bottomRowY0Mm; bottomRowY1Mm; railY0Mm; railY1Mm }`
  - `emCouponGeometry(spec: EmTestSpec): EmCouponGeometry`
  - Constants: `PEDESTAL_WIDTH_FACTOR = 0.72`, `PEDESTAL_LAYERS = 2`, `MEASURED_LAYERS = 2`, `FRAME_BAND_MM = 12`, `RAIL_WIDTH_MM = 4`, `BLOCK_GAP_MM = 2`, `INNER_MARGIN_MM = 3`
  - `volumetricFlowMm3S(spec, layerHeightMm): number`
  - `accelRampMm(speedMmS, accelMmS2): number`

- [ ] **Step 1: Write the failing tests**

```ts
// web/tests/engine/em/types.spec.ts
import { describe, expect, it } from 'vitest'
import { defaultPrinterProfile } from '../../../src/engine/pa/types'
import {
  accelRampMm,
  defaultEmTestSpec,
  emCouponGeometry,
  pitchForBlock,
  volumetricFlowMm3S,
} from '../../../src/engine/em/types'

describe('defaultEmTestSpec', () => {
  it('derives widths and pitch range from the nozzle', () => {
    const spec = defaultEmTestSpec(defaultPrinterProfile()) // 0.4 nozzle
    expect(spec.nominalLineWidthMm).toBeCloseTo(0.42, 5)
    expect(spec.pitchMinMm).toBeCloseTo(0.34, 2)
    expect(spec.pitchMaxMm).toBeCloseTo(0.58, 2)
    expect(spec.blockCount).toBe(13)
    expect(spec.linesPerBlock).toBe(10)
    expect(spec.lineLengthMm).toBe(25)
    expect(spec.printSpeedMmS).toBeGreaterThan(0)
  })
  it('scales for a 0.6 nozzle', () => {
    const p = { ...defaultPrinterProfile(), nozzleDiameterMm: 0.6 }
    const spec = defaultEmTestSpec(p)
    expect(spec.nominalLineWidthMm).toBeCloseTo(0.63, 5)
    expect(spec.pitchMinMm).toBeLessThan(spec.nominalLineWidthMm)
    expect(spec.pitchMaxMm).toBeGreaterThan(spec.nominalLineWidthMm)
  })
})

describe('pitchForBlock', () => {
  it('is linear from pitchMin to pitchMax inclusive', () => {
    const spec = defaultEmTestSpec(defaultPrinterProfile())
    expect(pitchForBlock(spec, 0)).toBeCloseTo(spec.pitchMinMm, 9)
    expect(pitchForBlock(spec, spec.blockCount - 1)).toBeCloseTo(spec.pitchMaxMm, 9)
    const step = pitchForBlock(spec, 1) - pitchForBlock(spec, 0)
    expect(pitchForBlock(spec, 2) - pitchForBlock(spec, 1)).toBeCloseTo(step, 9)
  })
})

describe('emCouponGeometry', () => {
  const spec = defaultEmTestSpec(defaultPrinterProfile())
  const g = emCouponGeometry(spec)
  it('lays out the requested number of blocks in both rows', () => {
    expect(g.topRow).toHaveLength(spec.blockCount)
    expect(g.bottomRow).toHaveLength(spec.blockCount)
    for (const b of g.topRow) expect(b.lineXsMm).toHaveLength(spec.linesPerBlock)
  })
  it('mirrors the bottom row pitch order', () => {
    expect(g.bottomRow[0].pitchMm).toBeCloseTo(g.topRow[g.topRow.length - 1].pitchMm, 9)
    expect(g.bottomRow[g.bottomRow.length - 1].pitchMm).toBeCloseTo(g.topRow[0].pitchMm, 9)
  })
  it('spaces lines inside a block exactly at the block pitch', () => {
    const b = g.topRow[3]
    for (let j = 1; j < b.lineXsMm.length; j++) {
      expect(b.lineXsMm[j] - b.lineXsMm[j - 1]).toBeCloseTo(b.pitchMm, 9)
    }
  })
  it('keeps all lines inside the frame window', () => {
    for (const row of [g.topRow, g.bottomRow]) {
      for (const b of row) {
        expect(b.lineXsMm[0]).toBeGreaterThan(g.frameBandMm)
        expect(b.lineXsMm[b.lineXsMm.length - 1]).toBeLessThan(g.couponWidthMm - g.frameBandMm)
      }
    }
  })
  it('places three fiducials and leaves the origin corner empty', () => {
    expect(g.fiducials).toHaveLength(3)
    const nearOrigin = g.fiducials.filter((f) => f.xMm < 20 && f.yMm < 20)
    expect(nearOrigin).toHaveLength(0)
  })
  it('stacks rows and rail without overlap', () => {
    expect(g.topRowY1Mm).toBeLessThanOrEqual(g.railY0Mm)
    expect(g.railY1Mm).toBeLessThanOrEqual(g.bottomRowY0Mm)
    expect(g.bottomRowY1Mm).toBeCloseTo(g.couponHeightMm - g.frameBandMm, 9)
  })
})

describe('warning helpers', () => {
  it('computes volumetric flow as speed * width * layer height', () => {
    const spec = { ...defaultEmTestSpec(defaultPrinterProfile()), printSpeedMmS: 100 }
    expect(volumetricFlowMm3S(spec, 0.2)).toBeCloseTo(100 * spec.nominalLineWidthMm * 0.2, 9)
  })
  it('computes the acceleration ramp distance v^2 / (2a)', () => {
    expect(accelRampMm(100, 5000)).toBeCloseTo(1.0, 9)
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd web && npx vitest run tests/engine/em/types.spec.ts`
Expected: FAIL (module `../../../src/engine/em/types` not found).

- [ ] **Step 3: Implement `web/src/engine/em/types.ts`**

```ts
import type { PrinterProfile } from '../pa/types'

export const PEDESTAL_WIDTH_FACTOR = 0.72
export const PEDESTAL_LAYERS = 2
export const MEASURED_LAYERS = 2
export const FRAME_BAND_MM = 12
export const RAIL_WIDTH_MM = 4
export const BLOCK_GAP_MM = 2
export const INNER_MARGIN_MM = 3
/** Nominal single-bead width as a fraction of the nozzle diameter (standard slicer default). */
const NOMINAL_WIDTH_FACTOR = 1.05
/** Default pitch sweep as fractions of the nominal width (~ -20% to +38% deposited width). */
const PITCH_MIN_FACTOR = 0.81
const PITCH_MAX_FACTOR = 1.38
/** Conservative default volumetric flow cap used to derive the default speed. */
const DEFAULT_MAX_FLOW_MM3_S = 8

export interface EmTestSpec {
  pitchMinMm: number
  pitchMaxMm: number
  blockCount: number
  linesPerBlock: number
  lineLengthMm: number
  printSpeedMmS: number
  nominalLineWidthMm: number
}

export function defaultEmTestSpec(profile: PrinterProfile): EmTestSpec {
  const nominal = profile.nozzleDiameterMm * NOMINAL_WIDTH_FACTOR
  const round2 = (v: number) => Math.round(v * 100) / 100
  const speedCap = DEFAULT_MAX_FLOW_MM3_S / (nominal * profile.layerHeightMm)
  return {
    pitchMinMm: round2(nominal * PITCH_MIN_FACTOR),
    pitchMaxMm: round2(nominal * PITCH_MAX_FACTOR),
    blockCount: 13,
    linesPerBlock: 10,
    lineLengthMm: 25,
    printSpeedMmS: Math.min(profile.travelSpeedMmS / 2, Math.floor(speedCap)),
    nominalLineWidthMm: nominal,
  }
}

export function pitchForBlock(spec: EmTestSpec, index: number): number {
  return spec.pitchMinMm + ((spec.pitchMaxMm - spec.pitchMinMm) * index) / (spec.blockCount - 1)
}

export interface EmBlock {
  index: number
  pitchMm: number
  x0Mm: number
  widthMm: number
  lineXsMm: number[]
}

export interface EmCouponGeometry {
  couponWidthMm: number
  couponHeightMm: number
  frameBandMm: number
  railWidthMm: number
  fiducialInsetMm: number
  fiducialSizeMm: number
  fiducials: { xMm: number; yMm: number }[]
  topRow: EmBlock[]
  bottomRow: EmBlock[]
  topRowY0Mm: number
  topRowY1Mm: number
  railY0Mm: number
  railY1Mm: number
  bottomRowY0Mm: number
  bottomRowY1Mm: number
}

function buildRow(spec: EmTestSpec, x0: number, reversed: boolean): EmBlock[] {
  const order = [...Array(spec.blockCount).keys()]
  if (reversed) order.reverse()
  const blocks: EmBlock[] = []
  let x = x0
  for (const index of order) {
    const pitch = pitchForBlock(spec, index)
    const width = (spec.linesPerBlock - 1) * pitch + spec.nominalLineWidthMm
    const first = x + spec.nominalLineWidthMm / 2
    const lineXsMm = [...Array(spec.linesPerBlock).keys()].map((j) => first + j * pitch)
    blocks.push({ index, pitchMm: pitch, x0Mm: x, widthMm: width, lineXsMm })
    x += width + BLOCK_GAP_MM
  }
  return blocks
}

export function emCouponGeometry(spec: EmTestSpec): EmCouponGeometry {
  const blocksWidth =
    [...Array(spec.blockCount).keys()]
      .map((i) => (spec.linesPerBlock - 1) * pitchForBlock(spec, i) + spec.nominalLineWidthMm)
      .reduce((a, b) => a + b, 0) +
    (spec.blockCount - 1) * BLOCK_GAP_MM
  const couponWidthMm = blocksWidth + 2 * INNER_MARGIN_MM + 2 * FRAME_BAND_MM
  const couponHeightMm = 2 * spec.lineLengthMm + RAIL_WIDTH_MM + 2 * FRAME_BAND_MM
  const inset = 4
  const size = 5
  const rowX0 = FRAME_BAND_MM + INNER_MARGIN_MM
  const topRowY0Mm = FRAME_BAND_MM
  const topRowY1Mm = topRowY0Mm + spec.lineLengthMm
  const railY0Mm = topRowY1Mm
  const railY1Mm = railY0Mm + RAIL_WIDTH_MM
  const bottomRowY0Mm = railY1Mm
  const bottomRowY1Mm = bottomRowY0Mm + spec.lineLengthMm
  return {
    couponWidthMm,
    couponHeightMm,
    frameBandMm: FRAME_BAND_MM,
    railWidthMm: RAIL_WIDTH_MM,
    fiducialInsetMm: inset,
    fiducialSizeMm: size,
    // Hole centers; the (min-x, min-y) origin corner deliberately has none (PA convention).
    fiducials: [
      { xMm: couponWidthMm - inset - size / 2, yMm: inset + size / 2 },
      { xMm: couponWidthMm - inset - size / 2, yMm: couponHeightMm - inset - size / 2 },
      { xMm: inset + size / 2, yMm: couponHeightMm - inset - size / 2 },
    ],
    topRow: buildRow(spec, rowX0, false),
    bottomRow: buildRow(spec, rowX0, true),
    topRowY0Mm,
    topRowY1Mm,
    railY0Mm,
    railY1Mm,
    bottomRowY0Mm,
    bottomRowY1Mm,
  }
}

export function volumetricFlowMm3S(spec: EmTestSpec, layerHeightMm: number): number {
  return spec.printSpeedMmS * spec.nominalLineWidthMm * layerHeightMm
}

export function accelRampMm(speedMmS: number, accelMmS2: number): number {
  return (speedMmS * speedMmS) / (2 * accelMmS2)
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd web && npx vitest run tests/engine/em/types.spec.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add web/src/engine/em/types.ts web/tests/engine/em/types.spec.ts
git commit -m "Add EM test spec types and pitch-block coupon geometry"
```

---

### Task 3: EM G-code generator

**Files:**
- Create: `web/src/engine/em/gcodeGenerator.ts`
- Test: `web/tests/engine/em/gcodeGenerator.spec.ts`

**Interfaces:**
- Consumes: everything from `../gcode/emitter`, `EmTestSpec`/`emCouponGeometry`/constants from `./types`, `substituteSlicerVariables` from `../pa/slicerVariables`, profile types from `../pa/types`.
- Produces:
  - `generateEmGcode(profile, filament, spec): string`
  - `generateEmGcodeWithReport(profile, filament, spec): { gcode: string; unknownVariables: string[]; warnings: string[] }`
  - `HIGH_FLOW_WARNING_THRESHOLD_MM3_S = 12`

Behavior contract:
- Throws when: coupon does not fit the bed; `blockCount < 3`; `linesPerBlock < 2`; `pitchMaxMm <= pitchMinMm`; `printSpeedMmS <= 0`.
- Warnings (never throws): cold start G-code (reuse `startGcodeHeats` + `COLD_PRINT_WARNING`); volumetric flow above 12 mm3/s (text names the computed value); acceleration ramp `2 * v^2/(2a) > lineLengthMm / 2` (line middles never reach speed).
- Layer plan: 4 layers. Frame band + rail print on every layer at nominal width. Comb lines print on every layer: layers 1-2 at `PEDESTAL_WIDTH_FACTOR * nominal`, layers 3-4 at nominal. Layer 1 additionally starts with a 2-loop skirt 3 mm outside the coupon as the prime.
- Frame band per layer: `basePerimeters` over the outer rectangle with holes = [interior window, 3 fiducial boxes], then `rasterBase` over the outer rectangle with the same holes (window and fiducials expanded by the perimeter inset), alternating 45/135 degrees per layer. The interior window as a hole box is what turns the PA solid-base fill into a frame.
- Rail per layer: `rasterBase` over the rail rectangle, no holes.
- Comb lines: vertical, serpentine within a block (alternate top-to-bottom / bottom-to-top, tiny sideways travel between lines, no retract inside a block), `retract`/`travel`/`unretract` between blocks. Top row spans `topRowY0Mm..topRowY1Mm`, bottom row `bottomRowY0Mm..bottomRowY1Mm`. All comb extrusion at `spec.printSpeedMmS`.
- No pause, no filament change, no flow (M221) commands anywhere.
- Header comment `; ScanNTune extrusion multiplier test` plus a comment stating the speed and nominal width used.

- [ ] **Step 1: Write the failing tests**

```ts
// web/tests/engine/em/gcodeGenerator.spec.ts
import { describe, expect, it } from 'vitest'
import { defaultFilamentProfile, defaultPrinterProfile } from '../../../src/engine/pa/types'
import { defaultEmTestSpec, emCouponGeometry, PEDESTAL_WIDTH_FACTOR } from '../../../src/engine/em/types'
import { extrusionMm } from '../../../src/engine/gcode/emitter'
import { generateEmGcodeWithReport } from '../../../src/engine/em/gcodeGenerator'

const profile = defaultPrinterProfile()
const filament = defaultFilamentProfile()
const spec = defaultEmTestSpec(profile)

describe('generateEmGcodeWithReport', () => {
  const report = generateEmGcodeWithReport(profile, filament, spec)
  const lines = report.gcode.split('\n')

  it('emits a header, start gcode, and motion limits', () => {
    expect(lines[0]).toContain('extrusion multiplier test')
    expect(report.gcode).toContain('M83')
    expect(report.gcode).toContain('G90')
    expect(report.gcode).toContain('SET_VELOCITY_LIMIT') // Klipper default profile
  })

  it('prints four layers', () => {
    const zMoves = lines.filter((l) => l.startsWith('G1 Z'))
    const zs = [...new Set(zMoves.map((l) => l.match(/Z([\d.]+)/)![1]))]
    expect(zs).toHaveLength(4)
  })

  it('contains no pause and no flow commands', () => {
    expect(report.gcode).not.toContain('PAUSE')
    expect(report.gcode).not.toContain('M221')
  })

  it('uses the pedestal width on layer 1 and the nominal width on layer 4 for comb lines', () => {
    // A full-length vertical comb line's E value identifies its commanded width.
    const eFor = (w: number) =>
      extrusionMm(spec.lineLengthMm, w, profile.layerHeightMm, filament.filamentDiameterMm)
    const pedestalE = eFor(PEDESTAL_WIDTH_FACTOR * spec.nominalLineWidthMm).toFixed(5)
    const nominalE = eFor(spec.nominalLineWidthMm).toFixed(5)
    expect(report.gcode).toContain(`E${pedestalE}`)
    expect(report.gcode).toContain(`E${nominalE}`)
  })

  it('emits one comb move per line per layer', () => {
    const g = emCouponGeometry(spec)
    const eFor = (w: number) =>
      extrusionMm(spec.lineLengthMm, w, profile.layerHeightMm, filament.filamentDiameterMm)
    const nominalE = `E${eFor(spec.nominalLineWidthMm).toFixed(5)}`
    const combMoves = lines.filter((l) => l.includes(nominalE))
    // 2 measured layers x 2 rows x blockCount x linesPerBlock
    expect(combMoves.length).toBe(2 * 2 * spec.blockCount * spec.linesPerBlock)
    expect(g.topRow).toHaveLength(spec.blockCount)
  })

  it('throws when the coupon exceeds the bed', () => {
    const tiny = { ...profile, bedWidthMm: 50, bedDepthMm: 50 }
    expect(() => generateEmGcodeWithReport(tiny, filament, spec)).toThrow(/fit/i)
  })

  it('warns on high volumetric flow instead of blocking', () => {
    const fast = { ...spec, printSpeedMmS: 300 }
    const r = generateEmGcodeWithReport(profile, filament, fast)
    expect(r.warnings.some((w) => w.includes('mm^3/s'))).toBe(true)
  })

  it('warns when acceleration ramps eat the line middle', () => {
    const slowAccel = { ...profile, printAccelMmS2: 500 }
    const fast = { ...spec, printSpeedMmS: 300 }
    const r = generateEmGcodeWithReport(slowAccel, filament, fast)
    expect(r.warnings.some((w) => w.toLowerCase().includes('speed'))).toBe(true)
  })

  it('reports unknown slicer variables from the start gcode', () => {
    const weird = { ...profile, startGcode: 'M104 S[not_a_real_variable]' }
    const r = generateEmGcodeWithReport(weird, filament, spec)
    expect(r.unknownVariables).toContain('not_a_real_variable')
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd web && npx vitest run tests/engine/em/gcodeGenerator.spec.ts`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement `web/src/engine/em/gcodeGenerator.ts`**

```ts
import type { FilamentProfile, PrinterProfile } from '../pa/types'
import { substituteSlicerVariables } from '../pa/slicerVariables'
import {
  basePerimeters,
  COLD_PRINT_WARNING,
  type Emitter,
  extrude,
  motionLimitCommands,
  PERIMETER_LOOPS,
  rasterBase,
  rectLoop,
  retract,
  startGcodeHeats,
  travel,
  type Box,
} from '../gcode/emitter'
import {
  accelRampMm,
  emCouponGeometry,
  type EmTestSpec,
  MEASURED_LAYERS,
  PEDESTAL_LAYERS,
  PEDESTAL_WIDTH_FACTOR,
  volumetricFlowMm3S,
} from './types'

export const HIGH_FLOW_WARNING_THRESHOLD_MM3_S = 12
const SKIRT_OFFSET_MM = 3
const SKIRT_LOOPS = 2

export function generateEmGcode(
  profile: PrinterProfile,
  filament: FilamentProfile,
  spec: EmTestSpec,
): string {
  return generateEmGcodeWithReport(profile, filament, spec).gcode
}

export function generateEmGcodeWithReport(
  profile: PrinterProfile,
  filament: FilamentProfile,
  spec: EmTestSpec,
): { gcode: string; unknownVariables: string[]; warnings: string[] } {
  if (spec.blockCount < 3) throw new Error('At least 3 pitch blocks are needed for a fit')
  if (spec.linesPerBlock < 2) throw new Error('Each block needs at least 2 lines')
  if (spec.pitchMaxMm <= spec.pitchMinMm) throw new Error('Max pitch must exceed min pitch')
  if (spec.printSpeedMmS <= 0) throw new Error('Print speed must be positive')

  const start = substituteSlicerVariables(profile.startGcode, profile, filament)
  const end = substituteSlicerVariables(profile.endGcode, profile, filament)
  const substituted: PrinterProfile = { ...profile, startGcode: start.gcode, endGcode: end.gcode }
  const unknownVariables = [...new Set([...start.unknown, ...end.unknown])]
  const warnings = [...new Set([...start.warnings, ...end.warnings])]
  if (!startGcodeHeats(start.gcode)) warnings.push(COLD_PRINT_WARNING)

  const flow = volumetricFlowMm3S(spec, profile.layerHeightMm)
  if (flow > HIGH_FLOW_WARNING_THRESHOLD_MM3_S) {
    warnings.push(
      `Volumetric flow is ${flow.toFixed(1)} mm^3/s; typical hotends under-extrude above ` +
        `${HIGH_FLOW_WARNING_THRESHOLD_MM3_S} mm^3/s. Intended for high-flow hotends only.`,
    )
  }
  const ramp = accelRampMm(spec.printSpeedMmS, profile.printAccelMmS2)
  if (2 * ramp > spec.lineLengthMm / 2) {
    warnings.push(
      'At this speed and acceleration the line middles never reach the commanded speed; ' +
        'lower the speed, raise the acceleration, or lengthen the lines.',
    )
  }

  return { gcode: emitEmGcode(substituted, filament, spec), unknownVariables, warnings }
}

function emitEmGcode(profile: PrinterProfile, filament: FilamentProfile, spec: EmTestSpec): string {
  const g = emCouponGeometry(spec)
  const ox = (profile.bedWidthMm - g.couponWidthMm) / 2
  const oy = (profile.bedDepthMm - g.couponHeightMm) / 2
  if (ox < 0 || oy < 0) throw new Error('Coupon does not fit on the configured bed')

  const nominal = spec.nominalLineWidthMm
  const holes: Box[] = g.fiducials.map((f) => ({
    x0: ox + f.xMm - g.fiducialSizeMm / 2,
    y0: oy + f.yMm - g.fiducialSizeMm / 2,
    x1: ox + f.xMm + g.fiducialSizeMm / 2,
    y1: oy + f.yMm + g.fiducialSizeMm / 2,
  }))
  // The interior window is a hole box: it turns the solid-base fill into a frame band.
  const windowBox: Box = {
    x0: ox + g.frameBandMm,
    y0: oy + g.frameBandMm,
    x1: ox + g.couponWidthMm - g.frameBandMm,
    y1: oy + g.couponHeightMm - g.frameBandMm,
  }

  const e: Emitter = { lines: [], x: 0, y: 0 }
  const L = e.lines
  L.push('; ScanNTune extrusion multiplier test')
  L.push(`; nominal line width ${nominal.toFixed(3)} mm, comb speed ${spec.printSpeedMmS} mm/s`)
  L.push(...profile.startGcode.split('\n'))
  L.push('M83')
  L.push('G90')
  L.push(...motionLimitCommands(profile))

  const totalLayers = PEDESTAL_LAYERS + MEASURED_LAYERS
  const infillInset = PERIMETER_LOOPS * nominal
  const expand = (b: Box): Box => ({
    x0: b.x0 - infillInset,
    y0: b.y0 - infillInset,
    x1: b.x1 + infillInset,
    y1: b.y1 + infillInset,
  })

  for (let layer = 0; layer < totalLayers; layer++) {
    const z = profile.layerHeightMm * (layer + 1)
    L.push(`G1 Z${z.toFixed(3)} F600`)

    if (layer === 0) {
      // Skirt as the prime, outside the coupon.
      for (let k = 0; k < SKIRT_LOOPS; k++) {
        const off = SKIRT_OFFSET_MM + k * nominal
        rectLoop(e, profile, filament, nominal, ox - off, oy - off,
          ox + g.couponWidthMm + off, oy + g.couponHeightMm + off, spec.printSpeedMmS)
      }
    }

    // Frame band: solid-base machinery with the window + fiducials as holes.
    basePerimeters(e, profile, filament, nominal, ox, oy, g.couponWidthMm, g.couponHeightMm,
      [windowBox, ...holes])
    rasterBase(e, profile, filament, nominal, ox, oy, g.couponWidthMm, g.couponHeightMm,
      layer % 2 === 0, [expand(windowBox), ...holes.map(expand)])

    // Center rail.
    rasterBase(e, profile, filament, nominal, ox + g.frameBandMm, oy + g.railY0Mm,
      g.couponWidthMm - 2 * g.frameBandMm, g.railWidthMm, layer % 2 === 0, [])

    // Comb lines: pedestal width below, nominal width on the measured layers.
    const combWidth = layer < PEDESTAL_LAYERS ? PEDESTAL_WIDTH_FACTOR * nominal : nominal
    const rows: { blocks: typeof g.topRow; y0: number; y1: number }[] = [
      { blocks: g.topRow, y0: oy + g.topRowY0Mm, y1: oy + g.topRowY1Mm },
      { blocks: g.bottomRow, y0: oy + g.bottomRowY0Mm, y1: oy + g.bottomRowY1Mm },
    ]
    for (const row of rows) {
      for (const block of row.blocks) {
        retract(e, profile, 1)
        travel(e, profile, ox + block.lineXsMm[0], row.y0)
        retract(e, profile, -1)
        for (let j = 0; j < block.lineXsMm.length; j++) {
          const x = ox + block.lineXsMm[j]
          const down = j % 2 === 1
          if (j > 0) travel(e, profile, x, down ? row.y1 : row.y0)
          extrude(e, profile, filament, combWidth, x, down ? row.y0 : row.y1, spec.printSpeedMmS)
        }
      }
    }
  }

  retract(e, profile, 1)
  L.push(...profile.endGcode.split('\n'))
  return L.join('\n') + '\n'
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd web && npx vitest run tests/engine/em/gcodeGenerator.spec.ts`
Expected: PASS. Also run the full suite: `npm test` all green.

- [ ] **Step 5: Commit**

```bash
git add web/src/engine/em/gcodeGenerator.ts web/tests/engine/em/gcodeGenerator.spec.ts
git commit -m "Add the EM coupon G-code generator"
```

---

### Task 4: Extract the shared printer profile card from PaPage

**Files:**
- Create: `web/src/components/PrinterProfileCard.vue`
- Modify: `web/src/components/PaPage.vue`

**Interfaces:**
- Produces: `PrinterProfileCard.vue`, no props, no emits. It talks to `useApp` and `usePrinterProfiles` directly (exactly the code it absorbs). Renders: printer select (with the `New printer...` sentinel), filament select, summary chips, edit button, delete dialog.
- PaPage keeps only `canGenerate`-style derived state; the card markup and its handlers (`onSelect`, `openNew`, `openEdit`, `confirmDelete`, `onSelectFilament`, `selectItems`, `filamentItems`, `summaryChips`, `deleteOpen`, `NEW_ID`) move verbatim.

- [ ] **Step 1: Create `PrinterProfileCard.vue`**

Move from `PaPage.vue` into the new component: script parts listed above (imports: `computed, ref`, `useApp`, `usePrinterProfiles`, `defaultPrinterProfile`) and the profile card `<template>` block (the card containing the printer select, filament select, chips row, edit/delete controls, and the delete `v-dialog`). Copy the markup unchanged; this is a move, not a redesign. Keep `data-testid` attributes identical so Playwright selectors keep working.

- [ ] **Step 2: Use it in `PaPage.vue`**

Replace the moved markup with `<PrinterProfileCard />`, delete the moved script members, keep `store` (still used by generation/download and `canGenerate`).

- [ ] **Step 3: Verify**

Run: `cd web && npx vue-tsc --noEmit && npm test && npm run e2e`
Expected: all green; e2e exercises the PA page flows over the extracted card.

- [ ] **Step 4: Commit**

```bash
git add web/src/components/PrinterProfileCard.vue web/src/components/PaPage.vue
git commit -m "Extract the printer profile card into a shared component"
```

---

### Task 5: Flow page and navigation

**Files:**
- Create: `web/src/components/EmPage.vue`
- Modify: `web/src/stores/useApp.ts` (add `'em'` screen + `goEm()`)
- Modify: `web/src/App.vue` (nav button + page mount)

**Interfaces:**
- Consumes: `PrinterProfileCard.vue`, `usePrinterProfiles`, `generateEmGcodeWithReport`, `defaultEmTestSpec`, `emCouponGeometry`, `volumetricFlowMm3S`, `accelRampMm`, `fitsA4` (from `../engine/gcode/emitter`), `NumericField.vue`, `HIGH_FLOW_WARNING_THRESHOLD_MM3_S`.
- Produces: `useApp` screen union gains `'em'`; `goEm(): void`.

- [ ] **Step 1: Extend `useApp.ts`**

```ts
export type Screen = 'scan' | 'calibration' | 'pa' | 'profile' | 'em'
// ...
function goEm(): void {
  screen.value = 'em'
}
// add goEm to the returned object
```

Note: `ProfilePage` returns to the PA page after editing today; check its back-navigation and, if it hardcodes `goPa()`, leave that behavior for now (profile editing from the Flow page returns to PA; acceptable for beta, noted in the PR).

- [ ] **Step 2: Create `EmPage.vue`**

Structure mirrors `PaPage.vue` minus the scan/analysis cards. Script core:

```ts
import { computed, ref } from 'vue'
import { usePrinterProfiles } from '../stores/usePrinterProfiles'
import { generateEmGcodeWithReport, HIGH_FLOW_WARNING_THRESHOLD_MM3_S } from '../engine/em/gcodeGenerator'
import {
  accelRampMm,
  defaultEmTestSpec,
  emCouponGeometry,
  volumetricFlowMm3S,
  type EmTestSpec,
} from '../engine/em/types'
import { fitsA4 } from '../engine/gcode/emitter'
import { defaultPrinterProfile } from '../engine/pa/types'
import PrinterProfileCard from './PrinterProfileCard.vue'
import NumericField from './NumericField.vue'

const store = usePrinterProfiles()

// Spec defaults follow the selected printer; edited fields override them.
const specDefaults = computed(() => defaultEmTestSpec(store.selected ?? defaultPrinterProfile()))
const pitchMin = ref<number | null>(null)
const pitchMax = ref<number | null>(null)
const blockCount = ref<number | null>(null)
const linesPerBlock = ref<number | null>(null)
const printSpeed = ref<number | null>(null)

const spec = computed<EmTestSpec>(() => ({
  ...specDefaults.value,
  pitchMinMm: pitchMin.value ?? specDefaults.value.pitchMinMm,
  pitchMaxMm: pitchMax.value ?? specDefaults.value.pitchMaxMm,
  blockCount: blockCount.value ?? specDefaults.value.blockCount,
  linesPerBlock: linesPerBlock.value ?? specDefaults.value.linesPerBlock,
  printSpeedMmS: printSpeed.value ?? specDefaults.value.printSpeedMmS,
}))

const geometry = computed(() => emCouponGeometry(spec.value))
const footprintText = computed(
  () => `coupon ${Math.round(geometry.value.couponWidthMm)} x ${Math.round(geometry.value.couponHeightMm)} mm`,
)
const exceedsA4 = computed(() => !fitsA4(geometry.value.couponWidthMm, geometry.value.couponHeightMm))
const layerHeight = computed(() => (store.selected ?? defaultPrinterProfile()).layerHeightMm)
const flowText = computed(() => `${volumetricFlowMm3S(spec.value, layerHeight.value).toFixed(1)} mm^3/s`)
const highFlow = computed(
  () => volumetricFlowMm3S(spec.value, layerHeight.value) > HIGH_FLOW_WARNING_THRESHOLD_MM3_S,
)
const rampWarning = computed(() => {
  const p = store.selected
  if (!p) return false
  return 2 * accelRampMm(spec.value.printSpeedMmS, p.printAccelMmS2) > spec.value.lineLengthMm / 2
})

const generateError = ref('')
const unknownVariables = ref<string[]>([])
const templateWarnings = ref<string[]>([])
const canGenerate = computed(() => store.selected !== null && store.selectedFilament !== null)

function sanitizeName(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '') || 'printer'
}
const filename = computed(() =>
  store.selected ? `em_flow_test_${sanitizeName(store.selected.name)}.gcode` : '',
)

function generate(): void {
  const profile = store.selected
  const filament = store.selectedFilament
  if (!profile || !filament) return
  generateError.value = ''
  unknownVariables.value = []
  templateWarnings.value = []
  let gcode: string
  try {
    const report = generateEmGcodeWithReport(profile, filament, spec.value)
    gcode = report.gcode
    unknownVariables.value = report.unknownVariables
    templateWarnings.value = report.warnings
  } catch (e) {
    generateError.value = e instanceof Error ? e.message : String(e)
    console.error('EM G-code generation failed', e)
    return
  }
  const blob = new Blob([gcode], { type: 'text/x-gcode' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename.value
  a.click()
  URL.revokeObjectURL(url)
}
```

Template (follow PaPage's card layout and Vuetify idioms):
- `<PrinterProfileCard />`
- A test settings card: `NumericField`s for pitch min/max (mm, step 0.01), block count, lines per block, print speed (mm/s); a live info row showing `footprintText`, `flowText`; alerts: `exceedsA4` (same wording pattern as PA's paper warning), `highFlow` ("intended for high-flow hotends"), `rampWarning`.
- A generate card: download button (`:disabled="!canGenerate"`, `data-testid="em-generate"`), `generateError` alert, `unknownVariables` and `templateWarnings` lists (copy PA's rendering).
- A short how-it-works note: single color, no filament change; scan the printed part TOP FACE DOWN; the result is only valid near the printed speed; filament diameter variation limits repeatability to about 1%.

- [ ] **Step 3: Wire navigation in `App.vue`**

```html
<v-btn variant="text" size="small" :active="app.screen === 'em'" data-testid="nav-em" @click="app.goEm()">
  Flow
  <v-chip size="x-small" color="primary" variant="tonal" class="ml-1">Beta</v-chip>
</v-btn>
```
Add `import EmPage from './components/EmPage.vue'` and `<EmPage v-else-if="app.screen === 'em'" />` before the fallback.

- [ ] **Step 4: Verify**

Run: `cd web && npx vue-tsc --noEmit && npm test && npm run e2e`
Expected: green. Manually sanity-check nothing else regressed by the `useApp` union change (typecheck covers it).

- [ ] **Step 5: Commit**

```bash
git add web/src/components/EmPage.vue web/src/stores/useApp.ts web/src/App.vue
git commit -m "Add the flow calibration page with coupon G-code download"
```

---

### Task 6: Stage verification and handoff

**Files:** none (verification only)

- [ ] **Step 1: Full gate**

Run: `cd web && npm run build && npm test && npm run e2e`
Expected: all green.

- [ ] **Step 2: Generate a sample G-code for the owner**

Start the dev server or use a quick Node/Vitest scratch script to produce `em_flow_test_*.gcode` with the default profile; eyeball the first/last 50 lines (header, heats, M83/G90, skirt, 4 Z levels, end G-code, no PAUSE/M221).

- [ ] **Step 3: STOP**

Report to the owner: feature ready for a real-world print. Owner prints the coupon and scans it. The vision pipeline (emAnalyzer, emRender.ts, correction formatter, results UI) is a separate plan, gated on that print.

---

## Self-review notes

- Spec coverage: shared emitter (Task 1), types/geometry incl. speed field + warnings helpers (Task 2), generator incl. skirt/frame/rail/pedestal-measured layers, error contract and warnings (Task 3), profile-management reuse via extracted card (Task 4), UI incl. live flow readout, paper warning, honest-limits note, nav (Task 5), gate + stop (Task 6). Deferred per spec: vision, correction formatter, stepped-flow coupon.
- Byte-identical PA output is enforced by not touching PA tests and only re-plumbing the width parameter.
- Type names cross-checked: `EmTestSpec`, `EmBlock`, `EmCouponGeometry`, `Box`, `Emitter` used consistently across tasks.
