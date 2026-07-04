using System;
using System.Reflection;
using Avalonia.Media.Imaging;
using CommunityToolkit.Mvvm.ComponentModel;
using Microsoft.Extensions.Logging;
using ScanNTune.Core;
using ScanNTune.Core.Calibration;
using ScanNTune.Core.Combining;
using ScanNTune.Core.Output;
using ScanNTune.UI.DependencyInjection;
using ScanNTune.UI.Platform;

namespace ScanNTune.UI.ViewModels;

/// <summary>
/// The application shell. It owns the engine services and the in-window navigation: a single
/// <see cref="CurrentPage"/> is swapped between the scan-input page and the results page (resolved
/// to a view by the <c>ViewLocator</c>). It is head-agnostic: platform behaviour arrives through
/// <see cref="IPlatformImaging"/> and <see cref="ICouponExporter"/>, so the desktop and WebAssembly
/// heads share this exact shell.
/// </summary>
public partial class MainWindowViewModel : ViewModelBase
{
    private readonly ICouponAnalyzer _analyzer;
    private readonly IScanCombiner _combiner;
    private readonly IOverlayRenderer _overlayRenderer;
    private readonly ICorrectionFormatter _corrections;
    private readonly IScaleReferenceMeasurer _measurer;
    private readonly ICalibrationStore _calibrationStore;
    private readonly IPlatformImaging _imaging;
    private readonly ICouponExporter _couponExporter;
    private readonly ILoggerFactory _loggerFactory;

    [ObservableProperty]
    private ViewModelBase _currentPage = null!;

    /// <summary>Set once a background update has been downloaded and staged for the next restart.</summary>
    [ObservableProperty]
    private bool _updateReady;

    public string UpdateStatusText => "Update ready, restart to apply";

    /// <summary>Display version for the title bar, e.g. "v0.1.24" — stamped by Nerdbank.GitVersioning.</summary>
    public string AppVersion
    {
        get
        {
            Assembly assembly = typeof(MainWindowViewModel).Assembly;
            string? informational = assembly
                .GetCustomAttribute<AssemblyInformationalVersionAttribute>()?.InformationalVersion;
            string version = informational?.Split('+', 2)[0]
                ?? assembly.GetName().Version?.ToString(3)
                ?? "0.0.0";
            return $"v{version}";
        }
    }

    // Design-time only: lets the XAML previewer build the shell from the same UiModule registrations the app
    // uses at runtime (with stub platform services and silent logging), so it never drifts from a hand-built
    // parallel graph. Never used at runtime (the container resolves the constructor below).
    public MainWindowViewModel() : this(new DesignGraph())
    {
    }

    private MainWindowViewModel(DesignGraph design)
        : this(design.Get<ICouponAnalyzer>(), design.Get<IScanCombiner>(), design.Get<IOverlayRenderer>(),
               design.Get<ICorrectionFormatter>(), design.Get<IScaleReferenceMeasurer>(), design.Get<ICalibrationStore>(),
               design.Get<IPlatformImaging>(), design.Get<ICouponExporter>(), design.Get<ILoggerFactory>())
    {
    }

    public MainWindowViewModel(
        ICouponAnalyzer analyzer,
        IScanCombiner combiner,
        IOverlayRenderer overlayRenderer,
        ICorrectionFormatter corrections,
        IScaleReferenceMeasurer measurer,
        ICalibrationStore calibrationStore,
        IPlatformImaging imaging,
        ICouponExporter couponExporter,
        ILoggerFactory loggerFactory)
    {
        _analyzer = analyzer;
        _combiner = combiner;
        _overlayRenderer = overlayRenderer;
        _corrections = corrections;
        _measurer = measurer;
        _calibrationStore = calibrationStore;
        _imaging = imaging;
        _couponExporter = couponExporter;
        _loggerFactory = loggerFactory;
        CurrentPage = CreateScanPage();
    }

    public void MarkUpdateReady() => UpdateReady = true;

    private ScanPageViewModel CreateScanPage() =>
        new(_analyzer, _combiner, _overlayRenderer, _calibrationStore, _imaging, _couponExporter,
            ShowResults, ShowCalibration, _loggerFactory.CreateLogger<ScanPageViewModel>());

    private void ShowResults(TwoScanResult result, CouponSpec coupon, Bitmap? overlayA, Bitmap? overlayB) =>
        CurrentPage = new ResultsPageViewModel(result, coupon, overlayA, overlayB, _corrections, StartOver);

    private void ShowCalibration() =>
        CurrentPage = new CalibrationPageViewModel(_measurer, _calibrationStore, _imaging, StartOver,
            _loggerFactory.CreateLogger<CalibrationPageViewModel>());

    // Rebuilding the scan page re-reads the stored calibration, so the status pill reflects a
    // just-saved calibration on return.
    private void StartOver() => CurrentPage = CreateScanPage();
}
