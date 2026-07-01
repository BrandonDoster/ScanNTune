using System;
using System.Threading.Tasks;
using Avalonia.Controls;
using Avalonia.Input;
using Avalonia.Interactivity;
using Avalonia.Platform.Storage;
using PrinterCalibrate.App.ViewModels;

namespace PrinterCalibrate.App.Views;

public partial class MainWindow : Window
{
    public MainWindow()
    {
        InitializeComponent();
    }

    private async void OnOpenScanClick(object? sender, RoutedEventArgs e)
    {
        if (DataContext is not MainWindowViewModel vm)
            return;

        // async void: an exception escaping here would reach the dispatcher and could crash the
        // app, so keep all the awaited work inside a guard and surface failures to the view model.
        try
        {
            var files = await StorageProvider.OpenFilePickerAsync(new FilePickerOpenOptions
            {
                Title = "Open coupon scan",
                AllowMultiple = false,
                FileTypeFilter =
                [
                    new FilePickerFileType("Images")
                    {
                        Patterns = ["*.png", "*.jpg", "*.jpeg", "*.bmp", "*.tif", "*.tiff"]
                    }
                ]
            });

            if (files.Count > 0 && files[0].TryGetLocalPath() is { } path)
                vm.LoadScan(path);
        }
        catch (Exception ex)
        {
            vm.StatusText = $"Could not open file picker: {ex.Message}";
        }
    }

    private async void OnCopySkew(object? sender, RoutedEventArgs e)
    {
        if (DataContext is MainWindowViewModel vm)
            await CopyToClipboard(vm, vm.SkewCode);
    }

    private async void OnCopySize(object? sender, RoutedEventArgs e)
    {
        if (DataContext is MainWindowViewModel vm)
            await CopyToClipboard(vm, vm.SizeCode);
    }

    private async Task CopyToClipboard(MainWindowViewModel vm, string text)
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
                vm.StatusText = "Copied to clipboard.";
            }
        }
        catch (Exception ex)
        {
            vm.StatusText = $"Copy failed: {ex.Message}";
        }
    }
}
