using System;
using System.Globalization;
using System.IO;
using System.Threading.Tasks;
using CommunityToolkit.Mvvm.ComponentModel;
using CommunityToolkit.Mvvm.Input;
using Microsoft.Extensions.Logging;
using OpenCvSharp;
using ScanNTune.Core.Calibration;
using ScanNTune.UI.Platform;

namespace ScanNTune.UI.ViewModels;

/// <summary>
/// The one-time scanner-calibration page. The user enters the reference card's measured long side and
/// the scan DPI, loads a scan of it, and the engine auto-detects the card edges to recover the true
/// px/mm. Quality checks (edge straightness, parallelism, and detected-size vs entered-size) surface
/// a bad scan or a mistyped value before it is saved. Saving persists the calibration and returns.
/// </summary>
public partial class CalibrationPageViewModel : ViewModelBase
{
    private const double IsoLongMm = 85.60;
    private const double IsoToleranceMm = 0.25;
    private const double MaxSizeMismatchMm = 0.3;

    private readonly IScaleReferenceMeasurer _measurer;
    private readonly ICalibrationStore _store;
    private readonly IPlatformImaging _imaging;
    private readonly Action _onDone;
    private readonly ILogger<CalibrationPageViewModel> _logger;
    private ScaleReferenceResult? _result;
    private bool _initialized;

    // Stepper-driven (NumericUpDown) rather than free text so the fields work on the Android browser, where
    // the soft keyboard can't commit typed characters. Defaults to the ISO ID-1 nominal (rounded to 85.5) so a
    // mobile user is not forced to step up from blank in 0.1 mm increments; they can still adjust to a
    // calipered value. Nullable so the field can be cleared.
    [ObservableProperty]
    private decimal? _measuredMm = 85.5m;

    [ObservableProperty]
    private decimal? _dpi = 600m;

    [ObservableProperty]
    private bool _isDetecting;

    [ObservableProperty]
    private bool _isError;

    [ObservableProperty]
    private string _statusText = string.Empty;

    [ObservableProperty]
    private bool _hasResult;

    [ObservableProperty]
    private string _pxPerMmText = string.Empty;

    [ObservableProperty]
    private string _effectiveDpiText = string.Empty;

    [ObservableProperty]
    private string _percentText = string.Empty;

    [ObservableProperty]
    private string _edgeQualityText = string.Empty;

    [ObservableProperty]
    private string _sizeSentence = string.Empty;

    [ObservableProperty]
    private bool _sizeCheckOk;

    [ObservableProperty]
    private bool _saved;

    public CalibrationPageViewModel(IScaleReferenceMeasurer measurer, ICalibrationStore store,
        IPlatformImaging imaging, Action onDone, ILogger<CalibrationPageViewModel> logger)
    {
        _measurer = measurer;
        _store = store;
        _imaging = imaging;
        _onDone = onDone;
        _logger = logger;

        // Open "Recalibrate" on the current calibration — pre-fill the card's size and DPI and show
        // its detected result — instead of a blank form.
        ScannerCalibration? existing = store.Load();
        if (existing is not null)
        {
            _result = new ScaleReferenceResult(
                Success: true,
                PxPerMm: existing.PxPerMm,
                MeasuredWidthPx: existing.MeasuredWidthPx,
                DetectedMm: existing.Dpi > 0 ? existing.MeasuredWidthPx / (existing.Dpi / 25.4) : 0,
                StraightnessPx: existing.StraightnessPx,
                ParallelismDegrees: existing.ParallelismDegrees,
                EdgePointCount: 0);
            MeasuredMm = (decimal)existing.ReferenceMm;
            Dpi = (decimal)existing.Dpi;
            Recompute();
            // Reflect the stored state only if the prefill still passes the input checks — a stored
            // calibration outside today's bounds must not show a saved checkmark over hidden figures.
            Saved = HasResult;
        }
        _initialized = true;
    }

    public bool HasStatus => !string.IsNullOrEmpty(StatusText);

    public bool CanUpload => TryInputs(out _, out _);

    public bool IsoSanityWarn =>
        MeasuredMm is { } m && (double)m > 0 && Math.Abs((double)m - IsoLongMm) > IsoToleranceMm;

    public string IsoSanityText
    {
        get
        {
            if (MeasuredMm is not { } m || (double)m <= 0)
                return "Enter your calipered value.";
            double v = (double)m;
            double d = v - IsoLongMm;
            if (Math.Abs(d) <= IsoToleranceMm)
                return "In range for an ISO card (≈85.60 mm).";
            return $"{d.ToString("+0.00;-0.00", CultureInfo.InvariantCulture)} mm vs ISO 85.60. Re-check the caliper.";
        }
    }

