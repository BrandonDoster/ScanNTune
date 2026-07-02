using OpenCvSharp;

namespace PrinterCalibrate.Core.Calibration;

/// <summary>
/// Measures a known-length reference object in a scan to recover the scan's true pixels-per-mm.
/// </summary>
public interface IScaleReferenceMeasurer
{
    /// <param name="image">The scan containing only the reference on a contrasting background.</param>
    /// <param name="knownLongSideMm">The reference's measured long side, in millimetres.</param>
    /// <param name="nominalDpi">The DPI the scan was captured at — used only to report the detected
    /// size in millimetres for the caller's sanity check, not for the px/mm result itself.</param>
    ScaleReferenceResult Measure(Mat image, double knownLongSideMm, double nominalDpi);

    /// <summary>Loads the scan from disk and measures it, so callers need not touch OpenCV.</summary>
    ScaleReferenceResult Measure(string imagePath, double knownLongSideMm, double nominalDpi);
}
