namespace ScanNTune.Core;

/// <summary>
/// The outcome of analysing a scanned calibration coupon. Scale figures are percentage errors
/// (measured vs nominal; positive = oversize); skew is the corner-angle error in degrees,
/// measured minus the nominal 90° (positive = opened past square, negative = closed, i.e.
/// sheared x' = x + t·y).
/// </summary>
public sealed record CalibrationResult(
    double XScalePercent,
    double YScalePercent,
    double SkewDegrees,
    int RingsDetected,
    double MeasuredPxPerMmX,
    double MeasuredPxPerMmY,
    double RmsResidualPx,
    IReadOnlyList<DetectedRing> Rings,
    Orientation Orientation);
