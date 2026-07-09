# EM Coupon Placement + Contrasting Base Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let the user place the EM coupon at the bed's front or back edge (easier on-plate scanning) and optionally print a contrasting-color base under it (filament swap), without touching the measurement math.

**Architecture:** Two new `EmTestSpec` fields consumed by the generator; the base reuses the PA coupon's solid-base + pause machinery via the shared emitter; `emRender` gains a base option so the rule-1 recovery gate covers the two-color case; UI adds a dropdown + checkbox on the Flow page.

**Tech Stack:** unchanged (TypeScript, shared gcode emitter, Vitest, Vue/Vuetify).

## Global Constraints

- Branch `feature/extrusion-multiplier`, standing commit grant, NO push. Single-sentence commits, no em-dash anywhere, no rule-number citations, optional `Co-Authored-By: Claude <noreply@anthropic.com>` trailer only.
- Rule 1: the emAnalyzer recovery tolerances (0.005/0.008 mm) are untouchable; the new two-color render case must pass them.
- The project skill `reviewing-gcode-printability` (.claude/skills/reviewing-gcode-printability/SKILL.md) binds Task 2: walk the checklist for the new base region and say which rows were touched in the report.
- Measurement modules (fiducialAligner, gapMeasurer, emAnalyzer) must not change. If a render-based test fails, the fix goes into geometry/renderer only after diagnosis, never into loosened tolerances.
- Defaults preserve current behavior exactly: placement 'center', contrastBase false; the existing sample G-code output for defaults must stay byte-identical (assert by regenerating before/after and diffing).

---

### Task 1: Spec fields + placement in the generator

**Files:**
- Modify: `web/src/engine/em/types.ts` (EmTestSpec + defaults)
- Modify: `web/src/engine/em/gcodeGenerator.ts`
- Test: `web/tests/engine/em/types.spec.ts`, `web/tests/engine/em/gcodeGenerator.spec.ts`

**Interfaces:**
- `EmTestSpec` gains `placement: 'center' | 'front' | 'back'` and `contrastBase: boolean`; `defaultEmTestSpec` sets `'center'` / `false`.
- Generator: `const EDGE_MARGIN_MM = 10`; oy = center formula for 'center', `EDGE_MARGIN_MM` for 'front', `bedDepthMm - couponHeightMm - EDGE_MARGIN_MM` for 'back'; ox always centered. Bed-fit throw covers the placement (negative oy still throws).
- Task 1 ignores `contrastBase` (Task 2 consumes it), but the field exists so specs stay stable.

- [ ] TDD: failing tests (defaults include the two fields; front/back placement puts the first layer's Y coordinates in the expected band: parse min/max Y of extrusion moves and assert against EDGE_MARGIN_MM; center unchanged; byte-identical default output vs current HEAD via a regenerated string compare in the test using a spec with explicit 'center'/false).
- [ ] Implement, all tests green (`npx vue-tsc --noEmit && npx vitest run`), commit.

---

### Task 2: Contrasting base in generator + renderer + recovery gate

**Files:**
- Modify: `web/src/engine/em/gcodeGenerator.ts`
- Modify: `web/tests/helpers/emRender.ts`
- Test: `web/tests/engine/em/gcodeGenerator.spec.ts`, `web/tests/engine/em/emAnalyzer.spec.ts`

**Generator (mirror the PA base path via the shared emitter):**
- When `spec.contrastBase`: before everything else, print `BASE_LAYERS = 2` solid base layers over the full coupon rectangle: `basePerimeters` (outline + the 3 fiducial holes; the window is NOT a hole: the base is the contrast backing) then `rasterBase` (inset behind perimeters, holes expanded, alternating 45/135): exactly the PA base pattern.
- Then retract, `pauseGcode` lines, the PA-style "if your pause macro already retracts" comment, unretract (copy PA's sequence).
- Then the existing frame/rail/comb layers with every Z shifted up by `BASE_LAYERS * layerHeightMm`.
- Printability checklist rows to address in the report: base perimeters/raster inset, fiducial holes kept open through the base, travels (solid base = PA-proven), first-layer adhesion (full-width beads), no change to comb geometry.

**Renderer:**
- `EmRenderOptions` gains `baseGray?: number` (undefined = no base, current behavior). With a base: the window interior backing (separators, gaps, margins) renders `baseGray` instead of `backgroundGray`; fiducial holes stay `backgroundGray` (through-holes); everything else unchanged.

**Recovery gate additions (emAnalyzer.spec.ts):**
- Two-color case: trueWidth 0.42, `baseGray: 150`, plasticGray 40, backgroundGray 245: |wMm - 0.42| <= 0.008.
- Low-contrast direction flipped: baseGray 200, plasticGray 240 (light plastic on lighter base), backgroundGray 20: within 0.008 OR a clean failure with failureReason (never a wrong number: if it fails to measure, that is acceptable; assert success implies accuracy).

- [ ] TDD order: renderer option + failing recovery tests first, then generator tests (pause present only when contrastBase, Z values shifted, base layer count, fiducial holes open in base: no extrusion segment crosses the hole boxes on base layers), then implementations. Full suite + build green, commit (may be two commits: renderer+gate, generator).

---

### Task 3: UI + final gate

**Files:**
- Modify: `web/src/components/EmPage.vue`
- Test: existing e2e must stay green; extend `web/e2e/em.spec.ts` ONLY if trivial (no new fixtures)

- Placement v-select (Center / Front edge / Back edge, `data-testid="em-placement"`) and checkbox "Contrasting base (adds a filament swap pause)" (`data-testid="em-contrast-base"`) in the test settings card, feeding the spec computed. When the checkbox is on, show a short note: base prints first in color A, swap at the pause, coupon prints in color B; any two colors that differ in brightness work; scanning stays top face down.
- The spec fields flow through the existing spec computed + analyzedSpec snapshot untouched.
- [ ] Implement, verify in the browser preview (both controls render, checkbox note appears), `npm run build && npx vitest run && npm run e2e` green, commit. Update the design spec doc (placement + base section, one short paragraph) and the ledger.

## Self-review notes
- Byte-identical default guard (Task 1) protects the validated physical design.
- Rule-1 chain extended, not bypassed: the two-color case runs through the same analyzer gate.
- Measurement modules untouched by design; aligner robustness for the base case is proven via the recovery tests (dual-polarity Otsu buckets the mid-gray base with either side and both work).
