# Handoff

## Current work: the Vue rewrite (2026-07-05)

The project pivoted: **web is the only target**, and the app is being rewritten from C#/Avalonia to a plain
web app under `web/` (Vue 3 + TypeScript + Vite + Vuetify), with the CV engine ported to TypeScript and run
in a **Web Worker** via **OpenCV.js**. This kills the analysis-freeze bug (the C# wasm head ran the CV work
on the single UI thread, interpreted, at `-O0`, on a 256 MB heap) and deletes the whole Avalonia mobile-input
saga (native HTML inputs just work). See `CLAUDE.md` "Web app (Vue 3 rewrite)" for structure and commands.

Status: on branch `feature/vue-web-rewrite`, committed locally (NOT pushed / no PR yet, per rule 8). Done and
green: scaffold; the full engine port (grid/affine/combiner/corrections + ring detector/card measurer/
analyzer/overlay) with 61 Vitest tests matching the C# tolerances against the same `TestData_2solid.png`
fixture; the Comlink worker + decode + overlay; the three Vue pages (Scan/Calibration/Results); and Playwright
e2e over the real scans (card recovers **px/mm 23.597**, the two-scan flow completes on 35 MP scans without
freezing, 23 rings, valid quarter-turn). CI: `web-ci.yml` (build + Vitest + Playwright on PRs); the Vue Pages
deploy `deploy-web-vue.yml` is manual-only until cutover.

Key lessons this session:
- **OpenCV.js (`@techstark/opencv-js`) `module.exports` is a Promise**, so a namespace or dynamic `import()`
  yields a broken thenable ("Promise.prototype.then called on incompatible receiver") in BOTH Vitest and the
  browser build. Load it with a **default import** (`import cvReady from '@techstark/opencv-js'`) in app code;
  in Vitest, load it with a native `require` (`web/tests/helpers/cv.ts`) since even the default is re-wrapped.
- **npm installed newer majors** than pinned: Vuetify 4, Pinia 3, OpenCV.js 5, Vite 8, Vitest 4. All work.
- A real scan analyzed uncalibrated at the default 1200 dpi reads ~ -50% absolute scale (correct: the scan is
  ~600 dpi); the DPI-independent figures (isotropy, skew, rings, turn) are the meaningful check.
- The ~100 MB of real scans committed under `web/e2e/fixtures/` bloat git history; Git LFS is the cleaner
  option if that matters (offered, not yet done).

Remaining: owner review + PR; wire the live Pages deploy to the Vue app at cutover and retire `src/`.

---

# Handoff: mobile / WebAssembly work (historical, superseded by the Vue rewrite above)

Written 2026-07-04. Captures what was done and learned making the ScanNTune WebAssembly web app usable on
phones, including a long iOS Safari file-upload fight. The Vue rewrite makes these Avalonia-specific
workarounds moot (native HTML inputs), but they are kept for context while the C# code exists. Read this with
`CLAUDE.md` (rule 11) and the `mobile-web-constraints` memory.

## TL;DR status

The web app works on phones, **including iOS Safari file upload** (verified on a real iPhone, iOS 18.7).
PRs #8 through #20 are merged to `master`. This session added #12 to #20; the headline is that iOS file
upload finally works and there is now an in-app debug console for future on-device debugging.

## The mobile file picker: the final working design (READ before touching the picker)

The picker sheet lives in `ScanNTune.Browser/wwwroot/interop.js` (`pickImageFile`). Every piece below is
load-bearing and was a separate failed attempt before it landed. Do not "simplify" any of it without a real
iPhone to re-test.

1. **Own the sheet (`IFilePicker`), do not use Avalonia's picker.** Avalonia `await`s its storage JS module
   before clicking the input, and iOS treats any await as losing the user activation, so nothing opens.
   Issue AvaloniaUI/Avalonia#11041 is closed "not planned". [#11]
