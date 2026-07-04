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

        // Drag-and-drop has no XAML attribute for its routed events, so wire it in code. Tapping a
        // slot is handled separately (Tapped in XAML) and opens the file picker.
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

    // Open on the Tapped gesture, not PointerPressed: Tapped fires only on a press-and-release without a drag,
    // so a scroll that starts on a slot pans the page instead of popping the picker. The old press-phase
    // handling is no longer needed either, because the OS file dialog now opens later, from the genuine tap on
    // the sheet's own <input>, so the slot tap itself no longer has to preserve the user activation.
    private void OnSlot1Tapped(object? sender, TappedEventArgs e) => _ = PickAsync(isFirst: true);

    private void OnSlot2Tapped(object? sender, TappedEventArgs e) => _ = PickAsync(isFirst: false);

    // async work is kept guarded so a failure surfaces to the status line rather than escaping to the
    // dispatcher (these are invoked from synchronous event handlers).
    private async Task PickAsync(bool isFirst)
    {
        if (DataContext is not ScanPageViewModel vm)
            return;

        try
        {
            // The head's picker owns the dialog: a native OS dialog on desktop, a sheet with a real tapped
            // <input> in the browser (so iOS Safari actually opens it). It returns the bytes directly.
            PickedFile? file = await vm.FilePicker.PickImageAsync(
                isFirst ? "First scan (as placed)" : "Second scan (quarter-turned)");
            if (file is null)
                return;

            if (isFirst)
                vm.Scan1Loading = true;
            else
                vm.Scan2Loading = true;
            try
            {
                if (isFirst)
                    await vm.LoadScan1Async(file.Name, file.Data);
                else
                    await vm.LoadScan2Async(file.Name, file.Data);
            }
            finally
            {
                if (isFirst)
                    vm.Scan1Loading = false;
                else
                    vm.Scan2Loading = false;
            }
        }
        catch (Exception ex)
        {
            vm.ReportLoadError("Could not open the file", ex);
        }
    }

    // Read the picked/dropped file as bytes through the storage abstraction, which works on the desktop
    // (real files) and in the browser (no local path exists), then hand them to the view model.
    private async Task LoadAsync(ScanPageViewModel vm, IStorageFile file, bool isFirst)
    {
        // Turn the slot's busy spinner on before the read, not just the decode. On mobile the read of a large
        // scan is the slow part (Avalonia marshals the bytes across the JS boundary), so without this the user
        // taps, waits several seconds, and sees nothing happening.
        if (isFirst)
            vm.Scan1Loading = true;
        else
            vm.Scan2Loading = true;
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
        finally
        {
            if (isFirst)
                vm.Scan1Loading = false;
            else
                vm.Scan2Loading = false;
        }
    }
}
