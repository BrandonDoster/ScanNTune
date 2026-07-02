using OpenCvSharp;

namespace ScanNTune.Core.Output;

/// <summary>Draws the detected rings and resolved orientation over a scan, as PNG bytes.</summary>
public interface IOverlayRenderer
{
    byte[] RenderPng(Mat image, CalibrationResult result);

    byte[] RenderPng(string imagePath, CalibrationResult result);

    /// <summary>
    /// Draws only the detected rings (no orientation), for a scan that failed to resolve — so the
    /// user can see what was captured. Crops to the rings when there are any.
    /// </summary>
    byte[] RenderDetectionPng(Mat image, IReadOnlyList<DetectedRing> rings);

    byte[] RenderDetectionPng(string imagePath, IReadOnlyList<DetectedRing> rings);
}
