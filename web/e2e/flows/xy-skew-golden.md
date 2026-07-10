# Flow spec: XY skew/scale calibration, golden

Phase: 1 (test design). No expected values in this document were taken from source code; every
golden number is copied from `web/e2e/golden/xy-skew-0p5/PROVENANCE.md`. Phase 2 must re-verify
each set against the app before hardcoding it into a test (skill re-verification requirement) and
must not add, drop, weaken, or reinterpret any assertion listed here; if the app disagrees with a
step, stop and report instead of adapting the test.

## Amendment (owner-approved 2026-07-10)

This spec was amended after the original phase 1 pass, per the skill's "changing an existing golden
test starts over at phase 1" rule. Changes, all owner-approved 2026-07-10:

- **150 dpi absolute-scale bands widened** to caliper tolerance +/-0.06 percentage points: X in
  `[-0.01, +0.11]`, Y in `[+0.02, +0.14]`. Justification: an 8-scan repeatability study of the same
  scanner (2026-07-10) found the transport axis wanders +/-0.05 percent run to run, and the 150 dpi
  golden session caught one such jitter excursion; two independent edge estimators on that session's
  card scan agreed the card localization itself is unbiased, so the wander is scanner noise, not a
  measurement bug. 300 dpi bands are unchanged (strict, per the original external truth). Skew and
  anisotropy stay strict at both DPIs; only the absolute-scale bands widen, and only at 150 dpi.
- **Snapshot tier added** (skill principle 3): every value-asserted figure below now also carries a
  tight, explicitly-labeled snapshot assertion pinning today's measured output on the exact golden
  fixture files, in addition to the external-truth band. Snapshot changes need justification (why
  the deterministic engine output moved) but not caliper re-verification; changes to the external
  golden bands above still require caliper re-verification and owner sign-off per skill principle 7.
- **New assertions** for rotation angle, flip, `SET_SKEW` digit verification, and the Fix size tab,
  closing gaps the original spec left as "phase 2 may add a testid" without specifying the check.
