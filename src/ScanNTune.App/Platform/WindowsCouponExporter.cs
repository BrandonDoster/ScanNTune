using System;
using System.Diagnostics;
using System.IO;
using System.Threading.Tasks;
using Avalonia.Platform;
using Microsoft.Extensions.Logging;
using ScanNTune.UI.Platform;

namespace ScanNTune.App.Platform;

/// <summary>
/// Desktop coupon export: drop a fresh copy of the bundled STL in a temp folder (so the original stays
/// pristine) and pop the Windows "Open with…" chooser so the user can send it to their slicer.
/// </summary>
public sealed class WindowsCouponExporter : ICouponExporter
{
    private readonly ILogger<WindowsCouponExporter> _logger;

    public WindowsCouponExporter(ILogger<WindowsCouponExporter> logger) => _logger = logger;

    public Task ExportAsync()
    {
        try
        {
            string dir = Path.Combine(Path.GetTempPath(), "ScanNTune");
            Directory.CreateDirectory(dir);
            string dest = Path.Combine(dir, "calibration_coupon.stl");

            using (Stream source = AssetLoader.Open(new Uri("avares://ScanNTune.UI/Assets/calibration_coupon.stl")))
            using (FileStream file = File.Create(dest))
                source.CopyTo(file);

            // The "openas" verb is the shell's canonical "Open with..." action and shows the chooser for a
            // type (like .stl) that has no default handler. Letting the shell resolve the path means a
            // profile path containing a space (e.g. C:\Users\First Last\...) is handled correctly, unlike a
            // bare space-delimited OpenAs_RunDLL argument.
            Process.Start(new ProcessStartInfo(dest)
            {
                UseShellExecute = true,
                Verb = "openas",
            });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Could not export/open the coupon STL.");
            throw;
        }

        return Task.CompletedTask;
    }
}
