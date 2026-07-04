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

## Web app (Vue 3 rewrite): the active development target

The project is being rewritten as a plain web app under `web/` (Vue 3 + TypeScript + Vite + Vuetify),
replacing the Avalonia desktop and WebAssembly heads. **Web is now the only target.** The rewrite exists
because the C# browser head **froze during analysis**: WebAssembly there is single-threaded (so `Task.Run`
cannot offload the CV work), interpreted, links OpenCV at `-O0`, and runs on a 256 MB heap. The Vue app
runs the exact same measurement pipeline, ported to TypeScript, in a **Web Worker** using **OpenCV.js**, so
analysis is off the main thread (no freeze), needs no cross-origin-isolation headers (works on GitHub
Pages), and is far faster. Native `<input type=file>` and `<input type=number>` also delete the entire
Avalonia mobile-input saga (rule 11 below is now historical).

Commands (run inside `web/`):

```bash
npm install
npm run dev       # Vite dev server at http://localhost:5173/ScanNTune/
npm run build     # vue-tsc typecheck + production build to web/dist
npm test          # Vitest: engine unit tests + fixture-backed CV tests
npm run e2e       # Playwright end-to-end over the real scans in web/e2e/fixtures
```

Structure: a framework-agnostic engine in `web/src/engine/` (the faithful port of `ScanNTune.Core`:
`ringDetector`, `gridMapper`, `affineSolver`, `couponAnalyzer`, `scanCombiner`, `cardEdgeMeasurer`,
`overlayRenderer`, `correctionFormatter`), a Comlink Web Worker in `web/src/worker/`, thin Vue pages in
`web/src/components/` (Scan / Calibration / Results) over Pinia stores, and tests in `web/tests` (Vitest)
and `web/e2e` (Playwright). The engine takes the loaded `cv` instance as a parameter, so OpenCV.js stays
out of the main bundle (it lives in the worker chunk, loaded on first analysis) and tests can inject it.

Measurement integrity is preserved: every stage is a 1:1 port validated against the same fixture as the C#
suite (`web/tests/fixtures/TestData_2solid.png`) at the same tolerances (23 rings, ~0 skew, isotropy), plus
Playwright over the real scans (the card recovers ~23.6 px/mm; the two-scan flow completes on 35 MP scans
without freezing). Do not change the ported math without re-validating those fixtures (rule 7).

Two durable gotchas:
- **OpenCV.js loads via a default import** (`import cvReady from '@techstark/opencv-js'`), NOT a namespace or
  dynamic `import()`. Its `module.exports` is a Promise, which a namespace/dynamic import turns into a broken
  thenable ("Promise.prototype.then called on incompatible receiver") in both Vitest and the browser build; a
  bundler default import returns `module.exports` (the real Promise) directly. In Vitest the engine CV tests
  load it with a native `require` instead (see `web/tests/helpers/cv.ts`), because even the default import is
  re-wrapped by Vitest's module runner.
- **Vite `base` is `/ScanNTune/`** (the GitHub Pages project path); asset URLs and the STL download depend on
  `import.meta.env.BASE_URL`.

