namespace PrinterCalibrate.Core.Output;

/// <summary>
/// Produces firmware/slicer corrections on demand for a chosen "flavour", so the UI can show
/// just the one the user needs. Size flavours that need the printer's current values
/// (steps/mm, rotation distance) recompute when those values change.
/// </summary>
public interface ICorrectionFormatter
{
    IReadOnlyList<string> SkewFlavours { get; }

    IReadOnlyList<string> SizeFlavours { get; }

    /// <summary>
    /// The label for the "current values" inputs a size flavour needs (e.g. "current steps/mm"),
    /// or null if the flavour needs none. Keeps flavour-specific UI text in the formatter.
    /// </summary>
    string? CurrentValueLabel(string sizeFlavour);

    Correction Skew(string flavour, double skewDegrees, CouponSpec coupon);

    Correction Size(string flavour, double xScalePercent, double yScalePercent, double? currentX, double? currentY);
}
