namespace ScanNTune.Core;

/// <summary>
/// The coupon's pose in the image: where the origin fiducial sits and which way the printer's
/// +X axis points (unit vector, pixel space, image-y downward). <see cref="Flipped"/> is true
/// when the coupon was scanned mirror-flipped (the two-solid marker resolves it automatically).
/// </summary>
public sealed record Orientation(
    bool Flipped,
    double OriginX,
    double OriginY,
    double XAxisX,
    double XAxisY)
{
    /// <summary>Angle of the +X axis in image degrees (0 = right, 90 = down).</summary>
    public double XAxisAngleDegrees => Math.Atan2(XAxisY, XAxisX) * 180.0 / Math.PI;
}
