# Golden sample set: xy-skew-0p5

## Physical sample

XY calibration plate (100 mm baseline, 5x5 rings), printed 2026-07-10 on the owner's Voron
(Klipper) with a deliberately injected skew profile so the golden values sit far above scanner
and caliper noise:

```
SET_SKEW XY=100.436,99.564,70.711   (saved and loaded as profile ScanNTune)
```

Klipper turns these diagonals into xy_skew factor +0.0087202 (verified in the printer's saved
config), which physically OPENS the printed corner between +X and +Y by 0.4995 degrees
(arctan of the factor; verified against klippy/extras/skew_correction.py source).

## External measurements (the truth source)

Caliper measurements of a caliper-based community calibration print made in the same session on
the same machine with the same profile active, entered into its calculator (owner, 2026-07-10):

- Measured skew: +0.52 degrees (corner angle 90.52)
- X scale error: +0.05 percent
- Y scale error: +0.08 percent

ScanNTune independently read the plate scans (600 dpi session) as +0.504 degrees, X +0.059,
Y +0.077: agreement within scan and caliper noise, so the two chains cross-validate.

## Golden values and tolerances

- XY skew: +0.52 degrees, tolerance 0.06 degrees. Sign MUST be positive; a sign flip or a
  factor-of-2 error fails far outside the tolerance.
- X scale: +0.05 percent, tolerance 0.04 percent points.
- Y scale: +0.08 percent, tolerance 0.04 percent points.
- Card calibration: ISO/IEC 7810 ID-1 card, long side 85.60 mm (the app measures the long side
  only). Expected reported DPI: the scanner's nominal DPI for the session (150 or 300) within
  2 percent.

## Files

- `150dpi/`: card_150dpi.png, xy_0d.png, xy_90d.png (native 150 dpi scans, one session)
- `300dpi/`: card_300dpi.png, xy_0d.png, xy_90d.png (native 300 dpi scans, one session)

All scans are native scanner output at the stated DPI (no resampling). The two DPI sets exist
because a DPI-dependent card edge bias was found and fixed (slanted-edge sub-pixel localization);
the golden tests pin both DPI levels to the same physical truth.

## Re-verification

Required before hardcoding goldens (skill rule): run each DPI set through the app and confirm the
displayed values match the golden values above within tolerance. If a set reads near +0.03
degrees instead of +0.5, the scans are of the WRONG plate (the uncorrected one); stop and ask the
owner.
