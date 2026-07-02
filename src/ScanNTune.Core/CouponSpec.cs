namespace ScanNTune.Core;

/// <summary>
/// The nominal geometry of the calibration coupon, matching calibration_coupon.scad.
/// All measurements are in millimetres.
/// </summary>
public sealed record CouponSpec
{
    /// <summary>Centre-to-centre span of the outermost rings.</summary>
    public double BaselineMm { get; init; } = 100.0;

    /// <summary>Number of rings per side (grid is GridN x GridN).</summary>
    public int GridN { get; init; } = 5;

    public double RingOuterDiameterMm { get; init; } = 9.0;

    public double RingWallMm { get; init; } = 2.0;

    public double RingInnerDiameterMm => RingOuterDiameterMm - 2.0 * RingWallMm;

    /// <summary>Centre-to-centre distance between neighbouring rings.</summary>
    public double PitchMm => BaselineMm / (GridN - 1);
}
