using System;
using System.Threading.Tasks;
using Autofac;
using Avalonia;
using Avalonia.Controls;
using Avalonia.Controls.ApplicationLifetimes;
using Avalonia.Markup.Xaml;
using Avalonia.Platform.Storage;
using Microsoft.Extensions.Logging;
using ScanNTune.UI.DependencyInjection;
using ScanNTune.UI.ViewModels;

namespace ScanNTune.Browser;

public partial class App : Application
{
    // The browser has no filesystem, so log to the devtools console through a thread-free provider
    // (the framework console logger uses a background thread, unsupported in single-threaded wasm).
    // There is no Velopack update check here: the web app updates when the page is redeployed.
    private readonly ILoggerFactory _loggerFactory =
        LoggerFactory.Create(b => b.AddProvider(new BrowserConsoleLoggerProvider()).SetMinimumLevel(LogLevel.Information));
    private IContainer? _container;
    private bool _storageWarmed;

    public override void Initialize() => AvaloniaXamlLoader.Load(this);

    public override void OnFrameworkInitializationCompleted()
    {
        // Compose the shared UI with the WebAssembly head's platform services through Autofac.
        var builder = new ContainerBuilder();
        builder.RegisterModule(new UiModule());
        builder.RegisterModule(new BrowserModule(_loggerFactory));
        _container = builder.Build();

        if (ApplicationLifetime is ISingleViewApplicationLifetime single)
        {
            var mainView = new MainView { DataContext = _container.Resolve<MainWindowViewModel>() };
            mainView.AttachedToVisualTree += (_, _) => _ = WarmUpStoragePickerAsync(mainView);
            single.MainView = mainView;
        }

        base.OnFrameworkInitializationCompleted();
    }

    // The first file-dialog call lazily imports Avalonia's storage JS module. On a mobile browser that async
    // module fetch runs across the user-gesture boundary, so showOpenFilePicker throws "must be handling a
    // user gesture" the first time (later taps work because the module is cached). Warming the module once the
    // view is on screen means the first real tap finds it cached and the gesture survives. TryGetWellKnownFolder
    // shares the same lazy import but opens no dialog, so it is a side-effect-free way to trigger it.
    private async Task WarmUpStoragePickerAsync(Visual view)
    {
        if (_storageWarmed)
            return;
        ILogger<App> logger = _loggerFactory.CreateLogger<App>();
        try
        {
            // If this early attach has no TopLevel yet, leave the flag unset so a later attach retries.
            IStorageProvider? storage = TopLevel.GetTopLevel(view)?.StorageProvider;
            if (storage is null)
                return;
            _storageWarmed = true;
            await storage.TryGetWellKnownFolderAsync(WellKnownFolder.Documents);
            logger.LogInformation("Storage picker module warmed up.");
        }
        catch (Exception ex)
        {
            logger.LogWarning(ex, "Storage picker warm-up failed; the first file pick may need a second tap.");
        }
    }
}
