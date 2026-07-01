# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Overview

A tool that **auto-calibrates a 3D printer's XY shrinkage and skew from a flatbed scan** of a printed
calibration coupon — no manual caliper measurements. The user prints `calibration_coupon.scad` (an open
lattice of measurement rings), scans it, and the software reads the geometry with OpenCV and emits ready
-to-paste firmware/slicer corrections.

The measurement principle: ring **centres** give true X/Y scale and skew (centres are immune to over/under
-extrusion — extrusion changes a ring's wall width, not its centre); ring outer/inner diameters are read
separately as a flow diagnostic. The correction math mirrors the Vector 3D "Califlower" calculator
(Klipper `SET_SKEW`, Marlin `XY_SKEW_FACTOR`/steps-per-mm, Orca/Super shrinkage %, RRF `M556`).

## Build & Run

The solution lives at `src/PrinterCalibrate.slnx` (new XML solution format). Both projects target `net10.0`.

```bash
dotnet restore src/PrinterCalibrate.slnx
dotnet build   src/PrinterCalibrate.slnx
dotnet run     --project src/PrinterCalibrate.App     # launch the desktop UI
dotnet test    src/PrinterCalibrate.Tests             # run the pipeline tests
```

Tests are NUnit and cover the CV pipeline end-to-end against fixture images in
`PrinterCalibrate.Tests/TestFiles/` (`TestData.png` is a perfect render → ~0% scale, ~0° skew; tests
also rotate and shear it to check rotation-invariance and skew recovery). Add new fixtures by dropping
an image into `TestFiles/` and asserting its known answer.

## Projects

Keep the **engine separate from the UI** so the CV/calc logic stays headless and reusable:

- **PrinterCalibrate.Core** — the engine, **no UI dependency**: load image → detect orientation fiducial
  → fit all ring centres (sub-pixel) → affine-fit for X/Y scale + skew → emit firmware/slicer strings.
  Libraries: `OpenCvSharp4`, `MathNet.Numerics`.
- **PrinterCalibrate.App** — the Avalonia front-end: load/scan an image, show detected rings overlaid on
  the scan, display results and copy-paste correction snippets. Optional WIA scanner acquisition on Windows.
- **PrinterCalibrate.Tests** — NUnit; end-to-end pipeline tests over fixture scans.

The engine pipeline is four injected stages — `IRingDetector` → `IGridMapper` → `IAffineSolver` →
`ICalibrationFormatter` — composed by `CouponAnalyzer`. The measurement key: ring **centres** drive
scale/skew (extrusion-immune); absolute scale needs `AnalysisOptions.PxPerMm` (scanner DPI / 25.4),
otherwise only anisotropy + skew are meaningful.

The model source (`calibration_coupon.scad`) and its exported `calibration_coupon.stl` live at the repo
root.

## Conventions

The coding rules are strict; each is numbered for unambiguous reference:

1. **No static methods or properties** except `public const` fields — use injected instance services and
   virtual dispatch instead.
2. **No empty catch blocks** — a catch must log and/or return a meaningful value.
3. **Open/closed** — a new subtype (a new CV stage, output formatter, scanner source, …) should require
   zero edits outside its own file.
4. **Logging is via `ILogger<T>?`** (Microsoft.Extensions.Logging.Abstractions), always optional.
5. **No AI attribution anywhere that touches git or GitHub** — not in commit messages, PR titles or
   descriptions, issue/PR comments, tags, or release notes. Concretely: no `Co-Authored-By` trailer,
   no "Generated with Claude Code" (or any similar "made/assisted by AI") line, and no AI tool name
   anywhere in the history or on GitHub. This applies to every `git` and `gh`/GitHub API action
   without exception. Keep commit messages to a single short sentence (a concise subject line, no body).
6. **Self-review before handoff — multi-file changes only.** Before presenting a multi-file change for
   commit approval, run a medium-effort `/code-review` scoped to the change. Every finding it surfaces
   requires a logged disposition — paste the finder list verbatim and mark each one **Fixed** (name the
   commit that resolves it), **False positive** (the finding is factually wrong, proven with the quoted
   line that refutes it), or **Owner-waived** (you flagged it to the owner and they chose not to fix it).
   "Pre-existing," "out of scope," "low value," or "cosmetic" are not valid reasons to silently drop a
   finding — skipping a correct finding is the owner's decision, never yours.
