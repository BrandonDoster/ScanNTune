using Avalonia;
using Avalonia.Controls.ApplicationLifetimes;
using Avalonia.Data.Core;
using Avalonia.Data.Core.Plugins;
using System.Linq;
using Avalonia.Markup.Xaml;
using ScanNTune.App.ViewModels;
using ScanNTune.App.Views;
using ScanNTune.Core.Updates;

namespace ScanNTune.App;

public partial class App : Application
{
    public override void Initialize()
    {
        AvaloniaXamlLoader.Load(this);
    }

    public override void OnFrameworkInitializationCompleted()
    {
        if (ApplicationLifetime is IClassicDesktopStyleApplicationLifetime desktop)
        {
            desktop.MainWindow = new MainWindow
            {
                DataContext = new MainWindowViewModel(),
            };

            // Best-effort, off the startup path: check for an update in the background and, if one is found,
            // stage it to apply on the next launch (never mid-session). No-ops in dev / non-installed runs.
            // The updater is built inside UpdateCheck so a construction fault can't escape onto the UI thread.
            _ = new UpdateCheck(() => new VelopackAppUpdater()).RunAsync();
        }

        base.OnFrameworkInitializationCompleted();
    }
}