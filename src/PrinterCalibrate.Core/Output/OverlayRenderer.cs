using OpenCvSharp;

namespace PrinterCalibrate.Core.Output;

/// <summary>
/// Default overlay renderer. Draws each detected ring (green + centre dot), the resolved origin
/// (red), and the +X axis arrow (cyan) over a copy of the scan, and encodes it as PNG.
/// </summary>
public sealed class OverlayRenderer : IOverlayRenderer
{
    private readonly Scalar _ringColor = new(0, 255, 0);     // green (BGR)
    private readonly Scalar _centerColor = new(0, 255, 255); // yellow
    private readonly Scalar _originColor = new(0, 0, 255);   // red
    private readonly Scalar _axisColor = new(255, 255, 0);   // cyan

    public byte[] RenderPng(string imagePath, CalibrationResult result)
    {
        using Mat image = Cv2.ImRead(imagePath, ImreadModes.Color);
        if (image.Empty())
            throw new InvalidOperationException($"Could not read image: {imagePath}");
        return RenderPng(image, result);
    }

    public byte[] RenderPng(Mat image, CalibrationResult result)
    {
        ArgumentNullException.ThrowIfNull(image);
        ArgumentNullException.ThrowIfNull(result);

        using var canvas = new Mat();
        if (image.Channels() == 1)
            Cv2.CvtColor(image, canvas, ColorConversionCodes.GRAY2BGR);
        else
            image.CopyTo(canvas);

        int thickness = Math.Max(1, (int)Math.Round(Math.Max(image.Width, image.Height) / 500.0));

        foreach (DetectedRing ring in result.Rings)
        {
            var center = new Point((int)Math.Round(ring.CenterX), (int)Math.Round(ring.CenterY));
            Cv2.Circle(canvas, center, (int)Math.Round(ring.RadiusPx), _ringColor, thickness, LineTypes.AntiAlias);
            Cv2.Circle(canvas, center, thickness + 1, _centerColor, -1, LineTypes.AntiAlias);
        }

        Orientation orientation = result.Orientation;
        var origin = new Point((int)Math.Round(orientation.OriginX), (int)Math.Round(orientation.OriginY));
        double axisLength = MedianRadius(result.Rings) * 6.0;
        if (axisLength <= 0)
            axisLength = Math.Max(image.Width, image.Height) * 0.15;

        var axisEnd = new Point(
            (int)Math.Round(orientation.OriginX + orientation.XAxisX * axisLength),
            (int)Math.Round(orientation.OriginY + orientation.XAxisY * axisLength));

        Cv2.Circle(canvas, origin, thickness * 3, _originColor, thickness, LineTypes.AntiAlias);
        Cv2.ArrowedLine(canvas, origin, axisEnd, _axisColor, thickness + 1, LineTypes.AntiAlias, tipLength: 0.2);

        Cv2.ImEncode(".png", canvas, out byte[] png);
        return png;
    }

    private double MedianRadius(IReadOnlyList<DetectedRing> rings)
    {
        if (rings.Count == 0)
            return 0;
        var sorted = rings.Select(r => r.RadiusPx).OrderBy(r => r).ToList();
        int n = sorted.Count;
        return n % 2 == 1 ? sorted[n / 2] : (sorted[n / 2 - 1] + sorted[n / 2]) / 2.0;
    }
}
