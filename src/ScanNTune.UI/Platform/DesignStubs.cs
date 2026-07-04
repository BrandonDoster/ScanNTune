using System.Threading.Tasks;
using OpenCvSharp;

namespace ScanNTune.UI.Platform;

// Design-time only: lets the XAML previewer instantiate MainWindowViewModel without a head's platform
// services. Never registered in a real container.
internal sealed class DesignImaging : IPlatformImaging
{
    public Mat DecodeBgr(byte[] data) => new();
}

internal sealed class DesignCouponExporter : ICouponExporter
{
    public Task ExportAsync() => Task.CompletedTask;
}
