namespace ScanNTune.Core;

/// <summary>
/// A ring located in the scan. The centre is in pixel coordinates (sub-pixel via the
/// contour centroid) and is the quantity used for scale/skew — it is immune to over/under
/// extrusion. Radius and circularity are kept for diagnostics and filtering.
/// </summary>
public readonly record struct DetectedRing(
    double CenterX,
    double CenterY,
    double RadiusPx,
    double Circularity);
