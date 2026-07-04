using System;
using System.Collections.Generic;
using System.Threading.Tasks;
using Avalonia;
using Avalonia.Controls;
using Avalonia.Input;
using Avalonia.Interactivity;
using Avalonia.Markup.Xaml;
using Avalonia.Platform.Storage;
using Avalonia.VisualTree;
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
    private Border? _slot1;
    private Border? _slot2;
    // A press that landed on a slot, keyed by pointer id so several fingers never confuse each other; an entry
    // is added on press and consumed on release.
    private readonly Dictionary<int, (bool IsFirst, Point Origin)> _slotPresses = new();

    public ScanPageView()
    {
        InitializeComponent();

        _slot1 = this.FindControl<Border>("Slot1");
        _slot2 = this.FindControl<Border>("Slot2");

        // Drag-and-drop has no XAML attribute for its routed events, so wire it per slot in code.
        WireDrop(_slot1, isFirst: true);
        WireDrop(_slot2, isFirst: false);

        // Tap-to-open is detected here at the page root, not on the slots, and not via the built-in Tapped
        // gesture (which the ScrollViewer preempts on a touch screen, so a real finger tap almost never fires).
        // Once the ScrollViewer captures the pointer to test for a scroll, the release routes up from IT; a slot
        // sits below the ScrollViewer so it never sees the release, but the root always does. We only observe
        // (never capture or mark handled), so scrolling stays intact. Bubble only: a Tunnel|Bubble subscription
        // would fire each handler twice.
        AddHandler(InputElement.PointerPressedEvent, OnRootPointerPressed,
            RoutingStrategies.Bubble, handledEventsToo: true);
        AddHandler(InputElement.PointerReleasedEvent, OnRootPointerReleased,
            RoutingStrategies.Bubble, handledEventsToo: true);
    }

    private void InitializeComponent() => AvaloniaXamlLoader.Load(this);

    private void WireDrop(Border? slot, bool isFirst)
    {
        if (slot is null)
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

    private void OnRootPointerPressed(object? sender, PointerPressedEventArgs e)
    {
        // Record which slot the press landed on, and where. e.Source is the true target here: any capture (for
        // a scroll) happens later, on move. Positions are relative to this UserControl, which hosts the
        // ScrollViewer and does not itself scroll, so press and release compare in the same frame.
        if (SlotOf(e.Source) is { } isFirst)
            _slotPresses[e.Pointer.Id] = (isFirst, e.GetPosition(this));
    }

    // A press that started on a slot and lifts having barely moved is a tap: open that slot's picker. A larger
    // move was a scroll and is ignored. Opening on release is fine for iOS: the sheet is only DOM here, and the
    // OS dialog opens later from its own input tap.
    private void OnRootPointerReleased(object? sender, PointerReleasedEventArgs e)
    {
        if (!_slotPresses.Remove(e.Pointer.Id, out (bool IsFirst, Point Origin) press))
            return;
        Point released = e.GetPosition(this);
        double dx = released.X - press.Origin.X;
        double dy = released.Y - press.Origin.Y;
        if (dx * dx + dy * dy <= TapMoveTolerance * TapMoveTolerance)
            _ = PickAsync(press.IsFirst);
    }

    // Which slot (if any) the pressed element sits inside: true = first, false = second, null = neither.
    private bool? SlotOf(object? source)
    {
        Visual? v = source as Visual;
        while (v is not null)
        {
            if (ReferenceEquals(v, _slot1)) return true;
            if (ReferenceEquals(v, _slot2)) return false;
            v = v.GetVisualParent();
        }
        return null;
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
