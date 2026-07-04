using System;
using System.IO;
using System.Threading.Tasks;
using Avalonia.Platform;
using ScanNTune.UI.Platform;

namespace ScanNTune.Browser.Platform;

/// <summary>
/// Browser coupon export: read the bundled STL asset and trigger a browser download, so the user gets the
/// file directly rather than viewing it (the desktop head instead opens the OS "Open with" chooser).
/// </summary>
public sealed class BrowserCouponExporter : ICouponExporter
{
    public Task ExportAsync()
    {
        using Stream stream = AssetLoader.Open(new Uri("avares://ScanNTune.UI/Assets/calibration_coupon.stl"));
        using var buffer = new MemoryStream();
        stream.CopyTo(buffer);
        BrowserInterop.DownloadFile("calibration_coupon.stl", Convert.ToBase64String(buffer.ToArray()), "model/stl");
        return Task.CompletedTask;
    }
}
