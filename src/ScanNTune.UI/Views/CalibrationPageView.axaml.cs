using System;
using System.Threading.Tasks;
using Avalonia.Controls;
using Avalonia.Input;
using Avalonia.Interactivity;
using Avalonia.Markup.Xaml;
using Avalonia.Platform.Storage;
using ScanNTune.UI.Platform;
using ScanNTune.UI.ViewModels;

namespace ScanNTune.UI.Views;

public partial class CalibrationPageView : UserControl
{
    private readonly StorageFileReader _files = new();

    public CalibrationPageView()
    {
        InitializeComponent();

        // Drag-and-drop has no XAML attribute for its routed events, so wire it in code. The whole
        // page is the drop target, so a card can be dropped over the upload prompt or the result.
        if (this.FindControl<ScrollViewer>("PageDrop") is { } zone)
        {
            zone.AddHandler(DragDrop.DragOverEvent, OnDragOver);
            zone.AddHandler(DragDrop.DropEvent, (_, e) => _ = HandleDropAsync(e));
        }
    }

    private void InitializeComponent() => AvaloniaXamlLoader.Load(this);

    private void OnDragOver(object? sender, DragEventArgs e) =>
        e.DragEffects = e.DataTransfer.Contains(DataFormat.File) ? DragDropEffects.Copy : DragDropEffects.None;

    private async Task HandleDropAsync(DragEventArgs e)
    {
        if (DataContext is CalibrationPageViewModel vm && e.DataTransfer.TryGetFile() is IStorageFile file)
            await LoadAsync(vm, file);
    }

    private void OnUpload(object? sender, RoutedEventArgs e) => _ = PickAsync();

    // Guarded so a picker failure surfaces on the page rather than escaping the sync event handler.
    private async Task PickAsync()
    {
        if (DataContext is not CalibrationPageViewModel vm)
            return;

        try
        {
            // The head's picker owns the dialog (native on desktop, a real tapped <input> sheet in the browser
            // so iOS Safari opens it) and returns the bytes directly.
            PickedFile? file = await vm.FilePicker.PickImageAsync("Reference card scan");
            if (file is null)
                return;

            vm.IsDetecting = true;
            try
            {
                await vm.LoadScanAsync(file.Name, file.Data);
            }
            finally
            {
                vm.IsDetecting = false;
            }
        }
        catch (Exception ex)
        {
            vm.IsError = true;
            vm.StatusText = $"Could not open the file picker: {ex.Message}";
            vm.LogError("Card-scan file picker failed.", ex);
        }
    }

    private async Task LoadAsync(CalibrationPageViewModel vm, IStorageFile file)
    {
        // Turn the busy indicator on before the read (the slow part on mobile), not just the detect, so a large
        // card scan shows progress the whole time instead of appearing frozen.
        vm.IsDetecting = true;
        try
        {
            byte[] data = await _files.ReadAllBytesAsync(file);
            await vm.LoadScanAsync(file.Name, data);
        }
        catch (Exception ex)
        {
            vm.IsError = true;
            vm.StatusText = $"Could not read the file: {ex.Message}";
            vm.LogError("Could not read the card scan file.", ex);
        }
        finally
        {
            vm.IsDetecting = false;
        }
    }
}
