using OpenCvSharp;

namespace ScanNTune.Core.Output;

/// <summary>Draws the detected rings and resolved orientation over a scan.</summary>
public interface IOverlayRenderer
{
    /// <summary>
    /// Draws the rings, origin and +X axis over a copy of the scan and crops to the content, returning the
    /// annotated BGR image. Uses only OpenCV drawing (no image codec), so it works in the browser's wasm
    /// OpenCV build where the caller turns the Mat into a bitmap directly rather than encoding a PNG.
    /// </summary>
    Mat RenderOverlay(Mat image, CalibrationResult result);

    /// <summary>Draws only the detected rings (no orientation), for a scan that failed to resolve.</summary>
    Mat RenderDetectionOverlay(Mat image, IReadOnlyList<DetectedRing> rings);
}
