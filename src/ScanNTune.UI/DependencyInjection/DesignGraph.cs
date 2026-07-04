using Autofac;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Logging.Abstractions;
using ScanNTune.Core.Calibration;
using ScanNTune.UI.Platform;

namespace ScanNTune.UI.DependencyInjection;

/// <summary>
/// A throwaway container for the XAML previewer: the shared <see cref="UiModule"/> engine registrations
/// plus silent logging and stub platform services, so design time builds the shell from the same graph the
/// app uses at runtime instead of a hand-maintained parallel one. Design-time only; at runtime each head
/// composes through its own module.
/// </summary>
public sealed class DesignGraph
{
    private readonly IContainer _container;

    public DesignGraph()
    {
        var builder = new ContainerBuilder();
        builder.RegisterModule(new UiModule());
        builder.RegisterInstance<ILoggerFactory>(NullLoggerFactory.Instance).SingleInstance();
        builder.RegisterType<DesignImaging>().As<IPlatformImaging>().SingleInstance();
        builder.RegisterType<DesignFilePicker>().As<IFilePicker>().SingleInstance();
        builder.RegisterType<DesignCouponExporter>().As<ICouponExporter>().SingleInstance();
        builder.Register(c => new JsonCalibrationStore(null, c.Resolve<ILogger<JsonCalibrationStore>>()))
            .As<ICalibrationStore>().SingleInstance();
        _container = builder.Build();
    }

    public T Get<T>() where T : notnull => _container.Resolve<T>();
}
