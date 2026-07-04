using Avalonia.Controls;
using Avalonia.Interactivity;
using Avalonia.Markup.Xaml;
using ScanNTune.Browser.Platform;

namespace ScanNTune.Browser;

public partial class MainView : UserControl
{
    public MainView() => AvaloniaXamlLoader.Load(this);

    private void OnOpenRepository(object? sender, RoutedEventArgs e)
        => BrowserInterop.OpenUrl("https://github.com/jaak0b/ScanNTune");
}