    /// <summary>Loads the reference scan from its encoded bytes and auto-detects the card off the UI thread.</summary>
    public async Task LoadScanAsync(string name, byte[] data)
    {
        if (!TryInputs(out double mm, out double dpi))
        {
            IsError = true;
            StatusText = "Enter your measured size and a DPI of at least 50 first.";
            return;
        }

        // The view owns IsDetecting (it turns the busy indicator on before the file read and clears it when
        // this returns), so it already covers this detection too.
        IsError = false;
        HasResult = false;
        StatusText = "Detecting the card…";
        try
        {
            ScaleReferenceResult res = await Task.Run(() =>
            {
                using Mat image = _imaging.DecodeBgr(data);
                return _measurer.Measure(image, mm, dpi);
            });
            if (!res.Success)
            {
                _result = null;
                IsError = true;
                StatusText = res.Message ?? "Couldn't detect the card in that scan.";
                return;
            }
            _result = res;
            StatusText = string.Empty;
            Recompute(); // sets HasResult (inputs are valid at this point)
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Couldn't read the card scan {Name}.", name);
            _result = null;
            IsError = true;
            StatusText = $"Couldn't read the scan: {ex.Message}";
        }
    }

    /// <summary>
    /// Re-derives the displayed figures from the (fixed) detected edge width and the current mm/DPI,
    /// so editing either field after a detection updates the result without re-scanning.
    /// </summary>
    private void Recompute()
    {
        if (_result is null)
            return;
        if (!TryInputs(out double mm, out double dpi))
        {
            // Inputs went incomplete after a detection — hide the now-stale result (and Save) until
            // a valid mm/DPI is entered again.
            HasResult = false;
            return;
        }

        double widthPx = _result.MeasuredWidthPx;
        double pxPerMm = widthPx / mm;
        double detectedMm = widthPx / (dpi / 25.4);
        double sizeDiff = Math.Abs(detectedMm - mm);

        PxPerMmText = pxPerMm.ToString("0.000", CultureInfo.InvariantCulture);
        EffectiveDpiText = (pxPerMm * 25.4).ToString("0", CultureInfo.InvariantCulture);
        PercentText = ((pxPerMm / (dpi / 25.4) - 1.0) * 100.0).ToString("+0.000;-0.000", CultureInfo.InvariantCulture) + "%";
        EdgeQualityText = $"Edges straight to {_result.StraightnessPx.ToString("0.00", CultureInfo.InvariantCulture)} px, " +
                          $"parallel to {_result.ParallelismDegrees.ToString("0.000", CultureInfo.InvariantCulture)}°.";
        SizeCheckOk = sizeDiff < MaxSizeMismatchMm;
        string detected = detectedMm.ToString("0.00", CultureInfo.InvariantCulture);
        string entered = mm.ToString("0.00", CultureInfo.InvariantCulture);
        SizeSentence = SizeCheckOk
            ? $"Detected {detected} mm, matches your {entered} mm."
            : $"Detected {detected} mm doesn't match your {entered} mm. Re-check the DPI and your " +
              "measurement. Printed artwork near the card edge can also mislead the detection; a plain edge works best.";
        HasResult = true;
        Persist();
    }

    /// <summary>
    /// Saves automatically once a scan is detected and its size checks out — there is no separate
    /// save step. A size-mismatched detection (wrong DPI or a mistyped reference) is NOT persisted,
    /// so it can't silently overwrite a good calibration.
    /// </summary>
    private void Persist()
    {
        if (!_initialized || _result is null || !TryInputs(out double mm, out double dpi) || !SizeCheckOk)
        {
            Saved = false;
            return;
        }

        var calibration = new ScannerCalibration(
            PxPerMm: _result.MeasuredWidthPx / mm,
            Dpi: dpi,
            ReferenceMm: mm,
            MeasuredWidthPx: _result.MeasuredWidthPx,
            StraightnessPx: _result.StraightnessPx,
            ParallelismDegrees: _result.ParallelismDegrees,
            CalibratedUtc: DateTime.UtcNow);
        try
        {
            _store.Save(calibration);
            Saved = true;
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Couldn't save the scanner calibration.");
            Saved = false;
            IsError = true;
            StatusText = $"Couldn't save the calibration: {ex.Message}";
        }
    }

    [RelayCommand]
    private void Back() => _onDone();

    /// <summary>Logs a file-open/read failure surfaced by the view's storage glue.</summary>
    public void LogError(string message, Exception ex) => _logger.LogError(ex, "{Message}", message);

    partial void OnStatusTextChanged(string value) => OnPropertyChanged(nameof(HasStatus));

    partial void OnMeasuredMmChanged(decimal? value)
    {
        ClearErrorOnEdit();
        OnPropertyChanged(nameof(IsoSanityText));
        OnPropertyChanged(nameof(IsoSanityWarn));
        OnPropertyChanged(nameof(CanUpload));
        Recompute();
    }

    partial void OnDpiChanged(decimal? value)
    {
        ClearErrorOnEdit();
        OnPropertyChanged(nameof(CanUpload));
        Recompute();
    }

    // A prior detection error shouldn't linger over now-valid inputs.
    private void ClearErrorOnEdit()
    {
        if (IsError)
        {
            IsError = false;
            StatusText = string.Empty;
        }
    }

    private bool TryInputs(out double mm, out double dpi)
    {
        // A DPI floor of 50 rules out a mistyped value; there is no ceiling, so an unusually high-resolution
        // scan is never rejected. The steppers already prevent non-numeric or negative entries.
        mm = MeasuredMm is { } m ? (double)m : 0;
        dpi = Dpi is { } d ? (double)d : 0;
        return mm > 0 && dpi >= 50;
    }
}
