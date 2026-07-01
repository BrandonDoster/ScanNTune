namespace PrinterCalibrate.Core;

/// <summary>
/// The best-fit affine map from nominal millimetres to measured pixels, decomposed into the
/// quantities we care about: per-axis scale (px per mm) and the skew (deviation of the X/Y
/// axes from perpendicular, in degrees).
/// </summary>
public sealed record AffineModel(
    double ScaleXPxPerMm,
    double ScaleYPxPerMm,
    double SkewDegrees,
    double RmsResidualPx,
    int PointCount);
