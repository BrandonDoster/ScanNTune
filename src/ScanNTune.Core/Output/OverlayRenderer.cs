using OpenCvSharp;

namespace ScanNTune.Core.Output;

/// <summary>
/// Default overlay renderer. Draws each detected ring (green + centre dot), and — for a full result —
/// the resolved origin (red) and +X axis arrow (cyan), over a copy of the scan, cropped to the
/// detected coupon, encoded as PNG.
/// </summary>
public sealed class OverlayRenderer : IOverlayRenderer
{
    private readonly Scalar _ringColor = new(0, 255, 0);     // green (BGR)
    private readonly Scalar _centerColor = new(0, 255, 255); // yellow
    private readonly Scalar _originColor = new(0, 0, 255);   // red
    private readonly Scalar _axisColor = new(255, 255, 0);   // cyan

    public byte[] RenderPng(string imagePath, CalibrationResult result)
    {
        using Mat image = Load(imagePath);
        return RenderPng(image, result);
    }

    public byte[] RenderPng(Mat image, CalibrationResult result)
    {
        ArgumentNullException.ThrowIfNull(image);
        ArgumentNullException.ThrowIfNull(result);

        using Mat canvas = ToBgr(image);
        int thickness = Thickness(image);
        DrawRings(canvas, result.Rings, thickness);

        Orientation orientation = result.Orientation;
        double axisLength = MedianRadius(result.Rings) * 6.0;
        if (axisLength <= 0)
            axisLength = Math.Max(image.Width, image.Height) * 0.15;

        // Fixed-point (sub-pixel) coordinates so the markers land on the true fractional centre.
        const int shift = 3, scale = 1 << shift;
        Point origin = Fixed(orientation.OriginX, orientation.OriginY, scale);
        Point axisEnd = Fixed(
            orientation.OriginX + orientation.XAxisX * axisLength,
            orientation.OriginY + orientation.XAxisY * axisLength, scale);

        Cv2.Circle(canvas, origin, thickness * 3 * scale, _originColor, thickness, LineTypes.AntiAlias, shift);
        Cv2.ArrowedLine(canvas, origin, axisEnd, _axisColor, thickness + 1, LineTypes.AntiAlias, shift, tipLength: 0.2);

        return Encode(canvas, result.Rings, orientation);
    }

    public byte[] RenderDetectionPng(string imagePath, IReadOnlyList<DetectedRing> rings)
    {
        using Mat image = Load(imagePath);
        return RenderDetectionPng(image, rings);
    }

    public byte[] RenderDetectionPng(Mat image, IReadOnlyList<DetectedRing> rings)
    {
        ArgumentNullException.ThrowIfNull(image);
        ArgumentNullException.ThrowIfNull(rings);

        using Mat canvas = ToBgr(image);
        DrawRings(canvas, rings, Thickness(image));
        return Encode(canvas, rings, orientation: null);
    }

    private Mat Load(string imagePath)
    {
        Mat image = Cv2.ImRead(imagePath, ImreadModes.Color);
        if (image.Empty())
        {
            image.Dispose();
            throw new InvalidOperationException($"Could not read image: {imagePath}");
        }
        return image;
    }

    private Mat ToBgr(Mat image)
    {
        var canvas = new Mat();
        if (image.Channels() == 1)
            Cv2.CvtColor(image, canvas, ColorConversionCodes.GRAY2BGR);
        else
            image.CopyTo(canvas);
        return canvas;
    }

    private int Thickness(Mat image) => Math.Max(1, (int)Math.Round(Math.Max(image.Width, image.Height) / 500.0));

    private void DrawRings(Mat canvas, IReadOnlyList<DetectedRing> rings, int thickness)
    {
        // Fixed-point (sub-pixel) coordinates so the ring outline and centre dot land on the true
        // fractional centre rather than the nearest whole pixel.
        const int shift = 3, scale = 1 << shift;
        foreach (DetectedRing ring in rings)
        {
            Point center = Fixed(ring.CenterX, ring.CenterY, scale);
            Cv2.Circle(canvas, center, (int)Math.Round(ring.RadiusPx * scale), _ringColor, thickness, LineTypes.AntiAlias, shift);
            Cv2.Circle(canvas, center, (thickness + 1) * scale, _centerColor, -1, LineTypes.AntiAlias, shift);
        }
    }

    private Point Fixed(double x, double y, int scale) =>
        new((int)Math.Round(x * scale), (int)Math.Round(y * scale));

    private byte[] Encode(Mat canvas, IReadOnlyList<DetectedRing> rings, Orientation? orientation)
    {
        Mat cropped = CropToContent(canvas, rings, orientation);
        Cv2.ImEncode(".png", cropped, out byte[] png);
        if (!ReferenceEquals(cropped, canvas))
            cropped.Dispose();
        return png;
    }

    /// <summary>
    /// Returns a crop of <paramref name="canvas"/> tight around the detected rings (plus the +X
    /// arrow when an orientation is given) with a small margin, or the canvas itself when nothing
    /// was detected.
    /// </summary>
    private Mat CropToContent(Mat canvas, IReadOnlyList<DetectedRing> rings, Orientation? orientation)
    {
        if (rings.Count == 0)
            return canvas;

        double minX = double.MaxValue, minY = double.MaxValue, maxX = double.MinValue, maxY = double.MinValue;
        foreach (DetectedRing ring in rings)
        {
            minX = Math.Min(minX, ring.CenterX - ring.RadiusPx);
            maxX = Math.Max(maxX, ring.CenterX + ring.RadiusPx);
            minY = Math.Min(minY, ring.CenterY - ring.RadiusPx);
            maxY = Math.Max(maxY, ring.CenterY + ring.RadiusPx);
        }

        if (orientation is { } o)
        {
            double axisLength = MedianRadius(rings) * 6.0;
            minX = Math.Min(minX, o.OriginX);
            minY = Math.Min(minY, o.OriginY);
            maxX = Math.Max(maxX, o.OriginX + o.XAxisX * axisLength);
            maxY = Math.Max(maxY, o.OriginY + o.XAxisY * axisLength);
        }

        double margin = Math.Max(MedianRadius(rings) * 1.2, (maxX - minX) * 0.05);
        int x0 = Math.Clamp((int)Math.Floor(minX - margin), 0, canvas.Width - 1);
        int y0 = Math.Clamp((int)Math.Floor(minY - margin), 0, canvas.Height - 1);
        int x1 = Math.Clamp((int)Math.Ceiling(maxX + margin), x0 + 1, canvas.Width);
        int y1 = Math.Clamp((int)Math.Ceiling(maxY + margin), y0 + 1, canvas.Height);

        return new Mat(canvas, new Rect(x0, y0, x1 - x0, y1 - y0)).Clone();
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
