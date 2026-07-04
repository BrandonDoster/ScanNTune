using System;
using System.Runtime.InteropServices.JavaScript;
using System.Text.Json;
using Microsoft.Extensions.Logging;
using ScanNTune.Core.Calibration;

namespace ScanNTune.Browser.Platform;

/// <summary>
/// Persists the scanner calibration in the browser's localStorage (the same JSON the desktop writes to a
/// file), so a calibration survives page reloads. A missing or unreadable/degenerate value is treated as
/// "not calibrated" rather than throwing, mirroring <c>JsonCalibrationStore</c>.
/// </summary>
public sealed class LocalStorageCalibrationStore : ICalibrationStore
{
    private const string Key = "scanntune.calibration";
    private readonly ILogger<LocalStorageCalibrationStore> _logger;
    private readonly JsonSerializerOptions _json = new() { WriteIndented = true };

    public LocalStorageCalibrationStore(ILogger<LocalStorageCalibrationStore> logger) => _logger = logger;

    public ScannerCalibration? Load()
    {
        try
        {
            string? json = BrowserInterop.GetItem(Key);
            if (string.IsNullOrEmpty(json))
                return null;
            ScannerCalibration? calibration = JsonSerializer.Deserialize<ScannerCalibration>(json, _json);
            return calibration is { IsUsable: true } ? calibration : null;
        }
        // A JSException covers localStorage being unavailable (private-browsing, disabled storage, a
        // sandboxed iframe); like the desktop store's I/O catch, treat it as "not calibrated" not a crash.
        catch (Exception ex) when (ex is JsonException or JSException)
        {
            _logger.LogWarning(ex, "Could not read scanner calibration from localStorage; treating as uncalibrated.");
            return null;
        }
    }

    public void Save(ScannerCalibration calibration)
    {
        ArgumentNullException.ThrowIfNull(calibration);
        BrowserInterop.SetItem(Key, JsonSerializer.Serialize(calibration, _json));
    }

    public void Clear()
    {
        try
        {
            BrowserInterop.RemoveItem(Key);
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Could not clear scanner calibration in localStorage.");
        }
    }
}