- **Rotation assertion replaced (owner-approved 2026-07-11)**: the per-scan rotation check no
  longer asserts filename-derived absolute angles of 0 and 90 degrees (wrong: the displayed
  rotation is the plate's arbitrary placement angle on the scanner glass). It now asserts only
  snapshot literals per dpi (see step 5); the physical quarter-turn relation between the two
  scans (the owner turned the plate between scans) is implied by the literals themselves and
  recorded in the provenance block, not computed in the test.
- **Literals only (skill principle 5, owner-approved 2026-07-11)**: every expectation in this spec
  is a hardcoded literal with a tolerance, or an exact string. The webtest performs no formulas,
  no unit conversions, and no helpers mirroring engine logic; relations between figures (skew-code
  digits vs displayed skew, size-code vs displayed scales, effective dpi vs px/mm) are pinned in
  engine unit tests instead. Snapshot literals marked "to be captured by phase 2" are read off the
  deterministic app run against these exact fixtures and recorded back into this spec by phase 2:
  this is the one sanctioned flow of numbers from app to spec, snapshot tier only, always labeled
  "snapshot, not external truth".
- **Rejection scenario corrected** to match real `ScanIsland.vue` behaviour: the duplicate scan's
  pill reads "Nearly same angle", not "XY plane" as originally written, and island order in a plane
  group is not guaranteed, so the rejection scenario now asserts by pill text across islands rather
  than by index.

Golden sample set: `web/e2e/golden/xy-skew-0p5/`. Fixtures per DPI, relative to that directory:
`150dpi/{card_150dpi.png,xy_0d.png,xy_90d.png}` and `300dpi/{card_300dpi.png,xy_0d.png,xy_90d.png}`.

External truth (PROVENANCE.md "External measurements" and "Golden values and tolerances"):
- XY skew: +0.52 degrees, tolerance 0.06 degrees, at BOTH dpis. Sign MUST be positive.
- X scale error: +0.05 percent; Y scale error: +0.08 percent, at BOTH dpis, but the tolerance
  around those centres differs by dpi per the amendment above:
  - 300 dpi (strict, unchanged): X tolerance 0.04 percentage points, i.e. `[+0.01, +0.09]`; Y
    tolerance 0.04 percentage points, i.e. `[+0.04, +0.12]`.
  - 150 dpi (widened, owner-approved 2026-07-10): X band `[-0.01, +0.11]`; Y band
    `[+0.02, +0.14]`. Justification: 8-scan scanner repeatability study (2026-07-10) documenting
    +/-0.05 percent run-to-run transport-axis wander; the 150 dpi session caught a jitter excursion
    within that documented noise; two independent edge estimators agree the card localization
    itself is unbiased. See "Amendment" above.

These came from caliper measurements of a community calibration print made in the same session, on
the same machine, with the same deliberately-injected `SET_SKEW` profile, entered into an
independent calculator; they are external to this codebase. ScanNTune's own prior reading
(+0.504 degrees, X +0.059 percent, Y +0.077 percent) is NOT a golden value and must not be used as
one: it is mentioned in PROVENANCE.md only as a cross-validation note.

## Snapshot tier (owner-approved 2026-07-10, skill principle 3)

In addition to the external-truth bands above, each scenario also asserts a second, tight snapshot
band pinning the deterministic engine's current output on the exact golden fixture files. These
values are NOT external truth: they are `// snapshot, not external truth` regression pins captured
from re-verification runs against this golden set, and changing them needs justification (why the
engine's output moved) but not caliper re-verification. Tolerance +/-0.005 percentage points for
`scale-X`/`scale-Y`, +/-0.01 degrees for `skew-XY`, +/-0.002 px/mm for `pxpermm`.

- 150 dpi: `scale-X` +0.017 (band `[+0.012, +0.022]`), `scale-Y` +0.028 (band `[+0.023, +0.033]`),
  `skew-XY` +0.507 (band `[+0.497, +0.517]`), card px/mm 5.90559 (band `[5.90359, 5.90759]`),
  effective dpi 150.
- 300 dpi: `scale-X` +0.051 (band `[+0.046, +0.056]`), `scale-Y` +0.071 (band `[+0.066, +0.076]`),
  `skew-XY` +0.505 (band `[+0.495, +0.515]`), card px/mm 11.80670 (band `[11.80470, 11.80870]`),
  effective dpi 300.

Each scenario is self-contained (its own scanner calibration, its own two plate scans) because the
card-derived px/mm is required to convert the plate's pixel measurements into absolute percent
scale error; skew is dimensionless and does not need it, but the flow always calibrates first, the
way a real user would.

## Scenario A: 150 dpi, full walkthrough

1. Navigate to `/`.
   -> expected: heading "Skew/shrinkage calibration" visible.
2. Click `calibrate-btn`, fill "Measured long side (mm)" with `85.60`, fill "Scan resolution (dpi)"
   with `150`, upload `150dpi/card_150dpi.png` via `card-input`.
   -> expected: `calibration-result` visible within 120000 ms; `saved` visible (per
      `card-calibration-golden.md` scenario A, steps 3-9; this flow does not re-derive those
      numbers, it only needs the calibration to have succeeded before moving on).
3. Click `back-btn` to return to the scan page.
   -> expected: step 1 "Calibrate scanner" shows the calibrated status (success icon, "150 dpi"
      text per `calibrationLine`), confirming the calibration is active for this session before any
      plate scan is uploaded.
4. Upload `150dpi/xy_0d.png` and `150dpi/xy_90d.png` together via `scans-input`
   (`setInputFiles([...])`, both at once, mirroring the real user action of dropping both scans
   in together).
   -> expected: two elements with `data-testid="scan-island"` appear (`islands` container becomes
      visible).
5. Wait for each scan to finish measuring.
   -> expected: both `ring-count` elements show `23 of 23` within 120000 ms each (the plate is the
      5x5-ring, 100 mm baseline design, same ring tally as `analysis.spec.ts`'s diagonal-marked
      real-scan test; if a different count shows, the scans are not fully read and phase 2 should
      report rather than loosen this to "some rings").
   -> expected: each scan island shows "XY plane" text (per `analysis.spec.ts`'s real-scan test
      pattern), since these scans carry the plane-ID marker.
   -> expected (snapshot, not external truth, amended 2026-07-11; replaces the earlier
      filename-derived 0/90 assertion, which was wrong: the displayed rotation is the plate's
      arbitrary placement angle on the scanner glass, not a filename-implied value): read both
      islands' `scan-angle` testids (see "Missing testids") and assert the displayed angles are the
      literals 89.6 and 180.0 degrees at 150 dpi, each within 0.5 degrees; match by value across
      the two islands, not by index, since island order is not guaranteed. These are hardcoded
      current app readings; changing them needs justification but not caliper re-verification. No
      angular arithmetic in the test: the physical quarter-turn relation between the two scans is
      implied by the literals themselves (see the provenance block).
   -> expected (amended): each scan island's `Flip` row (add a `scan-flip` testid, see "Missing
      testids") reads exactly `None` on both scans. Both golden scans were printed and scanned per
      the app's "print it exactly as downloaded, do not rotate or mirror it" instruction, so no
      mirror-flip is expected; a scan reading `Mirrored` here means the wrong fixture is loaded or a
      flip-detection regression, and must be reported rather than accepted.
6. Observe the XY plane group.
   -> expected: `plane-group-XY` visible, containing both scans; `plane-status-XY` shows "Ready to
      analyze." (the `ready` branch: at least 2 scans, spread over `MIN_TURN_SPREAD_DEGREES`, no
      flip mismatch). A roughly-quarter-turn separation between the two scans should satisfy the
      spread check; if `plane-status-XY` instead reads the "too close together" message, the golden
      scans do not have enough angular spread and phase 2 must report this rather than swap in a
      different fixture pair.
7. Click `analyze-btn` (must be enabled per step 6's "ready" status).
   -> expected: page scrolls to the "Results" section (`resultsSection`); `hasResults` becomes true.
8. Read `scale-X` (`innerText`, parse the leading signed percent number out of the formatted
   `signedPercent` text).
   -> expected (external truth, amended tolerance): value is `+0.05` percent, at 150 dpi in the
      closed interval `[-0.01, +0.11]` percent (widened band, see "Amendment"). Sign must be
      positive (assert `> 0`, not just `Math.abs`).
   -> expected (snapshot, not external truth, amended): value in `[+0.012, +0.022]` percent
      (centre +0.017), tolerance +/-0.005. This is a regression pin on today's measured output for
      this exact fixture, separate from and tighter than the external-truth band above.
9. Read `scale-Y`.
   -> expected (external truth, amended tolerance): value is `+0.08` percent, at 150 dpi in
      `[+0.02, +0.14]` percent (widened band). Sign must be positive.
   -> expected (snapshot, not external truth, amended): value in `[+0.023, +0.033]` percent
      (centre +0.028), tolerance +/-0.005.
10. Read `skew-XY`.
    -> expected (external truth, unchanged): value is `+0.52` degrees, tolerance `±0.06`, i.e. in
       `[+0.46, +0.58]` degrees. Sign must be explicitly positive
       (`expect(skew).toBeGreaterThan(0)`), not merely `Math.abs(skew)` close to 0.52: a sign-flip
       bug must fail this assertion.
    -> expected (snapshot, not external truth, amended): value in `[+0.497, +0.517]` degrees
       (centre +0.507), tolerance +/-0.01.
11. Read the `skew-code` code block (the "Fix skew" tab, active by default per `activeFixTab`
    default `'skew'`).
    -> expected: the code block's text contains a `SET_SKEW` command (Klipper is the default
       firmware, `skewFlavours[0]`) followed by exactly three comma-separated numeric values (the
       XY, XZ, YZ diagonal factors format used by `SET_SKEW XY=...`). Only the XY plane was
       measured in this scenario, so the other two factors are expected to be the coupon's
       unmeasured/neutral defaults; phase 2 should assert the three-number shape and that the
       command name is present, not the exact numeric value of the un-measured factors (those are
       not golden values from PROVENANCE.md).
    -> expected (snapshot, not external truth, amended 2026-07-11, literals only): assert the
       `skew-code` block's displayed content contains the literal `SET_SKEW
       XY=99.558,100.444,70.713` (captured by phase 2 from the deterministic app run on the 150 dpi
       fixtures, 2026-07-11; snapshot tier, the sanctioned app-to-spec flow, see "Amendment"). The
       full displayed block is "Paste into the Klipper console:" followed by that `SET_SKEW` line,
       `SKEW_PROFILE SAVE=ScanNTune`, and `SAVE_CONFIG`. The earlier
       Klipper-formula digit verification is REMOVED from the webtest per skill principle 5 ("no
       math in the test"); the relation between the emitted `SET_SKEW` numbers and the displayed
       skew, including the opposite-correction-sign convention, stays covered by the existing
       engine unit test `skewSignConvention.spec.ts`, which is where that formula belongs.
12. Click the "Fix size" tab (`activeFixTab = 'size'`).
    -> expected: `size-code` becomes visible with the default "Shrinkage %" flavour active
       (`sizeFlavours[0]`).
    -> expected (snapshot, not external truth, amended 2026-07-11, literals only): assert the
       `size-code` block's displayed content contains the literal `XY shrinkage: 100.02 %`
       (captured by phase 2 from the deterministic app run on the 150 dpi fixtures, 2026-07-11;
       same capture approach as step 11). No derivation from the displayed `scale-X`/`scale-Y`
       values in the test; the restatement relation between the size code and the measured scales
       is engine-unit-test territory, not webtest arithmetic.
13. Look for the confidence-range hint.
    -> expected: `more-scans-XY` is visible and its text contains "2 more times" (per
       `moreScansHints`'s `missing = MIN_SCANS_FOR_RANGE - scans.length` with 2 scans loaded and
       `MIN_SCANS_FOR_RANGE` requiring 4 for a range, i.e. `missing = 2`, pluralized as "2 more
       times"). Phase 2 must read `MIN_SCANS_FOR_RANGE`'s effect from the displayed text, not
       import the constant from the engine (that would violate "read what the user reads").
       If the displayed count differs from "2 more times", report it rather than adjust the
       anchor text to match.

## Scenario B: 300 dpi, full walkthrough (self-contained, independent of Scenario A)

Same thirteen steps as Scenario A, with:
- step 2: DPI `300`, upload `300dpi/card_300dpi.png`.
- step 3: status line reads "300 dpi".
- step 4: upload `300dpi/xy_0d.png` and `300dpi/xy_90d.png`.
- step 5: same `Flip: None` check as Scenario A, against the 300 dpi scans. Snapshot rotation
  literals (not external truth, amended 2026-07-11): 89.7 and 180.2 degrees, each within 0.5,
  matched by value across islands; no angular arithmetic in the test.
- steps 6-7: identical structure.
- step 8: `scale-X` external-truth band stays strict and UNCHANGED at 300 dpi: `[+0.01, +0.09]`
  percent (no widening, per "Amendment"). Snapshot band (amended): `[+0.046, +0.056]` percent
  (centre +0.051), tolerance +/-0.005.
- step 9: `scale-Y` external-truth band stays strict: `[+0.04, +0.12]` percent. Snapshot band
  (amended): `[+0.066, +0.076]` percent (centre +0.071), tolerance +/-0.005.
- step 10: `skew-XY` external-truth band unchanged: `[+0.46, +0.58]` degrees, sign positive.
  Snapshot band (amended): `[+0.495, +0.515]` degrees (centre +0.505), tolerance +/-0.01.
- step 11: identical structure; the `skew-code` literal is the 300 dpi run's own captured
  `SET_SKEW` line: `SET_SKEW XY=99.56,100.442,70.713` (snapshot, captured by phase 2 2026-07-11,
  distinct from the 150 dpi literal).
- step 12: identical structure; the `size-code` literal is the 300 dpi run's own captured content:
  `XY shrinkage: 100.06 %` (snapshot, captured by phase 2 2026-07-11).
- step 13: `more-scans-XY` containing "2 more times".

## Cross-scenario agreement (amended 2026-07-11: enforced by literals, not computed)

Because both scenarios read scans of the same physical plate under the same injected skew profile,
their readings must agree across dpis: within 0.03 degrees for `skew-XY` and within 0.06
percentage points for `scale-X`/`scale-Y` (the scale bound loosened from an implicit 0.03 per the
2026-07-10 amendment, consistent with the documented 150 dpi scanner wander).

Per skill principle 5 there is NO computed pairwise comparison in the webtest. The agreement bounds
are enforced by the per-dpi snapshot literals themselves: the widest possible separation between
the two scenarios' snapshot bands (`skew-XY` centres 0.507 vs 0.505, +/-0.01 each, at most 0.022
apart; `scale-X` centres 0.017 vs 0.051 and `scale-Y` centres 0.028 vs 0.071, +/-0.005 each, at
most 0.044 and 0.053 apart) already sits inside the agreement bounds, so any pair of readings that
passes both scenarios' snapshot assertions satisfies the agreement requirement by construction.
This arithmetic lives here in the spec, done once at design time; the test only asserts the
literals. If a future snapshot update would push the bands apart by more than the agreement bound,
that is a DPI-dependent bug signal (the class PROVENANCE.md documents) and must be reported to the
owner, not absorbed by updating both snapshots.

## Rejection path: duplicate-angle scan pair

`ScanPage.vue`'s `planeGroups` computed rejects (with a non-blocking but explicit status, not a
generic error) a plane whose scans are all within `ROTATION_DUPLICATE_TOLERANCE_DEGREES` (15
degrees) of each other, via `turnSpreadDegrees(...) < MIN_TURN_SPREAD_DEGREES`. Uploading the SAME
scan file twice produces two scans at the identical measured angle (spread of 0 degrees), which is
the simplest reachable way to trigger this without a second real fixture.

1. Navigate to `/`, calibrate the scanner at 150 dpi exactly as Scenario A steps 2-3 (calibration
   is not required for this rejection path to reproduce, but keeps the flow representative of real
   use; phase 2 may skip calibration here if it slows the test down, since no scale-percent
   assertion is made in this rejection path).
2. Upload `150dpi/xy_0d.png` via `scans-input`, wait for its `scan-island` and `ring-count` to
   settle (`23 of 23`), then upload the SAME file (`150dpi/xy_0d.png` again) via `scans-input` a
   second time.
   -> expected (amended): two `scan-island` elements total; both report `23 of 23`. The real
      `ScanIsland.vue` pill for a scan flagged as a duplicate reads "Nearly same angle" (the
      `problem === 'duplicate'` branch of the pill computed), NOT "XY plane" as the original spec
      assumed; only a non-duplicate-flagged island shows the plane-name pill. Assert by reading each
      island's pill text and checking that at least one island (or, if both get flagged, both) shows
      "Nearly same angle": do not assert a fixed count of "XY plane" pills here.
   -> expected (amended): the island order within `plane-group-XY` is not guaranteed by the app (the
      group renders scans in whatever order `planeGroups` produces, not necessarily upload order), so
      phase 2 must assert by scanning across both islands' pill text, never by a fixed index
      (`islands.first()` / `islands.nth(0)`) assuming a particular scan is first.
3. Observe `plane-group-XY`.
   -> expected: `plane-status-XY` shows the "too close together" message (the exact copy in
      `ScanPage.vue` is a template literal: `` `These two scans are only ${Math.round(spreadDegrees)}
      degrees apart. Turn the plate further, about a quarter turn, and scan it again so the app can
      separate scale from skew.` `` with `spreadDegrees` at or near 0 for an identical duplicate);
      phase 2 should assert on a stable substring such as "Turn the plate further" rather than the
      full interpolated sentence, since the exact degree number is incidental to this fixture.
4. Observe `analyze-btn`.
   -> expected: disabled (`canAnalyze` requires every plane group's `ready` to be true; the
      duplicate-angle XY group is not ready).
5. Observe the caption under the button.
   -> expected: `analyzeReason`'s text (no dedicated testid; it is the `<p class="tip
      text-center">` sibling of `analyze-btn`) includes "XY plate:" followed by the same "too close
      together" message as step 3. If phase 2 needs a stable selector here, add a testid (see
      below) rather than match by CSS class.

