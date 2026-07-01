using OpenCvSharp;

namespace PrinterCalibrate.Core.Detection;

/// <summary>
/// Default ring detector. Thresholds the part against the background (on the HSV value
/// channel, so multi-colour toolpath renders and real scans both segment cleanly), finds the
/// enclosed holes, and keeps the ring centres. Ring holes are separated from the much larger
/// square lattice cells by <see cref="FilterByRadius"/> (a size cluster), so circularity is only
/// a loose gate to drop slivers — real printed/scanned holes are rough (circularity ~0.2–0.8),
/// so a strict threshold would reject them.
/// </summary>
public sealed class RingDetector : IRingDetector
{
    private readonly double _minHoleAreaPx;
    private readonly double _minCircularity;

    public RingDetector(double minHoleAreaPx = 40.0, double minCircularity = 0.20)
    {
        _minHoleAreaPx = minHoleAreaPx;
        _minCircularity = minCircularity;
    }

    public IReadOnlyList<DetectedRing> Detect(Mat image)
    {
        if (image is null || image.Empty())
            throw new ArgumentException("Image is null or empty.", nameof(image));

        using var value = ExtractValueChannel(image);
        using var binary = new Mat();
        Cv2.Threshold(value, binary, 0, 255, ThresholdTypes.Binary | ThresholdTypes.Otsu);

        // Make the part white and the background black, whichever way the contrast falls.
        if (BorderMean(binary) > 127.0)
            Cv2.BitwiseNot(binary, binary);

        using var kernel = Cv2.GetStructuringElement(MorphShapes.Ellipse, new Size(3, 3));
        Cv2.MorphologyEx(binary, binary, MorphTypes.Close, kernel);

        Cv2.FindContours(binary, out Point[][] contours, out HierarchyIndex[] hierarchy,
            RetrievalModes.CComp, ContourApproximationModes.ApproxNone);

        var candidates = new List<DetectedRing>();
        for (int i = 0; i < contours.Length; i++)
        {
            if (hierarchy[i].Parent < 0)
                continue; // only interior contours (holes) can be ring centres

            Point[] contour = contours[i];
            double area = Cv2.ContourArea(contour);
            if (area < _minHoleAreaPx)
                continue;

            double perimeter = Cv2.ArcLength(contour, true);
            if (perimeter <= 0)
                continue;

            double circularity = 4.0 * Math.PI * area / (perimeter * perimeter);
            if (circularity < _minCircularity)
                continue;

            Moments moments = Cv2.Moments(contour);
            if (moments.M00 == 0)
                continue;

            double cx = moments.M10 / moments.M00;
            double cy = moments.M01 / moments.M00;
            double radius = Math.Sqrt(area / Math.PI);
            candidates.Add(new DetectedRing(cx, cy, radius, circularity));
        }

        return FilterByRadius(candidates);
    }

    /// <summary>Drop anything whose radius is far from the population median (stray holes).</summary>
    private List<DetectedRing> FilterByRadius(List<DetectedRing> candidates)
    {
        if (candidates.Count == 0)
            return candidates;

        double median = Median(candidates.Select(c => c.RadiusPx));
        return candidates
            .Where(c => c.RadiusPx >= median * 0.5 && c.RadiusPx <= median * 1.8)
            .ToList();
    }

    private Mat ExtractValueChannel(Mat image)
    {
        if (image.Channels() == 1)
            return image.Clone();

        using var hsv = new Mat();
        Cv2.CvtColor(image, hsv, ColorConversionCodes.BGR2HSV);
        Mat[] channels = Cv2.Split(hsv);
        try
        {
            return channels[2].Clone(); // V = max(B,G,R)
        }
        finally
        {
            foreach (Mat channel in channels)
                channel.Dispose();
        }
    }

    private double BorderMean(Mat binary)
    {
        using Mat top = binary.Row(0);
        using Mat bottom = binary.Row(binary.Rows - 1);
        using Mat left = binary.Col(0);
        using Mat right = binary.Col(binary.Cols - 1);
        return (Cv2.Mean(top).Val0 + Cv2.Mean(bottom).Val0 +
                Cv2.Mean(left).Val0 + Cv2.Mean(right).Val0) / 4.0;
    }

    private double Median(IEnumerable<double> values)
    {
        var sorted = values.OrderBy(v => v).ToList();
        int n = sorted.Count;
        if (n == 0)
            return 0;
        return n % 2 == 1 ? sorted[n / 2] : (sorted[n / 2 - 1] + sorted[n / 2]) / 2.0;
    }
}
