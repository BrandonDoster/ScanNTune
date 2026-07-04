using System;
using System.Globalization;
using System.IO;
using System.Threading.Tasks;
using Avalonia.Media.Imaging;
using CommunityToolkit.Mvvm.ComponentModel;
using CommunityToolkit.Mvvm.Input;
using Microsoft.Extensions.Logging;
using OpenCvSharp;
using ScanNTune.Core;
using ScanNTune.Core.Calibration;
using ScanNTune.Core.Combining;
using ScanNTune.Core.Output;
using ScanNTune.UI.Platform;

namespace ScanNTune.UI.ViewModels;

/// <summary>
/// The two-scan input page: the user loads two scans of the same coupon (the second taken after a
/// quarter-turn), sets the DPI/coupon geometry, and analyzes. Both scans are required: a single scan
/// cannot separate the printer's error from the scanner's, so there is deliberately no one-scan path.
/// Scans are held as encoded bytes and decoded through <see cref="IPlatformImaging"/>, so the same view
/// model runs on the desktop (OpenCV codecs) and in the browser (Skia).
/// </summary>
public partial class ScanPageViewModel : ViewModelBase
{
    private readonly ICouponAnalyzer _analyzer;
    private readonly IScanCombiner _combiner;
    private readonly IOverlayRenderer _overlayRenderer;
    private readonly ICalibrationStore _calibrationStore;
    private readonly IPlatformImaging _imaging;
    private readonly IFilePicker _filePicker;
    private readonly IDeviceInfo _deviceInfo;
    private readonly ICouponExporter _couponExporter;
    private readonly Action<TwoScanResult, CouponSpec, Bitmap?, Bitmap?> _onAnalyzed;
    private readonly Action _onCalibrate;
    private readonly ScannerCalibration? _calibration;
    private readonly ILogger<ScanPageViewModel> _logger;

    // A downscaled preview is decoded for display; the caption still shows the scan's true pixel size, kept here.
    private const int ThumbnailWidth = 1000;

    private byte[]? _scan1Data;
    private byte[]? _scan2Data;
    private string? _scan1Name;
    private string? _scan2Name;
    private (int Width, int Height)? _scan1Size;
    private (int Width, int Height)? _scan2Size;

    [ObservableProperty]
    private Bitmap? _scan1Thumb;

    [ObservableProperty]
    private Bitmap? _scan2Thumb;

    // Numeric fields are stepper-driven (NumericUpDown) rather than free text: on the Android browser the
    // soft keyboard can't commit typed characters (an Avalonia framework limitation), so the +/- spinners
    // are the reliable input. Nullable so DPI can be left blank for the anisotropy-and-skew-only path.
    [ObservableProperty]
    private decimal? _dpi = 1200m;

    [ObservableProperty]
    private decimal? _baselineMm = 100m;

    [ObservableProperty]
    private decimal? _grid = 5m;

    [ObservableProperty]
    private bool _isBusy;

    [ObservableProperty]
    private bool _scan1Loading;

    [ObservableProperty]
    private bool _scan2Loading;

    [ObservableProperty]
    private bool _isError;

    [ObservableProperty]
    private bool _scan1Failed;

    [ObservableProperty]
    private bool _scan2Failed;

    [ObservableProperty]
    private string _scan1Note = string.Empty;

    [ObservableProperty]
    private string _scan2Note = string.Empty;

    [ObservableProperty]
    private string _statusText = string.Empty;

    public ScanPageViewModel(
        ICouponAnalyzer analyzer,
        IScanCombiner combiner,
        IOverlayRenderer overlayRenderer,
        ICalibrationStore calibrationStore,
        IPlatformImaging imaging,
        IFilePicker filePicker,
        IDeviceInfo deviceInfo,
        ICouponExporter couponExporter,
        Action<TwoScanResult, CouponSpec, Bitmap?, Bitmap?> onAnalyzed,
        Action onCalibrate,
        ILogger<ScanPageViewModel> logger)
    {
        _analyzer = analyzer;
        _combiner = combiner;
        _overlayRenderer = overlayRenderer;
        _calibrationStore = calibrationStore;
        _imaging = imaging;
        _filePicker = filePicker;
        _deviceInfo = deviceInfo;
        _couponExporter = couponExporter;
        _onAnalyzed = onAnalyzed;
        _onCalibrate = onCalibrate;
        _logger = logger;
        _calibration = calibrationStore.Load();
    }

