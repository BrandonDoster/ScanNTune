using System;
using System.Collections.Generic;
using System.Globalization;
using Avalonia.Media.Imaging;
using CommunityToolkit.Mvvm.ComponentModel;
using CommunityToolkit.Mvvm.Input;
using ScanNTune.Core;
using ScanNTune.Core.Output;

namespace ScanNTune.App.ViewModels;

/// <summary>
/// The results page: the scanner-cancelled printer figures (from combining the two quarter-turn
/// scans), the scanner's own error as a diagnostic, and the ready-to-paste firmware/slicer
/// corrections. A "start over" action returns to the scan page.
/// </summary>
public partial class ResultsPageViewModel : ViewModelBase
{
    private readonly TwoScanResult _result;
    private readonly CouponSpec _coupon;
    private readonly ICorrectionFormatter _corrections;
    private readonly Action _onStartOver;

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

    [ObservableProperty]
    private bool _scannerExpanded;

    public ResultsPageViewModel(
        TwoScanResult result,
        CouponSpec coupon,
        Bitmap? overlayA,
        Bitmap? overlayB,
        ICorrectionFormatter corrections,
        Action onStartOver)
    {
        _result = result;
        _coupon = coupon;
        _corrections = corrections;
        _onStartOver = onStartOver;
        OverlayA = overlayA;
        OverlayB = overlayB;

        _selectedSkewFlavour = corrections.SkewFlavours[0];
        _selectedSizeFlavour = corrections.SizeFlavours[0];
        string? label = corrections.CurrentValueLabel(_selectedSizeFlavour);
        _showCurrentInputs = label is not null;
        _currentLabel = label ?? string.Empty;

        RecomputeSkew();
        RecomputeSize();
    }

    public Bitmap? OverlayA { get; }

    public Bitmap? OverlayB { get; }

    public IReadOnlyList<string> SkewFlavours => _corrections.SkewFlavours;

    public IReadOnlyList<string> SizeFlavours => _corrections.SizeFlavours;

    private CalibrationResult Combined => _result.Combined;

    public string XScaleText => $"{Combined.XScalePercent:+0.000;-0.000;0.000} %";
    public string YScaleText => $"{Combined.YScalePercent:+0.000;-0.000;0.000} %";
    public string SkewText => $"{Combined.SkewDegrees:+0.000;-0.000;0.000}°";

    /// <summary>The one-line glance under the tiles: coverage, fit and the quarter-turn check.</summary>
    public string SummaryText =>
        $"{Combined.RingsDetected} rings · {Combined.RmsResidualPx:0.00} px fit · {_result.RelativeRotationDegrees:0}° turn";

    public bool RotationLooksValid => _result.RotationLooksValid;

    public string ScanADetailText =>
        $"Scan 1    X {_result.ScanA.XScalePercent:+0.00;-0.00}%    Y {_result.ScanA.YScalePercent:+0.00;-0.00}%    skew {_result.ScanA.SkewDegrees:+0.00;-0.00}°";

    public string ScanBDetailText =>
        $"Scan 2    X {_result.ScanB.XScalePercent:+0.00;-0.00}%    Y {_result.ScanB.YScalePercent:+0.00;-0.00}%    skew {_result.ScanB.SkewDegrees:+0.00;-0.00}°";

    public string ScannerDetailText =>
        $"Scanner    X/Y bias {_result.Scanner.AnisotropyPercent:+0.00;-0.00}%    skew {_result.Scanner.SkewDegrees:+0.00;-0.00}°";

    public bool RotationWarningVisible => !_result.RotationLooksValid;

    public string RotationWarningText =>
        $"The two scans are {_result.RelativeRotationDegrees:0}° apart, not a quarter-turn. " +
        "The scanner error was not cancelled. Turn the coupon ~90° between scans and try again.";

    [RelayCommand]
    private void StartOver() => _onStartOver();

    [RelayCommand]
    private void ToggleScanner() => ScannerExpanded = !ScannerExpanded;

    private void RecomputeSkew()
    {
        Correction correction = _corrections.Skew(SelectedSkewFlavour, Combined.SkewDegrees, _coupon);
        SkewCode = correction.Code;
        SkewHint = correction.Hint;
    }

    private void RecomputeSize()
    {
        double? currentX = ShowCurrentInputs && double.TryParse(CurrentXText, NumberStyles.Float, CultureInfo.InvariantCulture, out double x) ? x : null;
        double? currentY = ShowCurrentInputs && double.TryParse(CurrentYText, NumberStyles.Float, CultureInfo.InvariantCulture, out double y) ? y : null;

        Correction correction = _corrections.Size(SelectedSizeFlavour, Combined.XScalePercent, Combined.YScalePercent, currentX, currentY);
        SizeCode = correction.Code;
        SizeHint = correction.Hint;
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
