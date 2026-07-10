---
name: writing-golden-webtests
description: Use when adding or changing a Playwright end-to-end test in web/e2e/*.spec.ts for a calibration flow (XY/XZ/YZ, pressure advance, extrusion multiplier, or any future flow), or when a measurement-engine change needs a test that would actually catch it, before committing the change.
---

# Writing golden webtests

## The two-phase process (mandatory)

A golden webtest is created in two separate phases by two separate roles, never by one agent in
one pass. This separation exists because the failure mode of end-to-end tests is the implementer
inventing expectations from the code under test, which reduces the test to a snapshot of today's
bugs.

**Phase 1: test design.** A QA test designer writes a flow specification BEFORE any test code
exists: the exact user journey step by step (page opens, which control is clicked, what state is
checked after every step), every assertion with its expected value, and the provenance of every
golden number (which caliper measurement, which reference dimension, which design parameter).
The spec covers the full happy path from app entry to every displayed output field, plus the
rejection paths of principle 6. The spec is a repo file at `web/e2e/flows/<name>.md`, committed
alongside the test, so it is reviewable and survives as the test's contract. The designer reads
the app UI to name real controls and testids but takes NO expected values from the code.

**Phase 2: test implementation.** A QA automation engineer turns the spec into a Playwright test
mechanically. The engineer may not add, drop, weaken, or reinterpret any assertion in the spec;
where the spec and the app disagree, the engineer reports back instead of adapting the test. If
a needed testid does not exist, the engineer adds the testid to the UI, not a workaround selector.

Changing an existing golden test starts over at phase 1: amend the flow spec first (with owner
sign-off for golden-value changes per principle 7), then re-derive the code from it.

Both phases are dispatched to current-generation Sonnet-class agents: the design phase is
procedural specification and the implementation phase is mechanical translation, neither needs a
larger model. Escalate a phase to a larger model only when a Sonnet attempt has concretely failed.

## The golden sample library

Externally verified scan sets live in `web/e2e/golden/<set-name>/`, one directory per physical
sample set, shared across all flows and tests. Prefer scanning the physical sample natively at a
repo-friendly resolution (300 dpi) over downsampling a high-resolution scan: a native scan has no
resampling artifacts and is exactly what a real user's scanner produces. When the flow includes
scanner calibration, the set must include a card scan made at the same DPI in the same session. Each set contains the downsampled scan images
(lowercase names) and a `PROVENANCE.md` recording: printer and date, print conditions (filament,
any deliberately injected correction profile with its exact command), the external measurements
(instrument, raw readings), the derived golden values with their tolerances, and the downsample
re-verification result. Flow specs and tests reference a set by its directory name and take
golden values ONLY from its `PROVENANCE.md`. New real-world sample sets go here, not loose in
`web/e2e/fixtures/` (which keeps synthetic renders and non-golden fixtures).

## Why this exists

A sign-inversion bug in the measurement engine shipped past `npm test` because the synthetic
fixture that "validated" it was generated from the same wrong equations: the unit test and the
code under test shared one bug, so they agreed with each other. The bug also only showed up on
real, non-cardinal scans; at perfect 0 degree and 90 degree placement it happened to cancel out.
A golden webtest is the only kind of test structurally able to catch that class of bug: it drives
the real app with a real scan and compares the number on screen to a number that came from
outside the code entirely.

## Principles

1. **Drive the full user journey, never shortcut it.** Start at the app's entry page. Pick the
   calibration flow the way a user would, upload files through the real `<input type=file>` via
   `setInputFiles`, wait for the worker to finish analyzing each scan, click Analyze, then read
   the answer off the results DOM. Never import a store, call an engine function directly, or
   seed state through anything other than the UI. If the journey can't be driven this way, the
   UI is missing a testid, not an excuse to shortcut.

2. **Real fixtures over synthetic, and prefer imperfect placement.** A real flatbed scan of a
   real print is the only fixture that can carry a bug the code doesn't already know it has.
   Prefer scans placed at an ordinary, non-cardinal angle over a scan squared up to 0 or 90
   degrees: cardinal placement can hide sign and axis-swap bugs that cancel out at right angles.
   Synthetic renders (`*Render.ts` helpers) are a useful complement for covering geometry variants
   cheaply, never a replacement for at least one real-scan golden test per flow.

3. **Golden values come from outside the code under test.** Hardcode the expected number from an
   independent source: a caliper/micrometer measurement of the printed part, a known reference
   dimension (e.g. an ISO/IEC 7810 card's official size), or a value computed by hand from the
   coupon's design parameters. Never take the golden value from a previous run of this code
   (`console.log` it once and paste it in): that only pins today's behavior and would have made
   the sign-inversion bug look "correct" forever. A second, explicitly labeled snapshot tier
   (asserting against a captured prior-run value) is acceptable to catch incidental regressions,
   but it must be commented `// snapshot, not external truth` so nobody mistakes it for
   verification.

4. **Assert sign and magnitude, with an honest tolerance.** State the expected sign explicitly
   (`expect(skew).toBeLessThan(0)`, not just `Math.abs`). Size the tolerance wide enough to absorb
   real measurement noise (scan resolution, hand-measurement error) but tight enough that a sign
   flip, a missing unit conversion, or a factor-of-2 error still fails. A tolerance so loose it
   would pass with the wrong sign is worse than no test. Comment where every golden number came
   from: instrument, hand measurement, or coupon design math, with enough detail (which caliper
   reading, which STL parameter) that someone can re-derive it later.

5. **Read what the user reads.** Assert on the same `data-testid` text the user sees on the
   results page (e.g. `scale-x`, `skew-xy`, `em-width`, `pa-value`), parsed with `innerText()`,
   not on engine return values or intermediate objects. If the UI rounds or formats a number,
   assert against what's actually displayed; a hidden precision bug that never reaches the screen
   isn't this test's job.

6. **Cover the failure paths users actually hit, not just the happy path.** At least one test per
   flow should upload a scan set the app must reject: two scans of the same angle, a mirror-flipped
   pair, a missing fiducial, or an unreadable image. Assert the specific testid the UI uses for the
   actionable message (e.g. `em-failure`, `plane-status-*`), not just that *something* failed.

7. **A backend change never authorizes changing a golden expectation.** When only the UI changed,
   selectors and testids may be updated freely as long as the numeric expectations stay untouched.
   When the measurement engine changed, the golden values and tolerances are the judge of that
   change and must not be edited alongside it: if the test fails, the presumption is that the
   engine is wrong. An existing golden value or tolerance may change only after the new value is
   re-verified against the test's external truth source (the hand measurement, reference
   dimension, or design math named in its provenance comment) and the owner has explicitly signed
   off, and the provenance comment must record both. Adding assertions for genuinely new outputs
   is always allowed; this rule gates changing or deleting existing ones. If a claimed small
   improvement forces a golden to move, treat that as a signal that either the tolerance was
   dishonest or the change is larger than claimed.

## Practical Playwright guidance for this repo

- **Fixtures live in `web/e2e/fixtures/`.** Real scans and synthetic renders sit side by side;
  name real ones descriptively (`em_real_scan.png`, `pa_real_scan.png`) so their provenance is
  obvious from the filename. If a real scan is large (35 MP+), it may be downsampled to keep the
  repo light, but only after re-measuring the golden values against the downsampled image: scale
  changes with resolution, and a golden value computed on the original will silently drift if
  re-used against a resized fixture without re-verification.
- **Upload and wait pattern**, mirrored from `web/e2e/em.spec.ts`:
  ```ts
  await page.getByTestId('em-scan-input').setInputFiles(fixturePath)
  await expect(page.getByTestId('em-width')).toBeVisible({ timeout: 120000 })
  await expect(page.getByTestId('em-scan-error')).toHaveCount(0)
  await expect(page.getByTestId('em-failure')).toHaveCount(0)
  const width = parseFloat(await page.getByTestId('em-width').innerText())
  ```
  A 120 second visibility timeout is standard here because a 35 MP scan takes real time to
  analyze in the Web Worker; do not shrink it to make a test file "look tidy".
- **Two-scan flows** (XY/XZ/YZ) upload both scans via `scans-input`, wait for each `scan-island`
  to show a `ring-count`, then wait for `plane-status-{plane}` before clicking `analyze-btn`.
- **Existing testid inventory** (`web/src/components/ScanPage.vue` and the results pages):
  `calibrate-btn`, `scans-input`, `scan-island`, `ring-count`, `plane-group-{plane}`,
  `plane-status-{plane}`, `analyze-btn`, `status`, `startover-btn`, `scale-{axis}`,
  `skew-{plane}`, `skew-code`, `size-code`, `zero-note-*`; the PA and EM flows follow the same
  `{flow}-{field}` convention (`em-width`, `em-failure`, `pa-value`). Add a new testid rather than
  matching on visible text or CSS classes, which drift.
- **Config**: `web/playwright.config.ts` sets a 120 second per-test timeout and a 240 second
  webServer startup against the production build (`npm run build && npm run preview`), so a golden
  test runs against the real bundle, not the dev server.
- **Run with `npm run e2e`** from `web/`. A new golden test must pass locally before it is
  considered part of the verification bar.
