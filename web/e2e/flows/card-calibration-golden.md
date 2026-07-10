# Flow spec: card (scanner) calibration, golden

Phase: 1 (test design). No expected values in this document were taken from source code; every
golden number is copied from `web/e2e/golden/xy-skew-0p5/PROVENANCE.md`. Phase 2 must re-verify
each set against the app before hardcoding it into a test (skill re-verification requirement) and
must not add, drop, weaken, or reinterpret any assertion listed here; if the app disagrees with a
step, stop and report instead of adapting the test.

## Amendment (owner-approved 2026-07-10)

This spec was amended after the original phase 1 pass, per the skill's "changing an existing golden
test starts over at phase 1" rule. Changes, all owner-approved 2026-07-10:

- **Snapshot tier added** (skill principle 3): the card px/mm and effective-dpi figures now also
  carry a tight, explicitly-labeled snapshot assertion pinning today's measured output on the exact
  golden fixture files, alongside the existing external-truth band. Snapshot changes need
  justification but not caliper re-verification; the external band and its tolerance still require
  caliper re-verification and owner sign-off per skill principle 7.
- **New assertions**: "vs nominal" is now asserted (as a snapshot literal per the 2026-07-11
  literals-only amendment below; the 2026-07-10 version specified a formula, superseded), and the
  "Detected NN.NN mm" figure is now asserted as a number (not just the "matches" text branch),
  against the ISO/IEC 7810 truth of 85.60 mm within 0.30 mm.
- No change to the card flow's external px/mm tolerance (2 percent, both dpis): this amendment's
  150 dpi absolute-scale widening applies only to the XY plate's percent-scale readings in
  `xy-skew-golden.md`, not to the card's own px/mm recovery, which the re-verification below
  confirms is unbiased at both dpis.
- **Literals only (skill principle 5, owner-approved 2026-07-11)**: every expectation in this spec
  is a hardcoded literal with a tolerance, or an exact string. The webtest performs no formulas,
  no unit conversions, and no helpers mirroring engine logic; relations between figures (px/mm vs
  effective dpi, effective dpi vs "vs nominal") are pinned in engine unit tests, not re-derived in
  the webtest. All numeric bands in this spec, including those originally described with their
  dpi/25.4 derivations, are asserted as the pre-computed literals written here; the derivations
  remain in this spec as documentation only. Snapshot literals marked "to be captured by phase 2"
  are read off the deterministic app run against these exact fixtures and recorded back into this
  spec by phase 2: this is the one sanctioned flow of numbers from app to spec, snapshot tier
  only, always labeled "snapshot, not external truth".

Golden sample set: `web/e2e/golden/xy-skew-0p5/` (see PROVENANCE.md). Card fixtures:
`150dpi/card_150dpi.png` and `300dpi/card_300dpi.png`, relative to that golden directory.

External truth: ISO/IEC 7810 ID-1 card, long side 85.60 mm (PROVENANCE.md "Card calibration"
paragraph). Expected reported DPI: the scanner's nominal DPI for the session (150 or 300), within
2 percent (PROVENANCE.md).

Two scenarios exist (150 dpi, 300 dpi) because a DPI-dependent card edge bias was found and fixed
(slanted-edge sub-pixel localization). Both scenarios assert against the same physical card truth
(85.60 mm), so a regression that reintroduces a DPI-dependent bias fails one scenario but not the
other, which is the signal that would have caught the original bug.

## Scenario A: 150 dpi card calibration, full walkthrough

1. Navigate to the app root (`/`).
   -> expected: heading "Skew/shrinkage calibration" visible (app entry, per `analysis.spec.ts`
      "the app loads").
2. Click `calibrate-btn`.
   -> expected: navigates to the scanner calibration page (`CalibrationPage.vue`); the "Your
      numbers" panel with the `measuredMm` field ("Measured long side (mm)") and the `dpi` field
      ("Scan resolution (dpi)") is visible. `back-btn` is visible.
3. Fill "Measured long side (mm)" with `85.60` (the ISO/IEC 7810 external truth, not a value read
   off any prior run).
   -> expected: no warning text under the field (the "isoSanityWarn" note stays silent; if the
      field's hint text shows a warning, the entered value is being compared to something other
      than 85.60 and phase 2 should report this rather than change the entered value).
