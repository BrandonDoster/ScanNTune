using System;
using System.Diagnostics;
using System.IO;
using System.Runtime.InteropServices;
using System.Text;
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

            // OpenAs_RunDLL forces the "Open with..." chooser regardless of file associations. The
            // ShellExecute "openas" verb instead fails with "no application associated" for a type (like
            // .stl) that has no default handler. It reads the rest of the command line as the path, which a
            // space would split, so pass the 8.3 short path when the temp path happens to contain a space.
            string arg = dest.Contains(' ') ? ShortPath(dest) : dest;
            Process.Start(new ProcessStartInfo("rundll32.exe")
            {
                Arguments = $"shell32.dll,OpenAs_RunDLL {arg}",
                UseShellExecute = false,
            });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Could not export/open the coupon STL.");
            throw;
        }

        return Task.CompletedTask;
    }

    // Win32 8.3 short path (e.g. C:\Users\FIRSTL~1\...): a space-free form of an existing path, so the
    // space-delimited OpenAs_RunDLL argument can't be truncated. Falls back to the original path if the
    // short name is unavailable (8.3 generation disabled on the volume).
    private string ShortPath(string path)
    {
        var buffer = new StringBuilder(260);
        uint length = GetShortPathName(path, buffer, (uint)buffer.Capacity);
        return length > 0 && length < buffer.Capacity ? buffer.ToString() : path;
    }

    [DllImport("kernel32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
    private static extern uint GetShortPathName(string lpszLongPath, StringBuilder lpszShortPath, uint cchBuffer);
}
