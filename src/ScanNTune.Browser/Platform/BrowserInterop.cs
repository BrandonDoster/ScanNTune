using System.Runtime.InteropServices.JavaScript;

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

    [JSImport("downloadFile", ModuleName)]
    internal static partial void DownloadFile(string name, string base64, string mime);
}