The C# solution (`src/`) is kept during the transition and still builds; it will be retired at cutover. CI:
`.github/workflows/web-ci.yml` builds/tests/e2e-tests the web app on PRs; `deploy-web-vue.yml` is the cutover
Pages deploy (manual `workflow_dispatch` only, so it cannot clobber the live C# site yet).

## Build & Run (C# solution, being retired)

The solution lives at `src/ScanNTune.slnx` (new XML solution format). Core, UI, App and Tests target
`net10.0`; the browser head targets `net10.0-browser` and needs the `wasm-tools` workload
(`dotnet workload install wasm-tools`).

```bash
dotnet restore src/ScanNTune.slnx
dotnet build   src/ScanNTune.slnx              # builds every head, incl. the browser wasm native relink
dotnet run     --project src/ScanNTune.App     # launch the Windows desktop UI
dotnet run     --project src/ScanNTune.Browser # serve the WebAssembly app for local dev
dotnet test    src/ScanNTune.Tests             # run the pipeline tests
```

The browser head publishes to a static site: `dotnet publish src/ScanNTune.Browser -c Release -o publish`
produces `publish/wwwroot`, which `.github/workflows/deploy-web.yml` ships to GitHub Pages on every push to
`master`. If a wasm build ever aborts at load with a Mono "double fault" (usually after changing a native
build flag), the incremental native build is stale: `rm -rf src/ScanNTune.Browser/bin src/ScanNTune.Browser/obj`
and rebuild clean.

Tests are NUnit and cover the CV pipeline end-to-end against `ScanNTune.Tests/TestFiles/TestData_2solid.png`
(a perfect render of the coupon *with the two-solid marker* → ~0% scale, ~0° skew, 23 detectable holes). The
suite rotates, mirror-flips, stretches, and shears it to prove rotation/flip-invariance and skew recovery.
Add new fixtures by dropping an image into `TestFiles/` and asserting its known answer.

When iterating on the app, **stop any running `ScanNTune.App` before rebuilding** — a live instance
locks `ScanNTune.Core.dll` and the App build fails to copy it (`taskkill`/`Stop-Process`).

Coupon model (OpenSCAD): render a top view with
`openscad -o out.png --projection=ortho --camera=0,0,0,0,0,0,150 --viewall --autocenter calibration_coupon.scad`;
re-export the STL with `openscad -o calibration_coupon.stl calibration_coupon.scad` (~90s CGAL render). There
is no CLI to run the engine on an arbitrary scan yet — use an `[Explicit]` NUnit test (or add a small CLI).

## Projects

The app is split into a headless engine, a shared UI library, and two platform "heads", so the CV/calc
logic stays reusable and each platform carries only its own glue:

- **ScanNTune.Core**, the engine, with **no UI dependency**: load image, detect ring centres (sub-pixel),
  map to the grid + resolve orientation from the two-solid marker, affine-fit for X/Y scale + skew.
  Libraries: managed `OpenCvSharp4`, `MathNet.Numerics`. Core references **only managed OpenCvSharp**;
  each head supplies the native runtime.
- **ScanNTune.UI**, shared Avalonia (`net10.0`): the Views, ViewModels, `ViewLocator`, controls, themes,
  assets (including the bundled coupon STL), the platform abstractions `IPlatformImaging` (decode image
  bytes to a BGR `Mat`) and `ICouponExporter`, and the Autofac `UiModule`. Both heads reuse it.
- **ScanNTune.App**, the **Windows desktop head**: `Program`/`App`/`MainWindow`, Velopack updates, the
  Serilog file sink, `OpenCvImaging`, `WindowsCouponExporter`, `JsonCalibrationStore`, and `AppModule`.
  References `OpenCvSharp4.runtime.win`. (A WIA scanner source could plug in here as another head service.)
- **ScanNTune.Browser**, the **WebAssembly head** (`net10.0-browser`): `Avalonia.Browser`, `SkiaImaging`
  (the wasm OpenCV build ships no image codecs, so Skia decodes), `BrowserCouponExporter`, a localStorage-backed
  calibration store, a JS interop module (`wwwroot/interop.js`), and `BrowserModule`. References
  `OpenCvSharp4.runtime.wasm` + `SkiaSharp`. Runs entirely client-side. Several deliberate wasm workarounds
  are commented in `ScanNTune.Browser.csproj` and the platform files (P/Invoke module rename to
  `OpenCvSharpExtern.a`, `EmccLinkOptimizationFlag=-O0`, `WasmAllowUndefinedSymbols`, a raised heap size,
  `JsonSerializerIsReflectionEnabledByDefault`, and `TrimmerRootAssembly` roots for the reflection users,
  including Autofac whose registration sources the trimmer otherwise strips): keep them, do not "simplify" them away.
- **ScanNTune.Tests**, NUnit; end-to-end pipeline tests over fixture scans. Carries `runtime.win` so
  OpenCV runs on Windows.

**Composition is Autofac.** Each head builds a container from `UiModule` (Core engine services + view models
+ an open-generic `ILogger<>` over a head-supplied `ILoggerFactory`) plus its own module (platform imaging,
coupon export, the calibration/settings stores, the logger factory), then resolves `MainWindowViewModel`.
Adding a platform service is a new registration in a head module, with no edits elsewhere (rule 3).

The analyze pipeline is three injected stages, `IRingDetector`, `IGridMapper`, `IAffineSolver`, composed by
`CouponAnalyzer`. Output is produced on demand by two services the UI calls: `ICorrectionFormatter`
(per-flavour firmware/slicer snippets) and `IOverlayRenderer` (annotated scan; `RenderOverlay` returns a
`Mat` the UI turns straight into a bitmap, so overlays work without an image encoder in wasm). The
measurement key: ring **centres** drive scale/skew (extrusion-immune); absolute scale needs
`AnalysisOptions.PxPerMm` (scanner DPI / 25.4), set from the coupon baseline (mm) and scanner DPI in the app,
otherwise only anisotropy + skew are meaningful.

Scans reach the engine as **image bytes**: the shared view models load the picked/dropped file via Avalonia
`StorageProvider` and decode through `IPlatformImaging` (OpenCV on desktop, Skia in the browser), so the UI
has no filesystem-path dependency.

The model source (`calibration_coupon.scad`) and its exported `calibration_coupon.stl` live at the repo
root.

## Coupon & orientation

The coupon is an open lattice of `grid_n` × `grid_n` rings joined by ribs (default 5×5, 100 mm baseline).
Two rings are printed SOLID (no hole) as the **orientation marker**: the origin corner and its +X neighbour.
`GridMapper` finds the unique "corner + edge-neighbour" pair of missing (holeless) grid vertices;
`origin → neighbour` is the coupon's +X. Because that gives the true physical axes, X/Y labels **and** the
skew sign come out correct at any rotation or mirror-flip — **no manual flip flag**. The marker is
**required**: if it can't be located `GridMapper.Map` throws (it tolerates at most one stray missed hole — a stray adjacent to a corner
makes the marker ambiguous and is rejected too — but not an absent marker; there is deliberately no
rotation-only fallback).

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
4. **Logging is mandatory — a null logger is FORBIDDEN.** Every component that can throw, swallow, or
   recover from an error must log through `ILogger<T>` (Microsoft.Extensions.Logging.Abstractions). The
   app backs that abstraction with **Serilog**, writing to a rolling file under
   `%LocalAppData%\ScanNTune\logs`; the desktop head wires global handlers so every unhandled/unobserved
   exception is logged. Never pass `null` as a logger and never leave a `catch` that neither logs nor
   returns a meaningful value (pairs with rule 2). Core stays engine-only: it depends on the
   `ILogger<T>` abstraction, never on Serilog — the app supplies the concrete logger.
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