    // The view initiates the pick (it must run from the tap), so it reaches the head's picker through here.
    internal IFilePicker FilePicker => _filePicker;

    // On a touch device the numeric fields drop text entry (the view binds this) so tapping one cannot raise a
    // soft keyboard or leave an uneditable caret; the +/- steppers remain the input.
    public bool IsTouchDevice => _deviceInfo.IsTouchPrimary;

    public bool IsCalibrated => _calibration is not null;

    // Single status line under the step-1 header (the header already says "Calibrate scanner").
    public string CalibrationLineText => _calibration is null
        ? "Optional. Calibrate once for absolute X/Y scale. Skew and anisotropy work without it."
        : $"Calibrated · {_calibration.EffectiveDpi.ToString("0", CultureInfo.InvariantCulture)} dpi";

    public string CalibrateButtonText => _calibration is null ? "Calibrate scanner" : "Recalibrate";

    // A stored calibration assumes the coupon is scanned at the same DPI it was calibrated at (AnalyzeAsync
    // uses the calibrated px/mm directly), so remind the user of that exact resolution. Without a
    // calibration there is no DPI to anchor to, so the hint is hidden (see ScanDpiHint binding).
    public string ScanDpiHint => _calibration is null
        ? string.Empty
        : $"Scan both at {_calibration.Dpi.ToString("0", CultureInfo.InvariantCulture)} dpi.";

    [RelayCommand]
    private void Calibrate() => _onCalibrate();

    /// <summary>Hands the user the printable coupon STL through the head's platform exporter.</summary>
    [RelayCommand]
    private async Task GetCoupon()
    {
        try
        {
            await _couponExporter.ExportAsync();
        }
        catch (Exception ex)
        {
            ReportLoadError("Could not open the coupon", ex);
        }
    }

    public bool HasScan1 => Scan1Thumb is not null;

    public bool HasScan2 => Scan2Thumb is not null;

    public bool HasStatus => !string.IsNullOrEmpty(StatusText);

    public string Scan1Caption => Caption(_scan1Name, _scan1Size);

    public string Scan2Caption => Caption(_scan2Name, _scan2Size);

    private string Caption(string? name, (int Width, int Height)? size) =>
        name is null || size is not { } s
            ? string.Empty
            : $"{name} · {s.Width}×{s.Height}";

    /// <summary>Load the first (0°) scan from its encoded bytes; a bad image is surfaced, not thrown.</summary>
    public Task LoadScan1Async(string name, byte[] data) => LoadAsync(name, data, isFirst: true);

    /// <summary>Load the second (quarter-turned) scan.</summary>
    public Task LoadScan2Async(string name, byte[] data) => LoadAsync(name, data, isFirst: false);

