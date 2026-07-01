namespace PrinterCalibrate.Core.Combining;

/// <summary>
/// Combines two scans of the same coupon — the second taken after a quarter-turn — into a single
/// result whose scale/skew are free of the scanner's own geometric distortion.
/// </summary>
public interface IScanCombiner
{
    TwoScanResult Combine(CalibrationResult scanA, CalibrationResult scanB);
}