4. Fill "Scan resolution (dpi)" with `150`.
   -> expected: field accepts the value; the upload zone (no testid on the dropzone `<label>`
      itself, only its inner `card-input`) becomes enabled (no "Enter your measurement and a DPI
      of at least 50 first" caption visible).
5. Upload `150dpi/card_150dpi.png` through the real file input `card-input` (`setInputFiles`, not
   a store call).
   -> expected: `calibration-result` becomes visible within 120000 ms (35 MP+ scans take real
      worker time; do not shrink this timeout).
6. Read `pxpermm` (`innerText`, parse as float).
   -> expected (external truth, unchanged; literal band, amended 2026-07-11): `pxPerMm` in the
      hardcoded literal band `[5.7874, 6.0236]`. Documentation of the band's origin (not test
      code): it is 2 percent around `150 / 25.4 = 5.90551...` px/mm, per PROVENANCE.md's "Expected
      reported DPI: ... within 2 percent"; the derivation lives here in the spec, the test asserts
      only the literal endpoints with a comment pointing at this spec.
   -> expected (snapshot, not external truth, amended): `pxpermm` in `[5.90359, 5.90759]`
      (centre 5.90559), tolerance +/-0.002. This is a regression pin on today's measured output for
      this exact fixture, tighter than and independent of the external 2 percent band above.
7. The result panel also displays "effective dpi" (no testid; a MetricTile with label
   "effective dpi", read via the tile's value text) and "vs nominal" (no testid).
   -> expected (external truth, unchanged; literal band, amended 2026-07-11): the displayed
      effective dpi is in the hardcoded literal band `[147, 153]` (2 percent around the nominal
      150, per PROVENANCE.md; derivation documented here, not computed in the test). The
      rounding relation between `pxpermm` and this tile is engine/UI unit-test territory, not
      webtest arithmetic.
   -> expected (snapshot, not external truth, amended): effective dpi displayed is exactly 150.
   -> expected (snapshot, not external truth, amended 2026-07-11, literals only): the "vs nominal"
      tile's displayed value contains the literal `+0.001 %` (captured by phase 2 from the
      deterministic app run on this fixture, 2026-07-11; the sanctioned app-to-spec flow, see
      "Amendment"). No formula from the measured px/mm in the test; the percent-difference
      relation between px/mm, effective dpi, and "vs nominal" is pinned in engine unit tests.
8. Read the "Detected NN.NN mm" text under the tiles.
   -> expected: text also shows ", matches your 85.60 mm" (the `sizeCheckOk` branch), meaning the
      detected size is within 0.3 mm of the entered 85.60 mm. If instead the "but you entered..."
      branch shows, that means the size check failed: stop and report, do not adjust the entered
      measurement to make it pass.
   -> expected (amended, new assertion): parse the "NN.NN" number out of "Detected NN.NN mm" and
      assert it is in `[85.30, 85.90]` mm (85.60 mm ISO/IEC 7810 truth, tolerance 0.30 mm), not just
      that the "matches" branch of the text rendered. This catches a bug where the size-check
      threshold is loose enough to show "matches" for a detected value further from 85.60 mm than
      the ISO truth allows.
9. Look for `saved`.
   -> expected: `saved` testid visible with text containing "Saved, used for every scan" (the
      calibration persisted to the `useCalibration` store / localStorage).