2. **Open the sheet from a small dedicated "Choose file" button on each scan slot, on `PointerPressed`
   (touch-DOWN), never on release / the `Tapped` gesture.** A mobile browser drops the pointer RELEASE as a
   `pointercancel` when it suspects a scroll, so any open-on-release scheme is unreliable ("works 1 in N
   taps"). Touch-down always fires. A SMALL button (not the whole slot) leaves the rest of the slot free so a
   drag there scrolls the page. This took four tries (#12 Tapped, #13 slot press+release, #14 root-level
   press+release, all flaky) before #15 settled it.
3. **The sheet backdrop dismisses on `pointerdown`, NOT `click`.** The touch-down that opens the sheet fires
   a follow-up `click` mid-screen on the backdrop; a click-based "tap outside to dismiss" then closes the
   sheet the instant it opens (a still tap closed it, a moved finger did not, because browsers suppress the
   click after a drag). [#16]
4. **The sheet contains a REAL, VISIBLE `<input type=file>`.** Not an `opacity:0` overlay, not a
   label-forwarded hidden input: iOS registers the tap on an invisible input but will not open the OS dialog
   from it. Theme only its button via `::file-selector-button` (+ `::-webkit-file-upload-button` for iOS
   < 14.5); keep 16px font so iOS does not zoom on focus. You cannot rename the button text or hide the
   trailing "No file chosen"; that is the price. [#17]
5. **CRITICAL and non-obvious: the input must carry real event listeners.** We attach passive
   `touchstart/touchend/pointerdown/pointerup/pointercancel/click/change` listeners that just `console.log`.
   iOS Safari only opens the dialog when it considers the element interactive, and a bare styled file input in
   this sheet did NOT qualify; attaching listeners flips it to interactive and the dialog opens. Found by
   accident via an on-screen diagnostic (#18). **DO NOT remove these listeners; they look like debug code but
   they are the fix.** [#19]

One-line rule: on iOS the file input must be genuinely **visible** AND carry **event listeners**, opened from
a genuine **touch-down** tap, in a sheet that dismisses on **pointerdown**.

Shared plumbing: `IFilePicker` (desktop `AvaloniaFilePicker` = native dialog; browser `BrowserFilePicker` ->
`interop.js`), threaded `MainWindowViewModel` -> `ScanPageViewModel` / `CalibrationPageViewModel`, exposed as
`vm.FilePicker`. Bytes come back in one `file.arrayBuffer()` read copied via `[JSMarshalAs<JSType.MemoryView>]
Span<byte>` (fast; avoids Avalonia's per-byte marshalling). `accept` restricted to raster formats the
OpenCV/Skia decoders handle. The scan slots wire the upload button's `PointerPressed`; drag-drop is separate.

## Other mobile / WASM constraints (durable)

1. **Android soft keyboard cannot type into an Avalonia `TextBox`** (delete works, typing does not; Avalonia
   #11662 / #11665). Every user input is a `NumericUpDown` stepper. Sensible per-field increment and floor, no
   `Maximum`. Increments: DPI 100, coupon 10, rings 1, measured card 0.02 mm.
2. **Touch devices: turn OFF text entry in the numeric fields** so tapping one raises no keyboard / caret.
   A head-supplied `IDeviceInfo.IsTouchPrimary` (browser reads `matchMedia('(pointer: coarse)')`; desktop app
   = false) drives `Classes.touchInput` + a style `NumericUpDown.touchInput /template/ TextBox { Focusable=
   False; IsHitTestVisible=False }`. Do NOT use `NumericUpDown.IsReadOnly`: its `OnSpinnerSpin` is gated on
   `AllowSpin && !IsReadOnly`, so read-only also kills the +/- buttons. Making only the inner `PART_TextBox`
   non-focusable leaves the spinner working. [#12]
3. **iOS Safari auto-zooms when a focused input font is under 16px** and the pinch-out is swallowed over the
   canvas. Fix (`app.css`): `.avalonia-input-element { font-size: 16px }`. [#10]
4. **Large uploads were slow / flaky.** Decode previews downscaled with `Bitmap.DecodeToWidth(stream,
   min(1000, srcWidth))` (a full 35 MP decode OOMs near the 256 MB heap); keep true size via
   `IPlatformImaging.GetImageSize`. The read is the slow part; the browser picker reads via `arrayBuffer()`
   in one bulk copy. Show a busy indicator BEFORE the read. [#9, #11]

## In-app debug console (new, #20)

Web app only (lives in `interop.js`; the desktop head never loads it). A discreet "debug" button in the
bottom-left opens a panel with the live log and **Copy / Share / Clear / Close**. It captures
`console.log/info/warn/error`, uncaught `window` errors, and unhandled promise rejections into a 500-line
buffer. **The C# side logs through the browser console (`BrowserConsoleLogger`), so its output appears here
too.** To debug something on a phone: add `console.log` in the JS or a `logger.Log...` in C#, deploy, have the
tester tap **debug -> Share** to send the whole log. Console hooks still call through to the real console.

## The big process lesson

**Do not claim an iOS fix works from desktop or synthetic-event testing.** Desktop always sends clean events;
real mobile touch differs (release becomes a cancel on scroll intent; iOS "clickability" heuristics; ghost
clicks). This session shipped several iOS "fixes" that passed on desktop and failed on the phone, burning many
cycles. When the target is iOS and there is no device here, **instrument the device** (the debug console, or a
temporary on-screen log) and read real signal, rather than guessing.

## App download size (measured from a Release build)

~**14 MB gzip** on first load (roughly 11-12 MB with GitHub Pages Brotli), ~41 MB uncompressed, cached after.
Biggest contributors (uncompressed): `System.Private.CoreLib` 4.6 MB, `ScanNTune.UI` 4.4 MB (embeds the coupon
STL + compiled XAML), `System.Private.Xml` 3.0 MB, `dotnet.native.wasm` 2.9 MB (the runtime + the OpenCV
native code linked in), `Avalonia.Base` 2.2 MB, `Avalonia.Fonts.Inter` 1.8 MB, `MathNet.Numerics` 1.5 MB,
ICU 1.1 MB, `OpenCvSharp` 1.0 MB. Plausible slimming (~5-7 MB): subset/drop the Inter font, find what drags in
`System.Private.Xml` + `System.Data.Common`, and `InvariantGlobalization` to drop ICU.

## Deploy warning (benign)

GitHub Actions "Deploy web app" emits two `IL2026` warnings from `LocalStorageCalibrationStore.cs` (reflection
JSON under trimming). Not a failure and not a runtime problem: the calibration type lives in `ScanNTune.Core`,
rooted against trimming, and `JsonSerializerIsReflectionEnabledByDefault=true`. Optional clean fix: a
`JsonSerializerContext`.

## Testing setup and gotchas

- **Android over USB:** enable USB debugging, desktop Chrome `chrome://inspect/#devices` -> Port forwarding ->
  `5235` -> `localhost:5235`; open `http://localhost:5235` on the phone (localhost is a secure context, needed
  for the picker). On-screen readouts beat fighting remote DevTools.
- **iOS:** no easy local path from Windows (Safari remote debugging needs a Mac). Use the in-app debug console
  above, or a real-device cloud lab (BrowserStack / LambdaTest).
- **Local dev server:** `dotnet run --project src/ScanNTune.Browser` (or the Claude preview `browser-wasm`
  profile on port 5235). Debug wasm is interpreted and much slower than the deploy. Note: the deploy is NOT
  AOT: the csproj sets `WasmBuildNative=true` (relinks the native runtime with OpenCV via emscripten) but
  there is no `RunAOTCompilation`, so managed code runs interpreted.
- **Port 5235 gotcha:** rapid stop/start leaves zombie `WasmAppHost` processes squatting 5235, and the harness
  rewrites `Properties/launchSettings.json` to 5236 (a mismatch that makes the preview silently fail). If the
  preview will not bind: kill dotnet processes matching `ScanNTune.Browser|WasmAppHost`, confirm 5235 is free,
  `git checkout -- src/ScanNTune.Browser/Properties/launchSettings.json`, then start once and let it build.
  Never commit the 5236 change.
- The Claude preview `preview_screenshot` sometimes times out on a full-screen fixed overlay (e.g. the debug
  panel open); it is a screenshot-tool quirk, not an app hang. Verify state with `preview_eval` instead.
- Release trimming is mandatory for the wasm runtime to start; `<TrimmerRootAssembly Include="Autofac" />` is
  required or the container throws at startup (black screen). Do not "simplify" the csproj wasm workarounds.

## Process rules that bit during the session

- No direct commits to `master`; every change is a PR opened with `gh`, owner-approved in chat first, PR title
  reads as a release-note sentence, labeled `feature` or `fix`/`bug` (diagnostics/tooling stay unlabeled). No
  AI attribution anywhere in git/GitHub. No em-dash and no hyphen-as-dash anywhere.
- Multi-file changes get a medium `/code-review` before commit, every finding dispositioned.
- Stop any running `ScanNTune.App` before building the desktop head (it locks `ScanNTune.UI.dll`).
- The working tree sometimes shows a foreign line-ending-only `MainWindow.axaml` and the 5236
  `launchSettings.json`, plus this `HANDOFF.md` is untracked; stage only the intended files.
