using Autofac;
using Avalonia;
using Avalonia.Controls.ApplicationLifetimes;
using Avalonia.Markup.Xaml;
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

    public override void Initialize() => AvaloniaXamlLoader.Load(this);

    public override void OnFrameworkInitializationCompleted()
    {
        // Compose the shared UI with the WebAssembly head's platform services through Autofac.
        var builder = new ContainerBuilder();
        builder.RegisterModule(new UiModule());
        builder.RegisterModule(new BrowserModule(_loggerFactory));
        _container = builder.Build();

        if (ApplicationLifetime is ISingleViewApplicationLifetime single)
            single.MainView = new MainView { DataContext = _container.Resolve<MainWindowViewModel>() };

        base.OnFrameworkInitializationCompleted();
    }
}
