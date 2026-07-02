using OpenCvSharp;

namespace ScanNTune.Core.Detection;

/// <summary>Locates the calibration coupon's ring centres in a scanned image.</summary>
public interface IRingDetector
{
    IReadOnlyList<DetectedRing> Detect(Mat image);
}
