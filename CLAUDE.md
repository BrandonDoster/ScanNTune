# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Overview

A tool that **auto-calibrates a 3D printer's XY shrinkage and skew from a flatbed scan** of a printed
calibration coupon — no manual caliper measurements. The user prints `calibration_coupon.scad` (an open
lattice of measurement rings), scans it, and the software reads the geometry with OpenCV and emits ready
-to-paste firmware/slicer corrections.

The measurement principle: ring **centres** give true X/Y scale and skew (centres are immune to over/under
-extrusion — extrusion changes a ring's wall width, not its centre). The correction math mirrors the Vector
3D "Califlower" calculator (Klipper `SET_SKEW`, Marlin `XY_SKEW_FACTOR`/steps-per-mm, Orca/Super shrinkage
%, RRF `M556`).

Orientation is automatic. The coupon's origin-corner ring **and its +X neighbour** are printed SOLID (no
hole) — a two-ring marker the software reads: `origin → neighbour` is the coupon's +X, which resolves
rotation AND mirror-flip with no manual input (see "Coupon & orientation" below).

## Build & Run

The solution lives at `src/PrinterCalibrate.slnx` (new XML solution format). Both projects target `net10.0`.

```bash
dotnet restore src/PrinterCalibrate.slnx
dotnet build   src/PrinterCalibrate.slnx
dotnet run     --project src/PrinterCalibrate.App     # launch the desktop UI
dotnet test    src/PrinterCalibrate.Tests             # run the pipeline tests
```

Tests are NUnit and cover the CV pipeline end-to-end against `PrinterCalibrate.Tests/TestFiles/TestData_2solid.png`
(a perfect render of the coupon *with the two-solid marker* → ~0% scale, ~0° skew, 23 detectable holes). The
suite rotates, mirror-flips, stretches, and shears it to prove rotation/flip-invariance and skew recovery.
Add new fixtures by dropping an image into `TestFiles/` and asserting its known answer.

When iterating on the app, **stop any running `PrinterCalibrate.App` before rebuilding** — a live instance
locks `PrinterCalibrate.Core.dll` and the App build fails to copy it (`taskkill`/`Stop-Process`).

Coupon model (OpenSCAD): render a top view with
`openscad -o out.png --projection=ortho --camera=0,0,0,0,0,0,150 --viewall --autocenter calibration_coupon.scad`;
re-export the STL with `openscad -o calibration_coupon.stl calibration_coupon.scad` (~90s CGAL render). There
is no CLI to run the engine on an arbitrary scan yet — use an `[Explicit]` NUnit test (or add a small CLI).

## Projects

Keep the **engine separate from the UI** so the CV/calc logic stays headless and reusable:

- **PrinterCalibrate.Core** — the engine, **no UI dependency**: load image → detect ring centres (sub-pixel)
  → map to the grid + resolve orientation from the two-solid marker → affine-fit for X/Y scale + skew.
  Libraries: `OpenCvSharp4`, `MathNet.Numerics`.
- **PrinterCalibrate.App** — the Avalonia front-end: load/scan an image, show detected rings overlaid on
  the scan, display results and copy-paste correction snippets. Optional WIA scanner acquisition on Windows.
- **PrinterCalibrate.Tests** — NUnit; end-to-end pipeline tests over fixture scans.

The analyze pipeline is three injected stages — `IRingDetector` → `IGridMapper` → `IAffineSolver` — composed
by `CouponAnalyzer`. Output is produced on demand by two separate services the UI calls: `ICorrectionFormatter`
(per-flavour firmware/slicer snippets) and `IOverlayRenderer` (annotated scan). The measurement key: ring
**centres** drive scale/skew (extrusion-immune); absolute scale needs `AnalysisOptions.PxPerMm` (scanner DPI
/ 25.4) — set the coupon baseline (mm) and scanner DPI in the app — otherwise only anisotropy + skew are
meaningful.

The model source (`calibration_coupon.scad`) and its exported `calibration_coupon.stl` live at the repo
root.

## Coupon & orientation

The coupon is an open lattice of `grid_n` × `grid_n` rings joined by ribs (default 5×5, 100 mm baseline).
Two rings are printed SOLID (no hole) as the **orientation marker**: the origin corner and its +X neighbour.
`GridMapper` finds the unique "corner + edge-neighbour" pair of missing (holeless) grid vertices;
`origin → neighbour` is the coupon's +X. Because that gives the true physical axes, X/Y labels **and** the
skew sign come out correct at any rotation or mirror-flip — **no manual flip flag**. The marker is
**required**: if it can't be located `GridMapper.Map` throws (it tolerates one stray missed hole, but not an
absent marker — there is deliberately no rotation-only fallback).

`RingDetector` gotcha: the circularity gate is **loose (0.20)** because real printed/scanned holes are rough
(~0.2–0.8 circularity). Rings are separated from the much larger square lattice cells by a **size cluster**
(radius-median filter), NOT by circularity — a strict threshold silently drops nearly every ring on a real
scan.

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
