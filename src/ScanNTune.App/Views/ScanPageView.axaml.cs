using System;
using System.Threading.Tasks;
using Avalonia.Controls;
using Avalonia.Input;
using Avalonia.Interactivity;
using Avalonia.Markup.Xaml;
using Avalonia.Platform.Storage;
using ScanNTune.App.ViewModels;

namespace ScanNTune.App.Views;

public partial class ScanPageView : UserControl
{
    public ScanPageView()
    {
        InitializeComponent();

        // Drag-and-drop has no XAML attribute for its routed events, so wire it in code. Clicking a
        // slot is handled separately (PointerPressed in XAML) and opens the file picker.
        WireDrop("Slot1", isFirst: true);
        WireDrop("Slot2", isFirst: false);
    }

    private void InitializeComponent() => AvaloniaXamlLoader.Load(this);

    private void WireDrop(string slotName, bool isFirst)
    {
        if (this.FindControl<Border>(slotName) is not { } slot)
            return;
        slot.AddHandler(DragDrop.DragOverEvent, OnDragOver);
        slot.AddHandler(DragDrop.DropEvent, (_, e) => HandleDrop(e, isFirst));
    }

    private void OnDragOver(object? sender, DragEventArgs e) =>
        e.DragEffects = e.DataTransfer.Contains(DataFormat.File) ? DragDropEffects.Copy : DragDropEffects.None;

    private void HandleDrop(DragEventArgs e, bool isFirst)
    {
        if (DataContext is not ScanPageViewModel vm)
            return;
        if (e.DataTransfer.TryGetFile()?.TryGetLocalPath() is { } path)
            Load(vm, path, isFirst);
    }

    private void OnSlot1Pressed(object? sender, PointerPressedEventArgs e) => _ = PickAsync(isFirst: true);

    private void OnSlot2Pressed(object? sender, PointerPressedEventArgs e) => _ = PickAsync(isFirst: false);

    // async work is kept guarded so a failure surfaces to the status line rather than escaping to
    // the dispatcher (these are invoked from a synchronous event handler).
    private async Task PickAsync(bool isFirst)
    {
        if (DataContext is not ScanPageViewModel vm)
            return;

        try
        {
            IStorageProvider? storage = TopLevel.GetTopLevel(this)?.StorageProvider;
            if (storage is null)
                return;

            var files = await storage.OpenFilePickerAsync(new FilePickerOpenOptions
            {
                Title = isFirst ? "Open first scan" : "Open second scan (quarter-turned)",
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
                Load(vm, path, isFirst);
        }
        catch (Exception ex)
        {
            vm.StatusText = $"Could not open file picker: {ex.Message}";
        }
    }

    private void Load(ScanPageViewModel vm, string path, bool isFirst)
    {
        if (isFirst)
            vm.LoadScan1(path);
        else
            vm.LoadScan2(path);
    }
}
