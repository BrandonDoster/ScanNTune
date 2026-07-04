using System;
using System.Globalization;
using System.Threading.Tasks;
using Microsoft.Extensions.Logging;
using ScanNTune.UI.Platform;

namespace ScanNTune.Browser.Platform;

/// <summary>
/// Browser file picking through a real, directly-tapped <c>&lt;input type=file&gt;</c> in a sheet (see
/// interop.js). iOS Safari only opens a file dialog from a genuine DOM gesture, so we own the input instead
/// of Avalonia's picker (which awaits before the click and loses the gesture on iOS). The bytes come back in
/// one bulk copy, which is also far faster than Avalonia's per-byte marshalling of a large scan.
/// </summary>
public sealed class BrowserFilePicker : IFilePicker
{
    private readonly ILogger<BrowserFilePicker> _logger;

    public BrowserFilePicker(ILogger<BrowserFilePicker> logger) => _logger = logger;

    public async Task<PickedFile?> PickImageAsync(string title)
    {
        // The JS side returns "name\nlength" once a file is chosen, or null on cancel. The bytes then come
        // across in one MemoryView copy rather than element by element.
        string? meta = await BrowserInterop.PickImageFile(title);
        if (meta is null)
            return null;

        int separator = meta.LastIndexOf('\n');
        if (separator < 0
            || !int.TryParse(meta.AsSpan(separator + 1), NumberStyles.Integer, CultureInfo.InvariantCulture, out int length)
            || length < 0)
        {
            _logger.LogWarning("File pick returned malformed metadata.");
            BrowserInterop.ClearPickedBytes(); // drop the held bytes we will not read
            return null;
        }

        string name = meta[..separator];
        var data = new byte[length];
        if (length > 0)
            BrowserInterop.CopyPickedBytes(data);
        return new PickedFile(name, data);
    }
}
