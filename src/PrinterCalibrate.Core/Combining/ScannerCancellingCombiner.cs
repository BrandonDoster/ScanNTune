namespace PrinterCalibrate.Core.Combining;

/// <summary>
/// Cancels the scanner's fixed geometric error by averaging two scans taken a quarter-turn apart.
///
/// A flatbed scanner applies a distortion that is fixed in the bed frame (its X and Y scales differ,
/// plus a small skew). Both scans are already reported in the coupon's own frame — the two-solid
/// marker resolves the axes — so for scan A the coupon's X lies along the scanner's X, while for the
/// quarter-turned scan B the coupon's X lies along the scanner's Y. Writing each measurement as
/// printer + scanner, the part-frame readings are:
///   A.X = pX + sX,  A.Y = pY + sY,   A.skew = pSkew + sSkew
///   B.X = pX + sY,  B.Y = pY + sX,   B.skew = pSkew − sSkew
/// so the average recovers the printer term (scanner cancels) and the half-difference recovers the
/// scanner term. Only the anisotropy (X vs Y) and skew are separated this way; the scanner's common
/// isotropic scale still rides along with absolute size and needs the DPI reference, as before.
/// </summary>
public sealed class ScannerCancellingCombiner : IScanCombiner
{
    /// <summary>How far from an exact 90° the turn between scans may drift before the pair is flagged.</summary>
    public const double QuarterTurnToleranceDegrees = 20.0;

    public TwoScanResult Combine(CalibrationResult scanA, CalibrationResult scanB)
    {
        ArgumentNullException.ThrowIfNull(scanA);
        ArgumentNullException.ThrowIfNull(scanB);

        double printerX = 0.5 * (scanA.XScalePercent + scanB.XScalePercent);
        double printerY = 0.5 * (scanA.YScalePercent + scanB.YScalePercent);
        double printerSkew = 0.5 * (scanA.SkewDegrees + scanB.SkewDegrees);

        // Two independent estimates of the scanner's X-vs-Y bias (from the X pair and the Y pair); average them.
        double scannerAniso = 0.5 * ((scanA.XScalePercent - scanB.XScalePercent)
                                     + (scanB.YScalePercent - scanA.YScalePercent));
        double scannerSkew = 0.5 * (scanA.SkewDegrees - scanB.SkewDegrees);

        double turned = TurnBetween(scanA.Orientation.XAxisAngleDegrees, scanB.Orientation.XAxisAngleDegrees);
        bool rotationValid = QuarterTurnError(turned) <= QuarterTurnToleranceDegrees;

        var combined = new CalibrationResult(
            printerX,
            printerY,
            printerSkew,
            Math.Min(scanA.RingsDetected, scanB.RingsDetected),
            0.5 * (scanA.MeasuredPxPerMmX + scanB.MeasuredPxPerMmX),
            0.5 * (scanA.MeasuredPxPerMmY + scanB.MeasuredPxPerMmY),
            Math.Max(scanA.RmsResidualPx, scanB.RmsResidualPx),
            scanA.Rings,
            scanA.Orientation);

        return new TwoScanResult(
            combined,
            new ScannerDiagnostic(scannerAniso, scannerSkew),
            scanA,
            scanB,
            turned,
            rotationValid);
    }

    /// <summary>Signed-free turn from A's +X to B's +X, folded into [0, 360).</summary>
    private double TurnBetween(double angleADegrees, double angleBDegrees)
    {
        double diff = (angleBDegrees - angleADegrees) % 360.0;
        return diff < 0 ? diff + 360.0 : diff;
    }

    /// <summary>Distance (degrees) from a turn to the nearest quarter-turn (90° or 270°).</summary>
    private double QuarterTurnError(double turnedDegrees) =>
        Math.Min(Math.Abs(turnedDegrees - 90.0), Math.Abs(turnedDegrees - 270.0));
}
