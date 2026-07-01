using System;
using System.Collections.Generic;
using System.Globalization;
using System.IO;
using System.Threading.Tasks;
using Avalonia.Media.Imaging;
using CommunityToolkit.Mvvm.ComponentModel;
using CommunityToolkit.Mvvm.Input;
using PrinterCalibrate.Core;
using PrinterCalibrate.Core.Output;

namespace PrinterCalibrate.App.ViewModels;

public partial class MainWindowViewModel : ViewModelBase
{
    private readonly ICouponAnalyzer _analyzer;
    private readonly IOverlayRenderer _overlayRenderer;
    private readonly ICorrectionFormatter _corrections;

    [ObservableProperty]
    private Bitmap? _scanImage;

    [ObservableProperty]
    private Bitmap? _overlayImage;

    [ObservableProperty]
    private string? _scanPath;

    [ObservableProperty]
    private string _dpiText = "1200";

    [ObservableProperty]
    private string _baselineMmText = "100";

    [ObservableProperty]
    private string _gridText = "5";

    [ObservableProperty]
    private bool _scannedFlipped;

    [ObservableProperty]
    private string _statusText = "Open a scan of the calibration coupon to begin.";

    [ObservableProperty]
    private CalibrationResult? _result;

    // --- Corrections (per-flavour, chosen via the dropdowns) ---
    [ObservableProperty]
    private string _selectedSkewFlavour;

    [ObservableProperty]
    private string _selectedSizeFlavour;

    [ObservableProperty]
    private string _skewCode = string.Empty;

    [ObservableProperty]
    private string _skewHint = string.Empty;

    [ObservableProperty]
    private string _sizeCode = string.Empty;

    [ObservableProperty]
    private string _sizeHint = string.Empty;

    [ObservableProperty]
    private bool _showCurrentInputs;

    [ObservableProperty]
    private string _currentLabel = string.Empty;

    [ObservableProperty]
    private string _currentXText = string.Empty;

    [ObservableProperty]
    private string _currentYText = string.Empty;

    public MainWindowViewModel() : this(new CouponAnalyzer(), new OverlayRenderer(), new CorrectionFormatter())
    {
    }

    public MainWindowViewModel(ICouponAnalyzer analyzer, IOverlayRenderer overlayRenderer, ICorrectionFormatter corrections)
    {
        _analyzer = analyzer;
        _overlayRenderer = overlayRenderer;
        _corrections = corrections;
        _selectedSkewFlavour = corrections.SkewFlavours[0];
        _selectedSizeFlavour = corrections.SizeFlavours[0];
        string? label = corrections.CurrentValueLabel(_selectedSizeFlavour);
        _showCurrentInputs = label is not null;
        _currentLabel = label ?? string.Empty;
    }

    public bool HasScan => ScanImage is not null;

    public bool HasResult => Result is not null;

    public IReadOnlyList<string> SkewFlavours => _corrections.SkewFlavours;

    public IReadOnlyList<string> SizeFlavours => _corrections.SizeFlavours;

    /// <summary>The annotated overlay when available, otherwise the raw scan.</summary>
    public Bitmap? DisplayImage => OverlayImage ?? ScanImage;

    public string XScaleText => Result is null ? "—" : $"{Result.XScalePercent:+0.000;-0.000;0.000} %";
    public string YScaleText => Result is null ? "—" : $"{Result.YScalePercent:+0.000;-0.000;0.000} %";
    public string SkewText   => Result is null ? "—" : $"{Result.SkewDegrees:+0.000;-0.000;0.000}°";
    public string RingsText  => Result is null ? "—" : Result.RingsDetected.ToString(CultureInfo.InvariantCulture);

    /// <summary>Load a scanned image from disk and reset any previous result.</summary>
    public void LoadScan(string path)
    {
        try
        {
            var bitmap = new Bitmap(path);
            ScanImage?.Dispose();
            ScanImage = bitmap;
            OverlayImage?.Dispose();
            OverlayImage = null;
            ScanPath = path;
            Result = null;
            StatusText = $"Loaded {Path.GetFileName(path)} " +
                         $"({bitmap.PixelSize.Width}×{bitmap.PixelSize.Height} px). Ready to analyze.";
        }
        catch (Exception ex)
        {
            StatusText = $"Could not load image: {ex.Message}";
        }
    }

