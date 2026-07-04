using System;
using System.Collections.Generic;
using System.Threading.Tasks;
using Avalonia;
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
    // A slot press counts as "open the picker" only if the finger barely moves before it lifts. A drag past
    // this many pixels is a scroll and is left alone. Generous enough that ordinary finger jitter on a tap
    // still opens the picker.
    private const double TapMoveTolerance = 12;

    private readonly StorageFileReader _files = new();
    // Press origin keyed by slot, so a press on one slot never consumes or confuses another slot's release
    // (e.g. two fingers, one on each slot).
    private readonly Dictionary<Border, Point> _pressOrigins = new();

    public ScanPageView()
    {
        InitializeComponent();

        // None of these routed events has a XAML attribute, so wire them in code. Tap-to-open is detected
        // from pointer press + release (not the built-in Tapped gesture, which a ScrollViewer preempts on a
        // touch screen so a real finger tap almost never registers), letting a scroll drag through untouched.
        WireSlot("Slot1", isFirst: true);
        WireSlot("Slot2", isFirst: false);
    }

    private void InitializeComponent() => AvaloniaXamlLoader.Load(this);

    private void WireSlot(string slotName, bool isFirst)
    {
        if (this.FindControl<Border>(slotName) is not { } slot)
            return;
        slot.AddHandler(DragDrop.DragOverEvent, OnDragOver);
        slot.AddHandler(DragDrop.DropEvent, (_, e) => _ = HandleDropAsync(e, isFirst));
        // Bubble phase only (a Tunnel|Bubble subscription would fire each handler twice, since Avalonia's
        // pointer events carry both). handledEventsToo so a child inside the slot (image, labels) marking the
        // press/release handled doesn't rob the slot of it; we only observe (never capture or mark handled), so
        // scrolling is left intact.
        slot.AddHandler(InputElement.PointerPressedEvent, OnSlotPointerPressed,
            RoutingStrategies.Bubble, handledEventsToo: true);
        slot.AddHandler(InputElement.PointerReleasedEvent, (s, e) => OnSlotPointerReleased(s, e, isFirst),
            RoutingStrategies.Bubble, handledEventsToo: true);
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

    private void OnSlotPointerPressed(object? sender, PointerPressedEventArgs e)
    {
        // Positions are taken relative to this UserControl, which hosts the ScrollViewer and does not itself
        // scroll, so press and release compare in the same (viewport) frame even if the content scrolls.
        if (sender is Border slot)
            _pressOrigins[slot] = e.GetPosition(this);
    }

    // A press followed by a release on the same slot that barely moved is a tap: open the picker. A larger move
    // was a scroll and is ignored (and the ScrollViewer, which we never blocked, has already panned). Opening on
    // release is fine for iOS: the sheet is only DOM here, and the OS dialog opens later from its own input tap.
    private void OnSlotPointerReleased(object? sender, PointerReleasedEventArgs e, bool isFirst)
    {
        if (sender is not Border slot || !_pressOrigins.Remove(slot, out Point origin))
            return;
        Point released = e.GetPosition(this);
        double dx = released.X - origin.X;
        double dy = released.Y - origin.Y;
        if (dx * dx + dy * dy <= TapMoveTolerance * TapMoveTolerance)
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