10. Verify no error state: `statusText`/`v-alert` with `type="error"` must not be showing (the
    generic alert has no testid; assert by checking the `hasResult`/`calibration-result` branch is
    what rendered, not the alert, since phase 2 has no dedicated error testid here, see "Missing
    testids" below).
11. Click `back-btn` to return to the scan page (ScanPage.vue).
    -> expected: step 1 "Calibrate scanner" status line shows the calibrated icon (success/check)
       and the text `150 dpi` (rounded, per `calibrationLine` = `Math.round(dpi)} dpi`), i.e. the
       calibration persisted across navigation. There is no dedicated testid on this status line
       text today; phase 2 should assert on the visible text "150 dpi" within the step 1 section,
       or add a testid (see below).

## Scenario B: 300 dpi card calibration, full walkthrough

Same eleven steps as Scenario A, with:
- step 4: fill DPI with `300`.
- step 5: upload `300dpi/card_300dpi.png`.
- step 6: `pxPerMm` in the hardcoded literal band `[11.5748, 12.0472]` (external truth, unchanged;
  documented derivation: 2 percent around `300 / 25.4 = 11.81102...`, spec-side only). Snapshot
  band (amended): `[11.80470, 11.80870]` (centre 11.80670), tolerance +/-0.002.
- step 7: effective dpi in the hardcoded literal band `[294, 306]` (external truth; 2 percent
  around the nominal 300, derivation spec-side only); snapshot value (amended) exactly 300.
  "vs nominal" (amended 2026-07-11, literals only): the literal `-0.037 %` (captured by phase 2
  from the 300 dpi run, 2026-07-11), snapshot tier; no formula in the test.
- step 8-11: identical structure; step 8's "Detected NN.NN mm" number assertion (amended) uses the
  same `[85.30, 85.90]` mm band as Scenario A (same physical ISO card); step 11 expects the status
  line text `300 dpi`.

Both scenarios must independently pass; because they calibrate the SAME physical ISO card, a
DPI-dependent regression that shifts the recovered px/mm by a resolution-dependent bias will pass
one scenario and fail the other, or pass both but produce inconsistent `detectedMm` values, which
is exactly the class of bug PROVENANCE.md documents as previously found and fixed.

## Rejection path

`CalibrationPage.vue` has no dedicated "reject a non-card scan" UI path with its own testid today:
an upload that fails detection sets `isError = true` and shows a plain `v-alert` with the
`statusText` message ("Couldn't detect the card in that scan." or a resolution-mismatch message),
with no `data-testid` on that alert. This differs from the XY scan page's `status` testid.

If phase 2 needs a rejection-path test for this flow (recommended by skill principle 6: at least
one reject-path test per flow), it should:
1. Upload one of the golden set's plate scans (e.g. `150dpi/xy_0d.png`, a coupon scan, not a card)
   as the `card-input` file.
   -> expected: `calibration-result` never appears; an error alert appears with non-empty text.
2. Because there is no `card-scan-error` (or similar) testid, phase 2 must add one to
   `CalibrationPage.vue`'s error `v-alert` (e.g. `data-testid="card-error"`) rather than matching
   on the alert's visible text, per the skill's "add a testid, not a workaround selector" rule.

## Missing testids phase 2 must add (do not invent workaround selectors instead)

- An error-state testid on `CalibrationPage.vue`'s `v-alert` (e.g. `card-error`), so the rejection
  path and any failed-upload assertion do not rely on matching visible alert text.
- A testid on the step 1 "Calibrate scanner" status line in `ScanPage.vue` (the
  `<span class="text-medium-emphasis">{{ calibrationLine }}</span>` element), e.g.
  `data-testid="calibration-status-line"`, so scenario step 11 does not need to match the "150
  dpi" / "300 dpi" text via a CSS-class selector.
- Recommended (amended, now needed by step 7's "vs nominal" assertion, no longer merely optional):
  testids on the "effective dpi" and "vs nominal" `MetricTile`s in the calibration result panel
  (currently only `pxpermm` has one), so step 7 does not need to locate tiles by their label text.

## Provenance block

- ISO/IEC 7810 ID-1 long side 85.60 mm: PROVENANCE.md, "Golden values and tolerances", "Card
  calibration" line.
- 2 percent DPI tolerance: PROVENANCE.md, same line ("within 2 percent").
- Fixture paths (`150dpi/card_150dpi.png`, `300dpi/card_300dpi.png`): PROVENANCE.md, "Files"
  section.
- Snapshot values (amended, owner-approved 2026-07-10, `// snapshot, not external truth`): 150 dpi
  px/mm 5.90559 (tolerance +/-0.002), effective dpi 150; 300 dpi px/mm 11.80670 (tolerance
  +/-0.002), effective dpi 300. Source: re-verification runs against this golden set, per the skill's
  principle 3 snapshot tier; not caliper measurements, and changing them needs justification (why
  the deterministic output moved) but not caliper re-verification, unlike the external bands above.
- "Detected NN.NN mm" band `[85.30, 85.90]` mm (amended, new assertion): derived directly from the
  85.60 mm ISO/IEC 7810 truth cited above with the 0.30 mm tolerance from the `sizeCheckOk` branch's
  own stated threshold (PROVENANCE.md, "Card calibration" line references the same external truth;
  the 0.30 mm figure matches the app's own size-check tolerance, not a newly invented one).
- Re-verification requirement (skill mandatory step): before hardcoding the numeric bands above
  into test code, phase 2 must run both scenarios against the real app and confirm the displayed
  px/mm and detected mm land inside the stated tolerances. If a scenario reads a value inconsistent
  with 85.60 mm at its nominal DPI (e.g. off by a clean factor of 2, or off by more than 2 percent
  with no factor explanation), STOP and report to the owner rather than adjusting the golden
  tolerance or the entered measurement to make the test pass.
- Literals-only conversion (skill principle 5: all bands asserted as pre-computed literal
  endpoints, "vs nominal" asserted as a phase-2-captured snapshot literal, no formulas or unit
  conversions in the webtest; derivations retained in this spec as documentation): owner sign-off
  2026-07-11, recorded in the "Amendment" section.
