using ScanNTune.UI.Platform;

namespace ScanNTune.Browser.Platform;

/// <summary>
/// Reports whether the browser's primary pointer is a touch screen. A phone or tablet matches the CSS
/// <c>(pointer: coarse)</c> query; a desktop browser driven by a mouse or trackpad does not. The value is read
/// lazily on first use (so the interop module is loaded by then) and cached, since the primary pointer does
/// not change within a session.
/// </summary>
internal sealed class BrowserDeviceInfo : IDeviceInfo
{
    private bool? _isTouchPrimary;

    public bool IsTouchPrimary => _isTouchPrimary ??= BrowserInterop.IsTouchPrimary();
}
