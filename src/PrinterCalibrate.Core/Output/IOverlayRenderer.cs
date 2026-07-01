using OpenCvSharp;

namespace PrinterCalibrate.Core.Output;

/// <summary>Draws the detected rings and resolved orientation over a scan, as PNG bytes.</summary>
public interface IOverlayRenderer
{
    byte[] RenderPng(Mat image, CalibrationResult result);

    byte[] RenderPng(string imagePath, CalibrationResult result);
}