## Missing testids phase 2 must add (do not invent workaround selectors instead)

- A testid on the per-scan measured rotation-angle text inside `ScanIsland.vue` (used in step 5's
  rotation assertion and referenced by `analysis.spec.ts`'s existing pattern only via ring-count and
  plane-name text), e.g. `data-testid="scan-angle"`, so tests do not need to parse the group-level
  `pg-angles` summary line to attribute an angle to a specific scan.
- A testid on the per-scan `Flip` row inside `ScanIsland.vue` (currently `testid: undefined` in the
  `rows` computed), e.g. `data-testid="scan-flip"`, for the amended step 5 flip assertion.
- A testid on the `analyzeReason` caption paragraph in `ScanPage.vue` (currently only a `class="tip
  text-center"`), e.g. `data-testid="analyze-reason"`, for the rejection path's step 5.
- The step 1 "Calibrate scanner" status-line testid already listed in
  `card-calibration-golden.md`'s "Missing testids" section (shared need, do not duplicate the
  testid name, reuse it).

## Provenance block

- XY skew +0.52 degrees, tolerance 0.06: PROVENANCE.md, "Golden values and tolerances", first
  bullet.
- X scale +0.05 percent, tolerance 0.04: PROVENANCE.md, same section, second bullet.
- Y scale +0.08 percent, tolerance 0.04: PROVENANCE.md, same section, third bullet.
- Ring tally 23 of 23 for a 5x5-ring, 100 mm baseline plate: this is the coupon's own known
  geometry (grid_n=5 default per CLAUDE.md "Coupon & orientation"), not a measurement; phase 2 may
  treat it as a structural sanity check rather than a calibration golden value, but must still
  assert it (skill "read what the user reads" principle) since a wrong ring count would mean the
  wrong fixture was loaded.
