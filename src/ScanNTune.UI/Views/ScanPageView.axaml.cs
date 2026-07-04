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

public partial class ScanPageView : UserControl
{
    private readonly StorageFileReader _files = new();

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
        slot.AddHandler(DragDrop.DropEvent, (_, e) => _ = HandleDropAsync(e, isFirst));
    }

    private void OnDragOver(object? sender, DragEventArgs e) =>
        e.DragEffects = e.DataTransfer.Contains(DataFormat.File) ? DragDropEffects.Copy : DragDropEffects.None;

    private async Task HandleDropAsync(DragEventArgs e, bool isFirst)
    {
        if (DataContext is not ScanPageViewModel vm)
            return;
        if (e.DataTransfer.TryGetFile() is IStorageFile file)
            await LoadAsync(vm, file, isFirst);
    }

    // The coupon export is platform-specific (desktop "Open with" vs browser download), so route it to
    // the view model's injected exporter rather than doing OS work in the shared view.
    private void OnGetCouponPressed(object? sender, RoutedEventArgs e)
    {
        if (DataContext is ScanPageViewModel vm)
            vm.GetCouponCommand.Execute(null);
    }

    private void OnSlot1Pressed(object? sender, PointerPressedEventArgs e) => OpenPicker(e, isFirst: true);

    private void OnSlot2Pressed(object? sender, PointerPressedEventArgs e) => OpenPicker(e, isFirst: false);

    // Release the implicit pointer capture before opening the picker. In the browser the native file dialog
    // swallows the pointer-up, so the press capture would otherwise stay stuck on this slot and route every
    // later click here. Desktop's modal dialog completes the pointer sequence, so this is a harmless no-op there.
    private void OpenPicker(PointerPressedEventArgs e, bool isFirst)
    {
        e.Pointer.Capture(null);
        _ = PickAsync(isFirst);
    }

    // async work is kept guarded so a failure surfaces to the status line rather than escaping to the
    // dispatcher (these are invoked from synchronous event handlers).
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

            if (files.Count > 0)
                await LoadAsync(vm, files[0], isFirst);
        }
        catch (Exception ex)
        {
            vm.ReportLoadError("Could not open file picker", ex);
        }
    }

    // Read the picked/dropped file as bytes through the storage abstraction, which works on the desktop
    // (real files) and in the browser (no local path exists), then hand them to the view model.
    private async Task LoadAsync(ScanPageViewModel vm, IStorageFile file, bool isFirst)
    {
        try
        {
            byte[] data = await _files.ReadAllBytesAsync(file);
            if (isFirst)
                await vm.LoadScan1Async(file.Name, data);
            else
                await vm.LoadScan2Async(file.Name, data);
        }
        catch (Exception ex)
        {
            vm.ReportLoadError("Could not read the file", ex);
        }
    }
}