7. **Measurement integrity — established methods only, never a fudge.** Every change to the
   measurement pipeline (ring detection, centre estimation, affine/robust fitting, correction math)
   must be an established, published algorithm or a standard library primitive (OpenCV, MathNet),
   chosen because it is the correct model for the problem — and named as such (e.g. "Taubin circle
   fit", "Huber M-estimator", "Circle Hough Transform"). NEVER introduce a hand-tuned constant,
   empirical offset, axis "nudge", or bias correction fitted to make one particular scan's numbers
   look right: that overfits the sample and lies on the next one. Before trusting a pipeline change,
   validate it against the synthetic fixture — it must not regress there — and only then judge it on
   real scans.

8. **No direct commits to `master` — every change ships as a pull request.** Committing or pushing
   straight to `master` is forbidden. Every change goes on its own branch and lands through a PR
   opened with `gh`. **The PR title must read as a release note** — a single user-facing sentence.
   Owner review gates everything: never create the branch's commit, push, or open the PR until the
   owner has explicitly approved the change in chat — present the diff summary and ask, and proceed
   only after a clear "yes". Rule 5 (no AI attribution anywhere that touches git or GitHub) applies
   without exception to the branch, the commits, the PR, and every `gh`/GitHub API action.

9. **Release notes come from labeled PRs — label every user-facing PR.** Notes are generated from PR
   titles via `.github/release.yml`: a PR appears only if it carries `feature` (→ Features) or
   `fix`/`bug` (→ Fixes). Label any user-facing change accordingly (pairs with rule 8 — the PR title
   is the release-note sentence); leave CI/chore/docs-only PRs unlabeled.

10. **Never use the em-dash character `—`, and never use a hyphen `-` as a substitute for it.** The
    em-dash is banned everywhere you write: source, comments, docs, UI text, commit messages, PR
    titles and bodies, issue/PR comments, and chat replies. Do not swap in a hyphen `-` to get the
    same dash-like pause either. Rewrite the sentence: use a colon, parentheses, a comma, or two
    separate sentences. A hyphen is allowed ONLY where grammar genuinely requires one, such as a
    compound modifier ("sub-pixel", "user-facing") or a hyphenated name.

11. **Mobile / WebAssembly usability (HISTORICAL: applied to the retired Avalonia-on-wasm browser head).**
    These constraints are superseded by the Vue rewrite in `web/`, which uses native HTML `<input type=file>`
    and `<input type=number>` and so has none of the problems below (no soft-keyboard `TextBox` bug, no
    iOS file-input hacks, no touch read-only steppers). Keep this section only as context for the C# code
    while it still exists; do NOT reintroduce these workarounds in the Vue app. The full story is in
    `HANDOFF.md` and the `mobile-web-constraints` memory.
    - **No free-text inputs.** The Android browser soft keyboard cannot commit typed characters into an
      Avalonia `TextBox` (you can delete but not type; framework bugs AvaloniaUI/Avalonia#11662 and #11665,
      still unfixed as of Avalonia 12.0.x). Every user-entered value uses a `NumericUpDown` stepper, or another
      control that needs no keyboard. Do not add a `TextBox` for real input to the shared UI. Give steppers a
      sensible per-field increment and floor, and no `Maximum` (never cap what the user may enter).
    - **On a touch device, turn text entry OFF in the numeric fields** so tapping one raises no soft keyboard
      or caret. A head-supplied `IDeviceInfo.IsTouchPrimary` (browser reads `matchMedia('(pointer: coarse)')`;
      desktop app is false) drives a `NumericUpDown.touchInput /template/ TextBox { Focusable=False;
      IsHitTestVisible=False }` style. Do NOT use `NumericUpDown.IsReadOnly`: it also disables the +/- spinner
      (`OnSpinnerSpin` is gated on `AllowSpin && !IsReadOnly`). Make only the inner `PART_TextBox` non-focusable.
    - **The file picker is app-owned (`IFilePicker`), and its browser sheet
      (`ScanNTune.Browser/wwwroot/interop.js`) has strict, non-obvious iOS requirements. Do not "simplify" any
      of them without a real iPhone to re-test.** (a) Open the sheet from a small dedicated button on
      `PointerPressed` (touch-DOWN), never on release or the `Tapped` gesture: a mobile browser drops the
      release as a cancel when it suspects a scroll, so open-on-release is unreliable, and a small button leaves
      the rest of the slot free to scroll. (b) The sheet dismisses on `pointerdown`, not `click`: the opening
      tap's follow-up click hits the backdrop and a click-dismiss self-closes the sheet instantly. (c) The sheet
      holds a real, VISIBLE `<input type=file>` (not `opacity:0`, not label-forwarded): iOS ignores taps on an
      invisible input. (d) That input must carry real event listeners (passive touch/pointer/click listeners):
      iOS only opens the OS dialog when it treats the element as interactive, and a bare styled input does not
      qualify. Those listeners look like debug code but are load-bearing; do not remove them.
    - **Large file loads must show progress and must not exhaust memory.** A real scan is 30+ MB and 35+ MP.
      Decode previews downscaled with `Bitmap.DecodeToWidth`, never `new Bitmap(stream)`: a full-resolution
      decode allocates well over 100 MB against the 256 MB wasm heap and intermittently runs out of memory (the
      original "upload takes minutes, works after a few tries"). The read is the slow part; the browser picker
      reads the bytes in one bulk `file.arrayBuffer()` copy, and every file-ingest path turns the busy indicator
      on BEFORE the read, not just the decode.
    - **Debugging mobile: instrument the device, and never claim an iOS fix works from desktop or
      synthetic-event testing.** Desktop sends clean events; real mobile touch differs (release becomes a cancel
      on scroll intent, iOS clickability heuristics, ghost clicks), and several iOS "fixes" that passed on
      desktop failed on the phone. The web app has an in-app debug console (the discreet "debug" button, in
      `interop.js`) that captures `console.*` plus errors and rejections, including C# logs via
      `BrowserConsoleLogger`, with Copy / Share. Add `console.log` / logger calls and read it on the phone
      rather than shipping a desktop-only-verified iOS fix.
