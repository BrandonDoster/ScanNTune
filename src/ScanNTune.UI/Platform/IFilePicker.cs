using System.Threading.Tasks;

namespace ScanNTune.UI.Platform;

/// <summary>An image the user picked: its display name and its still-encoded bytes.</summary>
public sealed record PickedFile(string Name, byte[] Data);

/// <summary>
/// Head-supplied image file picking. The desktop head opens the native OS dialog; the browser head shows a
/// sheet with a real, directly-tapped <c>&lt;input type=file&gt;</c>. The browser needs its own input because
/// iOS Safari only opens a file dialog from a genuine DOM gesture, and Avalonia's own picker awaits (its JS
/// storage module) before the click, which iOS treats as losing the user activation (see AvaloniaUI/Avalonia
/// #11041). Returns <c>null</c> when the user cancels.
/// </summary>
public interface IFilePicker
{
    Task<PickedFile?> PickImageAsync(string title);
}
