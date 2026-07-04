using System;
using Avalonia;
using Avalonia.Controls;

namespace ScanNTune.UI.Controls;

/// <summary>
/// Lays its children in a row while it is at least <see cref="Breakpoint"/> device-independent pixels
/// wide, and folds them into a full-width stacked column once it is narrower. Children marked with the
/// attached <c>ResponsiveStack.Fill="True"</c> flag share the leftover row width equally (the flexible
/// tiles); unmarked children keep their desired width (a small connector or label). When stacked every
/// child stretches to the panel width. This gives the pages one width-driven reflow (phone, or a narrow
/// desktop window) without per-view code-behind. While stacked the panel carries the <c>:stacked</c>
/// pseudo-class so styles can, for example, turn a connector arrow to point down.
/// </summary>
public sealed class ResponsiveStack : Panel
{
    public static readonly StyledProperty<double> BreakpointProperty =
        AvaloniaProperty.Register<ResponsiveStack, double>(nameof(Breakpoint), 520);

    public static readonly StyledProperty<double> SpacingProperty =
        AvaloniaProperty.Register<ResponsiveStack, double>(nameof(Spacing), 10);

    /// <summary>
    /// Reverses child order in the wide (row) layout only, leaving the declared order to drive the stacked
    /// column. This lets a page read info-then-pictures when stacked yet show pictures-then-info in a row.
    /// </summary>
    public static readonly StyledProperty<bool> ReverseWhenWideProperty =
        AvaloniaProperty.Register<ResponsiveStack, bool>(nameof(ReverseWhenWide));

    /// <summary>Marks a child as a flexible tile that shares the leftover row width equally.</summary>
    public static readonly AttachedProperty<bool> FillProperty =
        AvaloniaProperty.RegisterAttached<ResponsiveStack, Control, bool>("Fill");

    private bool _stacked;

    static ResponsiveStack()
    {
        AffectsMeasure<ResponsiveStack>(BreakpointProperty, SpacingProperty);
        AffectsArrange<ResponsiveStack>(ReverseWhenWideProperty);
    }

    public double Breakpoint
    {
        get => GetValue(BreakpointProperty);
        set => SetValue(BreakpointProperty, value);
    }

    public double Spacing
    {
        get => GetValue(SpacingProperty);
        set => SetValue(SpacingProperty, value);
    }

    public bool ReverseWhenWide
    {
        get => GetValue(ReverseWhenWideProperty);
        set => SetValue(ReverseWhenWideProperty, value);
    }

    public static bool GetFill(Control control) => control.GetValue(FillProperty);

    public static void SetFill(Control control, bool value) => control.SetValue(FillProperty, value);

    protected override Size MeasureOverride(Size availableSize)
    {
        var children = Children;
        int count = children.Count;
        if (count == 0)
            return default;

        double spacing = Spacing;
        // An unconstrained width (measured inside something that gives infinite width) can't be split into a
        // row, so treat it as stacked; in practice the pages constrain width (a scroll viewer's viewport).
        bool horizontal = !double.IsInfinity(availableSize.Width) && availableSize.Width >= Breakpoint;
        SetStacked(!horizontal);

        if (!horizontal)
        {
            double width = 0, height = 0;
            for (int i = 0; i < count; i++)
            {
                Control child = children[i];
                child.Measure(new Size(availableSize.Width, double.PositiveInfinity));
                width = Math.Max(width, child.DesiredSize.Width);
                height += child.DesiredSize.Height;
            }
            height += spacing * (count - 1);
            return new Size(double.IsInfinity(availableSize.Width) ? width : availableSize.Width, height);
        }

        double totalSpacing = spacing * (count - 1);
        double fixedWidth = 0;
        int fillCount = 0;
        for (int i = 0; i < count; i++)
        {
            Control child = children[i];
            if (GetFill(child))
            {
                fillCount++;
                continue;
            }
            // Bounded width (not infinite) so a fixed-width non-Fill child with wrapping content reports the
            // width it will actually occupy, leaving the rest for the Fill children.
            child.Measure(new Size(availableSize.Width, availableSize.Height));
            fixedWidth += child.DesiredSize.Width;
        }

        double each = fillCount > 0 ? Math.Max(0, availableSize.Width - totalSpacing - fixedWidth) / fillCount : 0;
        double rowHeight = 0;
        for (int i = 0; i < count; i++)
        {
            Control child = children[i];
            if (GetFill(child))
                child.Measure(new Size(each, availableSize.Height));
            rowHeight = Math.Max(rowHeight, child.DesiredSize.Height);
        }
        return new Size(availableSize.Width, rowHeight);
    }

    protected override Size ArrangeOverride(Size finalSize)
    {
        var children = Children;
        int count = children.Count;
        if (count == 0)
            return finalSize;

        double spacing = Spacing;
        if (_stacked)
        {
            double y = 0;
            for (int i = 0; i < count; i++)
            {
                Control child = children[i];
                double h = child.DesiredSize.Height;
                child.Arrange(new Rect(0, y, finalSize.Width, h));
                y += h + spacing;
            }
            return finalSize;
        }

        double totalSpacing = spacing * (count - 1);
        double fixedWidth = 0;
        int fillCount = 0;
        for (int i = 0; i < count; i++)
        {
            Control child = children[i];
            if (GetFill(child))
                fillCount++;
            else
                fixedWidth += child.DesiredSize.Width;
        }

        double each = fillCount > 0 ? Math.Max(0, finalSize.Width - totalSpacing - fixedWidth) / fillCount : 0;
        bool reverse = ReverseWhenWide;
        double x = 0;
        for (int i = 0; i < count; i++)
        {
            Control child = children[reverse ? count - 1 - i : i];
            double w = GetFill(child) ? each : child.DesiredSize.Width;
            child.Arrange(new Rect(x, 0, w, finalSize.Height));
            x += w + spacing;
        }
        return finalSize;
    }

    private void SetStacked(bool stacked)
    {
        if (_stacked == stacked)
            return;
        _stacked = stacked;
        PseudoClasses.Set(":stacked", stacked);
    }
}