- Fixture paths: PROVENANCE.md, "Files" section (`150dpi/`, `300dpi/` subfolders).
- Re-verification requirement (skill mandatory step): before hardcoding the numeric bands above,
  phase 2 must run both scenarios through the app and confirm the on-screen `scale-X`, `scale-Y`,
  and `skew-XY` values land inside the stated tolerances. PROVENANCE.md's own re-verification note
  applies directly: "If a set reads near +0.03 degrees instead of +0.5, the scans are of the WRONG
  plate (the uncorrected one); stop and ask the owner." Any out-of-tolerance reading must be
  reported to the owner, never patched by widening the tolerance or swapping in a different
  fixture without sign-off.
- Amendment items (widened 150 dpi bands, snapshot values, new assertions, rejection-scenario
  fix): owner sign-off 2026-07-10, recorded in the "Amendment" section at the top of this file.
- Rotation snapshot literals (150 dpi: 89.6 and 180.0; 300 dpi: 89.7 and 180.2, each within 0.5
  degrees): owner sign-off 2026-07-11, recorded in the "Amendment" section and in step 5. The
  physical quarter-turn the owner made between the two scans of each session is implied by these
  literals (each pair is 90.4 or 90.5 degrees apart); the relation is documented here, not
  computed in the test.
- Literals-only conversion (skill principle 5: skew-code and size-code asserted as captured
  literal strings, rotation as literal angles, no formulas or derivations in the webtest; the
  `SET_SKEW`-digits-to-skew relation stays pinned by the engine unit test
  `web/tests/engine/skewSignConvention.spec.ts`): owner sign-off 2026-07-11.