    private async Task LoadAsync(string name, byte[] data, bool isFirst)
    {
        // The view turns the slot's busy spinner on before the file read and clears it when this returns, so it
        // already covers this decode too. Yield once so any pending state paints before the decode briefly
        // blocks the single wasm thread.
        IsError = false;
        await Task.Yield();
        try
        {
            // Decode the preview downscaled. A full-resolution decode of a large phone photo would allocate
            // tens to hundreds of MB on the single wasm thread near the heap ceiling: that is the multi-minute
            // wait and the intermittent out-of-memory that only shows on mobile. DecodeToWidth samples at the
            // codec level, so the preview stays small and fast. The true pixel size for the caption comes from
            // the image header via the platform imaging, so the downscale does not misreport the resolution.
            // Read the true size first (cheap header read): it feeds the caption, and getting it before the
            // decode means a bad header fails fast with no preview bitmap left orphaned. Decode the preview to
            // the smaller of the target and the source width, so a small scan stays crisp (never upscaled) while
            // a large photo is sampled down.
            (int Width, int Height) size = _imaging.GetImageSize(data);
            int targetWidth = size.Width > 0 ? Math.Min(ThumbnailWidth, size.Width) : ThumbnailWidth;
            using var stream = new MemoryStream(data);
            Bitmap bitmap = Bitmap.DecodeToWidth(stream, targetWidth);
            if (isFirst)
            {
                Scan1Thumb?.Dispose();
                Scan1Thumb = bitmap;
                _scan1Data = data;
                _scan1Name = name;
                _scan1Size = size;
                Scan1Failed = false;
                Scan1Note = string.Empty;
                OnPropertyChanged(nameof(HasScan1));
                OnPropertyChanged(nameof(Scan1Caption));
            }
            else
            {
                Scan2Thumb?.Dispose();
                Scan2Thumb = bitmap;
                _scan2Data = data;
                _scan2Name = name;
                _scan2Size = size;
                Scan2Failed = false;
                Scan2Note = string.Empty;
                OnPropertyChanged(nameof(HasScan2));
                OnPropertyChanged(nameof(Scan2Caption));
            }
            // The filename is shown in the slot itself, so the status line stays quiet on load: it's
            // reserved for transient states (analyzing, errors).
            StatusText = string.Empty;
            AnalyzeCommand.NotifyCanExecuteChanged();
        }
        catch (Exception ex)
        {
            ReportLoadError("Could not load image", ex);
        }
    }

    /// <summary>Logs a load/open failure and surfaces it on the status line. Called by the view's glue too.</summary>
    public void ReportLoadError(string message, Exception ex)
    {
        _logger.LogError(ex, "{Message}.", message);
        IsError = true;
        StatusText = $"{message}: {ex.Message}";
    }

    [RelayCommand(CanExecute = nameof(CanAnalyze))]
    private async Task AnalyzeAsync()
    {
        if (_scan1Data is not { } data1 || _scan2Data is not { } data2)
            return;

        IsBusy = true;
        IsError = false;
        Scan1Failed = false;
        Scan2Failed = false;
        Scan1Note = string.Empty;
        Scan2Note = string.Empty;
        AnalyzeCommand.NotifyCanExecuteChanged();
        StatusText = "Analyzing both scans…";
        // WebAssembly is single-threaded, so the analysis below runs on the UI thread and briefly blocks it;
        // yield once so the "Analyzing…" state and progress bar paint before that happens.
        await Task.Yield();
        try
        {
            // With a stored calibration, use the scanner's measured px/mm directly (the coupon is
            // scanned at the calibrated DPI); otherwise fall back to the entered nominal DPI/25.4
            // (anisotropy + skew stay correct either way). A blank DPI is the deliberate
            // anisotropy-and-skew-only path; the stepper's floor keeps any entered DPI realistic.
            double? pxPerMm;
            if (_calibration is not null)
                pxPerMm = _calibration.PxPerMm;
            else if (Dpi is { } dpi && dpi >= 50)
                pxPerMm = (double)dpi / 25.4;
            else
                pxPerMm = null;

            CouponSpec coupon = BuildCoupon();
            var options = new AnalysisOptions { PxPerMm = pxPerMm, Coupon = coupon };

            (TwoScanResult result, Bitmap overlayA, Bitmap overlayB) = await Task.Run(() =>
            {
                using Mat image1 = _imaging.DecodeBgr(data1);
                using Mat image2 = _imaging.DecodeBgr(data2);
                CalibrationResult a = AnalyzeScan(image1, options, isFirst: true);
                CalibrationResult b = AnalyzeScan(image2, options, isFirst: false);
                TwoScanResult combined = _combiner.Combine(a, b);
                Bitmap oa = RenderOverlayBitmap(image1, a);
                Bitmap ob = RenderOverlayBitmap(image2, b);
                return (combined, oa, ob);
            });

            StatusText = string.Empty;
            _onAnalyzed(result, coupon, overlayA, overlayB);
        }
        catch (ScanAnalysisException ex)
        {
            _logger.LogWarning("Scan analysis could not align {Which} scan ({Rings} rings): {Message}",
                ex.IsFirst ? "first" : "second", ex.RingCount, ex.Message);
            // Show what the failing scan DID capture, in its own slot, alongside the guidance.
            ShowScanFailure(ex);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Two-scan analysis failed.");
            IsError = true;
            StatusText = $"{ex.Message} Check the scan quality and that the coupon's two-solid marker is visible.";
        }
        finally
        {
            IsBusy = false;
            AnalyzeCommand.NotifyCanExecuteChanged();
        }
    }

