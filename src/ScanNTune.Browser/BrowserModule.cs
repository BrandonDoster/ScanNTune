using Autofac;
using Microsoft.Extensions.Logging;
using ScanNTune.Browser.Platform;
using ScanNTune.Core.Calibration;
using ScanNTune.UI.Platform;

namespace ScanNTune.Browser;

/// <summary>
/// The WebAssembly head's platform registrations: Skia imaging, the coupon download, and the localStorage-backed
/// calibration store, plus a console-backed logger factory (browser devtools console).
/// </summary>
public sealed class BrowserModule : Module
{
    private readonly ILoggerFactory _loggerFactory;

    public BrowserModule(ILoggerFactory loggerFactory) => _loggerFactory = loggerFactory;

    protected override void Load(ContainerBuilder builder)
    {
        builder.RegisterInstance(_loggerFactory).As<ILoggerFactory>().SingleInstance();
        builder.RegisterType<SkiaImaging>().As<IPlatformImaging>().SingleInstance();
        builder.RegisterType<BrowserFilePicker>().As<IFilePicker>().SingleInstance();
        builder.RegisterType<BrowserCouponExporter>().As<ICouponExporter>().SingleInstance();
        builder.RegisterType<LocalStorageCalibrationStore>().As<ICalibrationStore>().SingleInstance();
    }
}
