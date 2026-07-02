using System.Text.Json;
using Microsoft.Extensions.Logging;

namespace PrinterCalibrate.Core.Calibration;

/// <summary>
/// Stores the scanner calibration as JSON under the user's application-data folder. A missing or
/// unreadable file is treated as "not calibrated" (returns null) rather than throwing, so a first run
/// or a corrupt file simply prompts the user to calibrate again.
/// </summary>
public sealed class JsonCalibrationStore : ICalibrationStore
{
    private readonly string _path;
    private readonly ILogger<JsonCalibrationStore>? _logger;
    private readonly JsonSerializerOptions _json = new() { WriteIndented = true };

    public JsonCalibrationStore(string? path = null, ILogger<JsonCalibrationStore>? logger = null)
    {
        _path = path ?? Path.Combine(
            Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData),
            "PrinterCalibrate", "scanner-calibration.json");
        _logger = logger;
    }

    public ScannerCalibration? Load()
    {
        try
        {
            if (!File.Exists(_path))
                return null;
            ScannerCalibration? calibration = JsonSerializer.Deserialize<ScannerCalibration>(File.ReadAllText(_path), _json);
            // A non-positive DPI or px/mm is degenerate (a partial or hand-edited file) and would
            // silently apply no scale correction — treat it as uncalibrated instead.
            if (calibration is null || calibration.Dpi <= 0 || calibration.PxPerMm <= 0)
                return null;
            return calibration;
        }
        catch (Exception ex) when (ex is IOException or JsonException or UnauthorizedAccessException)
        {
            _logger?.LogWarning(ex, "Could not read scanner calibration from {Path}; treating as uncalibrated.", _path);
            return null;
        }
    }

    public void Save(ScannerCalibration calibration)
    {
        ArgumentNullException.ThrowIfNull(calibration);
        string? dir = Path.GetDirectoryName(_path);
        if (!string.IsNullOrEmpty(dir))
            Directory.CreateDirectory(dir);
        // Write to a temp file and move it into place, so a crash mid-write can't leave a truncated
        // file that the next Load would silently discard as "not calibrated".
        string temp = _path + ".tmp";
        File.WriteAllText(temp, JsonSerializer.Serialize(calibration, _json));
        File.Move(temp, _path, overwrite: true);
    }

    public void Clear()
    {
        try
        {
            if (File.Exists(_path))
                File.Delete(_path);
        }
        catch (Exception ex) when (ex is IOException or UnauthorizedAccessException)
        {
            _logger?.LogWarning(ex, "Could not delete scanner calibration at {Path}.", _path);
        }
    }
}
