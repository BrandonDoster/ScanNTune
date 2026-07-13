# Mutation testing with Stryker

StrykerJS (`@stryker-mutator/core` + `@stryker-mutator/vitest-runner`) plants small bugs
(mutants: flipped operators, deleted statements, changed constants) in the engine source and
reruns the covering tests; a mutant that survives on covered core code names a weak test
directly. The HTML report lands at `web/reports/mutation/mutation.html` (gitignored).

## The three ways to run it

- **Local, changed files (the default): `npm run mutation`** from `web/`. A script
  (`web/scripts/mutation-changed.mjs`) computes the engine source files changed relative to
  master (branch commits plus staged, unstaged, and untracked work), filters them to the mutate
  scope, and runs Stryker on exactly those. With nothing in-scope changed it exits 0 with a
  message. `incremental: true` keeps repeat runs cheap by reusing prior results.
- **Local, one module (when reviewing a specific suite's strength):**
  `npx stryker run --mutate src/engine/<module>.ts`.
- **Full scope: CI only.** `npm run mutation:full` mutates the whole core scope and is run by
  the manual `Mutation Testing` workflow (`.github/workflows/mutation.yml`, `workflow_dispatch`
  trigger, report uploaded as an artifact). Never run `mutation:full` on a dev machine; a full
  run is hours-scale and belongs on CI.

## How it is wired

- **`web/stryker.config.mjs`**: the Stryker config. `coverageAnalysis: 'perTest'` so each mutant
  only reruns the tests that cover it; `incremental: true`; `thresholds.break` is null so the
  run reports scores but never fails the command (a diagnostic, not a gate).
- **`web/vitest.stryker.config.ts`**: a trimmed Vitest config used only for mutation runs. It
  includes `tests/engine/**` and `tests/stores/**`, including the OpenCV.js-backed
  synthetic-fixture specs: the wasm module boots once per test runner process and amortizes
  across mutants, so CV-stage mutation is practical (a single-module run over `em/gapMeasurer`
  measures in single-digit minutes). Excluded are only the specs needing untracked real-scan
  fixtures, which are absent locally and on CI and would fail Stryker's initial dry run:
  `backgroundPolarity`, `cardEdgeMeasurer`, `cardGoldenScale`, `em/realScan`, `pa/realScan`.
- **`web/scripts/mutation-changed.mjs`**: the changed-files driver behind `npm run mutation`.
  It mirrors the mutate exclusions of `stryker.config.mjs`; keep the two lists in step.

## Scope and exclusions

`mutate` covers `src/engine/**/*.ts` minus, with reasons:

- `opencv.ts`, `imageData.ts`: loader and IO glue around OpenCV.js, nothing measurement-shaped.
- `types.ts`, `**/types.ts`, `is/resultTypes.ts`: type-only modules.
- `overlayRenderer.ts`, `**/*OverlayRenderer.ts`: display-only output, not a measurement path.
- `cardEdgeMeasurer.ts`: its spec mixes synthetic and real-scan cases in one file, so the whole
  spec sits in the real-scan exclusion above and mutants in the module would only report "no
  coverage". If that spec is ever split into a synthetic file and a real-scan file, move the
  synthetic half into the mutation suite and drop this exclusion.

Everything else in the engine, including the OpenCV.js measurement stages (ring detection,
aligners, gap/line measurers, analyzers), is mutated.

## Reading the results

Read the survivors, not just the score: each surviving mutant is a concrete bug the suite would
miss. Kill it by strengthening an assertion (per the no-math rule: with an independent literal),
or accept it with a reason (an equivalent mutant, or a numeric-tolerance boundary the method's
noise floor genuinely cannot distinguish). Run a targeted pass on the touched module whenever a
review doubts a test's strength.
