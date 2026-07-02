namespace ScanNTune.Core;

/// <summary>
/// Thrown when a scan is detected but cannot be resolved into a calibration (e.g. the orientation
/// marker can't be found, or too few rings survived). Carries <see cref="DetectedRings"/> — whatever
/// the detector did find — so the UI can still show the user what was captured instead of only an error.
/// </summary>
public sealed class CouponAnalysisException : Exception
{
    public CouponAnalysisException(string message, IReadOnlyList<DetectedRing> detectedRings)
        : base(message)
    {
        DetectedRings = detectedRings;
    }

    public IReadOnlyList<DetectedRing> DetectedRings { get; }
}
