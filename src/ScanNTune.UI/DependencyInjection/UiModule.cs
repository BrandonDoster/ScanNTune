using Autofac;
using Microsoft.Extensions.Logging;
using ScanNTune.Core;
using ScanNTune.Core.Calibration;
using ScanNTune.Core.Combining;
using ScanNTune.Core.Output;
using ScanNTune.UI.ViewModels;

namespace ScanNTune.UI.DependencyInjection;

/// <summary>
/// Registers the platform-neutral layer: the headless engine services, the shell view model, and an open
/// generic <see cref="ILogger{T}"/> built from the head-supplied <see cref="ILoggerFactory"/>. Each head
/// adds its own module for the platform services (imaging, coupon export, the calibration/settings stores,
/// and the logger factory) and then resolves <see cref="MainWindowViewModel"/>.
/// </summary>
public sealed class UiModule : Module
{
    protected override void Load(ContainerBuilder builder)
    {
        // ILogger<T> everywhere, backed by whatever ILoggerFactory the head registers.
        builder.RegisterGeneric(typeof(Logger<>)).As(typeof(ILogger<>)).SingleInstance();

        builder.RegisterType<CouponAnalyzer>().As<ICouponAnalyzer>().SingleInstance();
        builder.RegisterType<ScannerCancellingCombiner>().As<IScanCombiner>().SingleInstance();
        builder.RegisterType<OverlayRenderer>().As<IOverlayRenderer>().SingleInstance();
        builder.RegisterType<CorrectionFormatter>().As<ICorrectionFormatter>().SingleInstance();
        builder.RegisterType<CardEdgeMeasurer>().As<IScaleReferenceMeasurer>().SingleInstance();

        builder.RegisterType<MainWindowViewModel>().AsSelf().SingleInstance();
    }
}
