using Autofac;
using Microsoft.Extensions.Logging;
using ScanNTune.App.Platform;
using ScanNTune.Core.Calibration;
using ScanNTune.UI.Platform;

namespace ScanNTune.App;

/// <summary>
/// The desktop head's platform registrations: OpenCV imaging, the Windows coupon export, the JSON-file
/// calibration store, and the Serilog-backed logger factory the whole app logs through.
/// </summary>
public sealed class AppModule : Module
{
    private readonly ILoggerFactory _loggerFactory;

    public AppModule(ILoggerFactory loggerFactory) => _loggerFactory = loggerFactory;

    protected override void Load(ContainerBuilder builder)
    {
        builder.RegisterInstance(_loggerFactory).As<ILoggerFactory>().SingleInstance();
        builder.RegisterType<OpenCvImaging>().As<IPlatformImaging>().SingleInstance();
        builder.RegisterType<AvaloniaFilePicker>().As<IFilePicker>().SingleInstance();
        builder.RegisterType<DesktopDeviceInfo>().As<IDeviceInfo>().SingleInstance();
        builder.RegisterType<WindowsCouponExporter>().As<ICouponExporter>().SingleInstance();
        builder.Register(c => new JsonCalibrationStore(null, c.Resolve<ILogger<JsonCalibrationStore>>()))
            .As<ICalibrationStore>().SingleInstance();
    }
}