    [RelayCommand(CanExecute = nameof(CanAnalyze))]
    private async Task AnalyzeAsync()
    {
        if (ScanPath is not { } path)
            return;

        StatusText = "Analyzing…";
        try
        {
            double? pxPerMm = double.TryParse(DpiText, NumberStyles.Float, CultureInfo.InvariantCulture, out double dpi) && dpi > 0
                ? dpi / 25.4
                : null;

            var options = new AnalysisOptions { PxPerMm = pxPerMm, Coupon = BuildCoupon(), ScannedFlipped = ScannedFlipped };
            (CalibrationResult result, byte[] overlayPng) = await Task.Run(() =>
            {
                CalibrationResult r = _analyzer.Analyze(path, options);
                return (r, _overlayRenderer.RenderPng(path, r));
            });

            Result = result;
            OverlayImage?.Dispose();
            using (var stream = new MemoryStream(overlayPng))
                OverlayImage = new Bitmap(stream);

            string scaleMode = pxPerMm is null ? " (relative — set DPI for absolute scale)" : string.Empty;
            string orient = result.Orientation.FiducialFound ? "fiducial found" : "fiducial not found (assumed upright)";
            StatusText = $"Done. {result.RingsDetected} rings, {orient}, fit residual {result.RmsResidualPx:0.00} px.{scaleMode}";
        }
        catch (Exception ex)
        {
            Result = null;
            StatusText = $"Analysis failed: {ex.Message}";
        }
    }

    private bool CanAnalyze() => HasScan;

    private CouponSpec BuildCoupon()
    {
        var coupon = new CouponSpec();
        if (double.TryParse(BaselineMmText, NumberStyles.Float, CultureInfo.InvariantCulture, out double baseline) && baseline > 0)
            coupon = coupon with { BaselineMm = baseline };
        if (int.TryParse(GridText, NumberStyles.Integer, CultureInfo.InvariantCulture, out int grid) && grid >= 2)
            coupon = coupon with { GridN = grid };
        return coupon;
    }

    private void RecomputeSkew()
    {
        if (Result is null)
        {
            SkewCode = string.Empty;
            SkewHint = string.Empty;
            return;
        }
        Correction correction = _corrections.Skew(SelectedSkewFlavour, Result.SkewDegrees, BuildCoupon());
        SkewCode = correction.Code;
        SkewHint = correction.Hint;
    }

    private void RecomputeSize()
    {
        if (Result is null)
        {
            SizeCode = string.Empty;
            SizeHint = string.Empty;
            return;
        }

        double? currentX = ShowCurrentInputs && double.TryParse(CurrentXText, NumberStyles.Float, CultureInfo.InvariantCulture, out double x) ? x : null;
        double? currentY = ShowCurrentInputs && double.TryParse(CurrentYText, NumberStyles.Float, CultureInfo.InvariantCulture, out double y) ? y : null;

        Correction correction = _corrections.Size(SelectedSizeFlavour, Result.XScalePercent, Result.YScalePercent, currentX, currentY);
        SizeCode = correction.Code;
        SizeHint = correction.Hint;
    }

    partial void OnScanImageChanged(Bitmap? value)
    {
        OnPropertyChanged(nameof(HasScan));
        OnPropertyChanged(nameof(DisplayImage));
        AnalyzeCommand.NotifyCanExecuteChanged();
    }

    partial void OnOverlayImageChanged(Bitmap? value) => OnPropertyChanged(nameof(DisplayImage));

    partial void OnResultChanged(CalibrationResult? value)
    {
        OnPropertyChanged(nameof(HasResult));
        OnPropertyChanged(nameof(XScaleText));
        OnPropertyChanged(nameof(YScaleText));
        OnPropertyChanged(nameof(SkewText));
        OnPropertyChanged(nameof(RingsText));
        RecomputeSkew();
        RecomputeSize();
    }

    partial void OnSelectedSkewFlavourChanged(string value) => RecomputeSkew();

    partial void OnSelectedSizeFlavourChanged(string value)
    {
        string? label = _corrections.CurrentValueLabel(value);
        ShowCurrentInputs = label is not null;
        CurrentLabel = label ?? string.Empty;
        RecomputeSize();
    }

    partial void OnCurrentXTextChanged(string value) => RecomputeSize();

    partial void OnCurrentYTextChanged(string value) => RecomputeSize();
}
