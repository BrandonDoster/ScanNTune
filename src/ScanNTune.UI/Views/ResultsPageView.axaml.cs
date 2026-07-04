using System;
using System.Threading.Tasks;
using Avalonia.Controls;
using Avalonia.Input;
using Avalonia.Interactivity;
using Avalonia.Markup.Xaml;
using ScanNTune.UI.ViewModels;

namespace ScanNTune.UI.Views;

public partial class ResultsPageView : UserControl
{
    public ResultsPageView()
    {
        InitializeComponent();
    }

    private void InitializeComponent() => AvaloniaXamlLoader.Load(this);

    private async void OnCopySkew(object? sender, RoutedEventArgs e)
    {
        if (DataContext is ResultsPageViewModel vm)
            await CopyToClipboard(vm.SkewCode);
    }

    private async void OnCopySkewSecondary(object? sender, RoutedEventArgs e)
    {
        if (DataContext is ResultsPageViewModel vm)
            await CopyToClipboard(vm.SkewSecondaryCode);
    }

    private async void OnCopySize(object? sender, RoutedEventArgs e)
    {
        if (DataContext is ResultsPageViewModel vm)
            await CopyToClipboard(vm.SizeCode);
    }

    private async Task CopyToClipboard(string text)
    {
        if (string.IsNullOrEmpty(text))
            return;
        try
        {
            if (TopLevel.GetTopLevel(this)?.Clipboard is { } clipboard)
            {
                using var transfer = new DataTransfer();
                transfer.Add(DataTransferItem.CreateText(text));
                await clipboard.SetDataAsync(transfer);
            }
        }
        catch (Exception ex)
        {
            System.Diagnostics.Debug.WriteLine($"Copy failed: {ex.Message}");
        }
    }
}
