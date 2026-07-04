using System.Threading.Tasks;
using Avalonia;
using Avalonia.Controls;
using Avalonia.Controls.ApplicationLifetimes;
using Avalonia.Platform.Storage;
using Microsoft.Extensions.Logging;
using ScanNTune.UI.Platform;

namespace ScanNTune.App.Platform;

/// <summary>Desktop file picking through the native OS open dialog on the main window.</summary>
public sealed class AvaloniaFilePicker : IFilePicker
{
    private readonly StorageFileReader _reader = new();
    private readonly ILogger<AvaloniaFilePicker> _logger;

    public AvaloniaFilePicker(ILogger<AvaloniaFilePicker> logger) => _logger = logger;

    public async Task<PickedFile?> PickImageAsync(string title)
    {
        Window? window = (Application.Current?.ApplicationLifetime as IClassicDesktopStyleApplicationLifetime)?.MainWindow;
        IStorageProvider? storage = window?.StorageProvider;
        if (storage is null)
        {
            _logger.LogWarning("No main window storage provider available to pick a file.");
            return null;
        }

        var files = await storage.OpenFilePickerAsync(new FilePickerOpenOptions
        {
            Title = title,
            AllowMultiple = false,
            FileTypeFilter =
            [
                new FilePickerFileType("Images")
                {
                    Patterns = ["*.png", "*.jpg", "*.jpeg", "*.bmp", "*.tif", "*.tiff"]
                }
            ]
        });
        if (files.Count == 0)
            return null;

        byte[] data = await _reader.ReadAllBytesAsync(files[0]);
        return new PickedFile(files[0].Name, data);
    }
}
