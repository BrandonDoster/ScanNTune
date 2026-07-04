using System.Runtime.InteropServices.JavaScript;
using System.Runtime.Versioning;
using System.Threading.Tasks;
using Avalonia;
using Avalonia.Browser;
using ScanNTune.Browser.Platform;

[assembly: SupportedOSPlatform("browser")]

namespace ScanNTune.Browser;

internal sealed partial class Program
{
    private static async Task Main(string[] args)
    {
        // Load the JS interop module before Avalonia starts, so the localStorage-backed stores are usable
        // from the first view model constructed in OnFrameworkInitializationCompleted.
        await JSHost.ImportAsync(BrowserInterop.ModuleName, BrowserInterop.ModulePath);

        await BuildAvaloniaApp()
            .WithInterFont()
            .StartBrowserAppAsync("out");
    }

    public static AppBuilder BuildAvaloniaApp()
        => AppBuilder.Configure<App>();
}
