using System;
using Avalonia.Media.Imaging;
using CommunityToolkit.Mvvm.ComponentModel;
using PrinterCalibrate.Core;
using PrinterCalibrate.Core.Combining;
using PrinterCalibrate.Core.Output;

namespace PrinterCalibrate.App.ViewModels;

/// <summary>
/// The application shell. It owns the engine services and the in-window navigation: a single
/// <see cref="CurrentPage"/> is swapped between the scan-input page and the results page (resolved
/// to a view by the <c>ViewLocator</c>). Keeping navigation to one hosted page — rather than
/// separate windows or dialogs — is what makes a later Avalonia/WebAssembly port a UI-hosting swap.
/// </summary>
public partial class MainWindowViewModel : ViewModelBase
{
    private readonly ICouponAnalyzer _analyzer;
    private readonly IScanCombiner _combiner;
    private readonly IOverlayRenderer _overlayRenderer;
    private readonly ICorrectionFormatter _corrections;

    [ObservableProperty]
    private ViewModelBase _currentPage = null!;

    public MainWindowViewModel()
        : this(new CouponAnalyzer(), new ScannerCancellingCombiner(), new OverlayRenderer(), new CorrectionFormatter())
    {
    }

    public MainWindowViewModel(
        ICouponAnalyzer analyzer,
        IScanCombiner combiner,
        IOverlayRenderer overlayRenderer,
        ICorrectionFormatter corrections)
    {
        _analyzer = analyzer;
        _combiner = combiner;
        _overlayRenderer = overlayRenderer;
        _corrections = corrections;
        CurrentPage = CreateScanPage();
    }

    private ScanPageViewModel CreateScanPage() =>
        new(_analyzer, _combiner, _overlayRenderer, ShowResults);

    private void ShowResults(TwoScanResult result, CouponSpec coupon, Bitmap? overlayA, Bitmap? overlayB) =>
        CurrentPage = new ResultsPageViewModel(result, coupon, overlayA, overlayB, _corrections, StartOver);

    private void StartOver() => CurrentPage = CreateScanPage();
}
