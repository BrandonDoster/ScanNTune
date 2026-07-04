namespace ScanNTune.UI.Platform;

/// <summary>
/// Head-supplied device facts the shared UI adapts to. Currently just whether the primary pointer is a touch
/// screen (a phone or tablet). The numeric fields use it to turn text entry off there, so tapping one never
/// raises a soft keyboard or leaves a caret the user cannot type into: mobile browsers cannot commit typed
/// characters into an Avalonia <c>TextBox</c>, so the +/- steppers are the only input on touch devices.
/// The desktop head reports <c>false</c> (a keyboard is always present); the browser head reads the CSS
/// pointer media query.
/// </summary>
public interface IDeviceInfo
{
    /// <summary>True when the device's primary pointer is a touch screen (phone or tablet).</summary>
    bool IsTouchPrimary { get; }
}
