namespace ScanNTune.Core;

/// <summary>
/// The best-fit affine map from nominal millimetres to measured pixels, decomposed into the
/// quantities we care about: per-axis scale (px per mm) and the skew error (the X/Y corner
/// angle minus 90°; positive = opened past square, negative = closed, i.e. sheared x' = x + t·y).
/// </summary>
public sealed record AffineModel(
    double ScaleXPxPerMm,
    double ScaleYPxPerMm,
    double SkewDegrees,
    double RmsResidualPx,
    int PointCount);
