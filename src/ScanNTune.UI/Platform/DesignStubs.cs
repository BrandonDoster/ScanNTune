using System.Threading.Tasks;
using OpenCvSharp;

namespace ScanNTune.UI.Platform;

// Design-time only: lets the XAML previewer instantiate MainWindowViewModel without a head's platform
// services. Never registered in a real container.
internal sealed class DesignImaging : IPlatformImaging
{
    public Mat DecodeBgr(byte[] data) => new();

    public (int Width, int Height) GetImageSize(byte[] data) => (0, 0);
}

internal sealed class DesignCouponExporter : ICouponExporter
{
    public Task ExportAsync() => Task.CompletedTask;
}

internal sealed class DesignFilePicker : IFilePicker
{
    public Task<PickedFile?> PickImageAsync(string title) => Task.FromResult<PickedFile?>(null);
}

internal sealed class DesignDeviceInfo : IDeviceInfo
{
    public bool IsTouchPrimary => false;
}