    /// <summary>
    /// Analyze one scan. On a resolve failure, render the rings that WERE found (where the platform can
    /// encode them) and rethrow a <see cref="ScanAnalysisException"/> carrying that diagnostic.
    /// </summary>
    private CalibrationResult AnalyzeScan(Mat image, AnalysisOptions options, bool isFirst)
    {
        try
        {
            return _analyzer.Analyze(image, options);
        }
        catch (CouponAnalysisException ex)
        {
            using Mat overlay = _overlayRenderer.RenderDetectionOverlay(image, ex.DetectedRings);
            throw new ScanAnalysisException(isFirst, ex.DetectedRings.Count, ex.Message, MatToBitmap(overlay));
        }
    }

    private Bitmap RenderOverlayBitmap(Mat image, CalibrationResult result)
    {
        using Mat overlay = _overlayRenderer.RenderOverlay(image, result);
        return MatToBitmap(overlay);
    }

    // Turn a drawn BGR overlay into an Avalonia bitmap straight from its pixels, so no image codec is
    // needed: the wasm OpenCV build has no PNG encoder, but the drawing itself works on both platforms.
    private Bitmap MatToBitmap(Mat bgr)
    {
        using var bgra = new Mat();
        Cv2.CvtColor(bgr, bgra, ColorConversionCodes.BGR2BGRA);
        return new Bitmap(
            Avalonia.Platform.PixelFormats.Bgra8888,
            Avalonia.Platform.AlphaFormat.Opaque,
            bgra.Data,
            new Avalonia.PixelSize(bgra.Width, bgra.Height),
            new Avalonia.Vector(96, 96),
            (int)bgra.Step());
    }

    private void ShowScanFailure(ScanAnalysisException ex)
    {
        IsError = true;
        string which = ex.IsFirst ? "First scan" : "Second scan";
        string note = ex.RingCount > 0
            ? $"⚠ {ex.RingCount} rings found, but couldn't align them"
            : "⚠ nothing detected";
        Bitmap? diagnostic = ex.Diagnostic;

        if (ex.IsFirst)
        {
            if (diagnostic is not null)
            {
                Scan1Thumb?.Dispose();
                Scan1Thumb = diagnostic;
            }
            Scan1Failed = true;
            Scan1Note = note;
            OnPropertyChanged(nameof(HasScan1));
        }
        else
        {
            if (diagnostic is not null)
            {
                Scan2Thumb?.Dispose();
                Scan2Thumb = diagnostic;
            }
            Scan2Failed = true;
            Scan2Note = note;
            OnPropertyChanged(nameof(HasScan2));
        }

        StatusText = ex.RingCount > 0
            ? $"{which}: found {ex.RingCount} rings but couldn't locate the orientation marker. " +
              "Check that both solid marker rings and the whole coupon are in the scan (green circles show what was detected)."
            : $"{which}: no rings detected. The coupon may be out of frame or too faint. Check the scan contrast and DPI.";
    }

    private bool CanAnalyze() => !IsBusy && _scan1Data is not null && _scan2Data is not null;

    partial void OnStatusTextChanged(string value) => OnPropertyChanged(nameof(HasStatus));

    /// <summary>
    /// Builds the coupon spec from the stepper fields. Each field carries a valid default and the steppers
    /// clamp to a sensible floor (baseline &gt; 0, at least two rings a side), so a blank field simply keeps
    /// the <see cref="CouponSpec"/> default rather than needing a separate validation error path.
    /// </summary>
    private CouponSpec BuildCoupon()
    {
        var coupon = new CouponSpec();
        if (BaselineMm is { } baseline && baseline > 0)
            coupon = coupon with { BaselineMm = (double)baseline };
        if (Grid is { } grid && grid >= 2)
            coupon = coupon with { GridN = (int)Math.Round(grid) };
        return coupon;
    }
}
