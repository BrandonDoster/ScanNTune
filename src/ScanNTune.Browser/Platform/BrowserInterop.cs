using System;
using System.Runtime.InteropServices.JavaScript;
using System.Threading.Tasks;

namespace ScanNTune.Browser.Platform;

/// <summary>
/// Bindings to the "interop" JS module (wwwroot/interop.js). The wrappers exist because localStorage and
/// window.open need their own <c>this</c>; calling them detached via a bare global path throws. The module
/// is loaded once at startup via <see cref="System.Runtime.InteropServices.JavaScript.JSHost.ImportAsync"/>.
/// </summary>
internal static partial class BrowserInterop
{
    internal const string ModuleName = "interop";
    // Resolved relative to _framework/, so step up to the site root where wwwroot/interop.js is served.
    // "../interop.js" works both locally and under a GitHub Pages sub-path base href.
    internal const string ModulePath = "../interop.js";

    [JSImport("getItem", ModuleName)]
    internal static partial string? GetItem(string key);

    [JSImport("setItem", ModuleName)]
    internal static partial void SetItem(string key, string value);

    [JSImport("removeItem", ModuleName)]
    internal static partial void RemoveItem(string key);

    [JSImport("openUrl", ModuleName)]
    internal static partial void OpenUrl(string url);

    [JSImport("isTouchPrimary", ModuleName)]
    internal static partial bool IsTouchPrimary();

    [JSImport("downloadFile", ModuleName)]
    internal static partial void DownloadFile(string name, string base64, string mime);

    // Shows the file sheet and resolves to "name\nlength" once a real file input is tapped and read, or null
    // on cancel. The chosen bytes are held on the JS side and copied out in one shot by CopyPickedBytes.
    [JSImport("pickImageFile", ModuleName)]
    internal static partial Task<string?> PickImageFile(string title);

    [JSImport("copyPickedBytes", ModuleName)]
    internal static partial void CopyPickedBytes([JSMarshalAs<JSType.MemoryView>] Span<byte> destination);

    [JSImport("clearPickedBytes", ModuleName)]
    internal static partial void ClearPickedBytes();
}
