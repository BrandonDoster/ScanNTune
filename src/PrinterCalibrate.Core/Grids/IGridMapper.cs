namespace PrinterCalibrate.Core.Grids;

/// <summary>
/// Assigns each detected ring its (col,row) index in the nominal grid and resolves the coupon's
/// orientation from the solid origin fiducial, so results are correct at any scan rotation.
/// </summary>
public interface IGridMapper
{
    GridMapping Map(IReadOnlyList<DetectedRing> rings, CouponSpec spec);
}
