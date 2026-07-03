using MathNet.Numerics;
using MathNet.Numerics.Statistics;
using Microsoft.Extensions.Logging;
using OpenCvSharp;

namespace ScanNTune.Core.Calibration;

/// <summary>
/// Measures a reference card's long side to sub-pixel precision. It locates the card as the largest
/// object that contrasts with the (assumed uniform) background — working for a dark card on white or
/// a pale card on a dark backing alike — then fits each long edge as a straight line from sub-pixel
/// gradient-peak edge points (one per scan row) and takes the perpendicular distance between the two
/// lines. Fitting the whole straight edge is what makes the result independent of where the card sits,
/// how it's rotated, and any single bad row; only the card's colour must differ from the background.
///
/// The long side is measured in a frame where it runs horizontally (a portrait card is transposed
/// first), so one left/right edge routine covers both orientations.
/// </summary>
public sealed class CardEdgeMeasurer : IScaleReferenceMeasurer
{
    private readonly ILogger<CardEdgeMeasurer>? _logger;

    public CardEdgeMeasurer(ILogger<CardEdgeMeasurer>? logger = null)
    {
        _logger = logger;
    }

    public ScaleReferenceResult Measure(string imagePath, double knownLongSideMm, double nominalDpi)
    {
        using Mat image = Cv2.ImRead(imagePath, ImreadModes.Color);
        if (image.Empty())
            return Fail($"Could not read the image: {imagePath}");
        return Measure(image, knownLongSideMm, nominalDpi);
    }

    public ScaleReferenceResult Measure(Mat image, double knownLongSideMm, double nominalDpi)
    {
        if (image is null || image.Empty())
            throw new ArgumentException("Image is null or empty.", nameof(image));
        if (knownLongSideMm <= 0)
            throw new ArgumentOutOfRangeException(nameof(knownLongSideMm), "The reference length must be positive.");

        using Mat gray = ToGray(image);
        if (!TryFindCardBox(gray, out Rect box, out string? boxError))
            return Fail(boxError!);

        bool portrait = box.Height > box.Width;
        Mat work = gray;
        Mat? transposed = null;
        Rect wbox = box;
        if (portrait)
        {
            transposed = new Mat();
            Cv2.Transpose(gray, transposed);
            work = transposed;
            wbox = new Rect(box.Y, box.X, box.Height, box.Width);
        }

        try
        {
            int halfWin = Math.Clamp((int)(wbox.Width * 0.02), 12, 60);
            int y0 = wbox.Y + (int)(wbox.Height * 0.15);
            int y1 = wbox.Y + (int)(wbox.Height * 0.85);

            (double mL, double cL, double rmsL, int nL) = FitVerticalEdge(work, y0, y1, wbox.Left, halfWin);
            (double mR, double cR, double rmsR, int nR) = FitVerticalEdge(work, y0, y1, wbox.Right, halfWin);
            if (nL < 15 || nR < 15)
                return Fail("Couldn't trace the card's long edges. Check the scan contrast and that the whole card is on the glass.");

            double yMid = (y0 + y1) / 2.0;
            double xL = mL * yMid + cL;
            double xR = mR * yMid + cR;
            double mAvg = (mL + mR) / 2.0;
            double widthPx = (xR - xL) / Math.Sqrt(1 + mAvg * mAvg);
            if (widthPx <= 0)
                return Fail("The detected edges don't bound a card. Try re-scanning.");

            double pxPerMm = widthPx / knownLongSideMm;
            double parallelDeg = Math.Abs(Math.Atan(mL) - Math.Atan(mR)) * 180.0 / Math.PI;
            double straightness = Math.Max(rmsL, rmsR);
            double detectedMm = nominalDpi > 0 ? widthPx / (nominalDpi / 25.4) : 0;

            return new ScaleReferenceResult(true, pxPerMm, widthPx, detectedMm, straightness, parallelDeg, Math.Min(nL, nR));
        }
        finally
        {
            transposed?.Dispose();
        }
    }

    private Mat ToGray(Mat image)
    {
        var gray = new Mat();
        if (image.Channels() == 1)
            image.CopyTo(gray);
        else
            Cv2.CvtColor(image, gray, ColorConversionCodes.BGR2GRAY);

        // The per-pixel access below assumes 8-bit; down-convert a 16-bit (or deeper) scan so a
        // high-bit-depth TIFF doesn't misread as bytes.
        if (gray.Type() != MatType.CV_8UC1)
        {
            var gray8 = new Mat();
            double scale = gray.ElemSize() >= 2 ? 255.0 / 65535.0 : 1.0;
            gray.ConvertTo(gray8, MatType.CV_8U, scale);
            gray.Dispose();
            gray = gray8;
        }
        return gray;
    }

    /// <summary>
    /// Finds the card as the largest external contour after separating it from the background by an
    /// Otsu threshold, with the polarity chosen from the border so it works whether the card is
    /// darker or brighter than the background.
    /// </summary>
    private bool TryFindCardBox(Mat gray, out Rect box, out string? error)
    {
        box = default;
        error = null;
        using var binary = new Mat();
        Cv2.Threshold(gray, binary, 0, 255, ThresholdTypes.Binary | ThresholdTypes.Otsu);
        if (BorderMean(binary) > 127.0)
            Cv2.BitwiseNot(binary, binary); // make the card white whichever way the contrast falls

        using var kernel = Cv2.GetStructuringElement(MorphShapes.Ellipse, new Size(5, 5));
        Cv2.MorphologyEx(binary, binary, MorphTypes.Close, kernel);

        Cv2.FindContours(binary, out Point[][] contours, out _, RetrievalModes.External, ContourApproximationModes.ApproxSimple);
        double bestArea = 0;
        Rect best = default;
        foreach (Point[] contour in contours)
        {
            Rect r = Cv2.BoundingRect(contour);
            double area = (double)r.Width * r.Height;
            if (area > bestArea)
            {
                bestArea = area;
                best = r;
            }
        }

        if (bestArea <= 0)
        {
            error = "No object found in the scan.";
            return false;
        }
        if (best.Width < 120 || best.Height < 120)
        {
            error = "The detected object is too small. Is the card in the scan?";
            return false;
        }
        if (bestArea / ((double)gray.Width * gray.Height) > 0.92)
        {
            error = "Couldn't separate the card from the background. A pale card needs a dark sheet behind it.";
            return false;
        }
        box = best;
        return true;
    }

    /// <summary>
    /// Fits x = c + m·y to a near-vertical edge — one sub-pixel edge point per row in the search band,
    /// via MathNet's least-squares line fit, then one robust (MAD) outlier-rejection pass so a stray
    /// row (a dust speck or a smudge on one line) can't tilt the edge.
    /// </summary>
    private (double m, double c, double rms, int n) FitVerticalEdge(Mat img, int y0, int y1, int xCentre, int halfWin)
    {
        var ys = new List<double>();
        var xs = new List<double>();
        for (int y = y0; y <= y1; y++)
        {
            double xe = SubPixEdge(img, y, xCentre - halfWin, xCentre + halfWin);
            if (!double.IsNaN(xe))
            {
                ys.Add(y);
                xs.Add(xe);
            }
        }
        if (ys.Count < 3)
            return (0, 0, 0, ys.Count);

        double[] ya = ys.ToArray();
        double[] xa = xs.ToArray();
        (double c, double m) = Fit.Line(ya, xa); // x = c + m·y

        // Robust scale from the residuals (MAD → Gaussian sigma, as in AffineSolver); skip rejection
        // when the residuals are ~0 (a clean fit with nothing to trim).
        double[] absResiduals = new double[ya.Length];
        for (int i = 0; i < ya.Length; i++)
            absResiduals[i] = Math.Abs(xa[i] - (m * ya[i] + c));
        double sigma = 1.4826 * Statistics.Median(absResiduals);
        if (sigma > 1e-6)
        {
            var y2 = new List<double>();
            var x2 = new List<double>();
            for (int i = 0; i < ya.Length; i++)
            {
                if (absResiduals[i] <= 3 * sigma)
                {
                    y2.Add(ya[i]);
                    x2.Add(xa[i]);
                }
            }
            if (y2.Count >= 3)
            {
                ya = y2.ToArray();
                xa = x2.ToArray();
                (c, m) = Fit.Line(ya, xa);
            }
        }
        return (m, c, Rms(ya, xa, m, c), ya.Length);
    }

    /// <summary>
    /// Sub-pixel column position of the strongest intensity step within [xLo, xHi] on row y, via the
    /// gradient magnitude peak with parabolic interpolation. Magnitude (not sign) so it finds the
    /// edge for either card/background polarity.
    /// </summary>
    private double SubPixEdge(Mat img, int y, int xLo, int xHi)
    {
        xLo = Math.Max(1, xLo);
        xHi = Math.Min(img.Cols - 2, xHi);
        double best = -1;
        int bx = -1;
        for (int x = xLo; x <= xHi; x++)
        {
            double g = Math.Abs(img.At<byte>(y, x + 1) - img.At<byte>(y, x - 1));
            if (g > best)
            {
                best = g;
                bx = x;
            }
        }
        if (bx <= xLo || bx >= xHi || best < 8)
            return double.NaN; // no real edge here (a flat, noise-only window)

        double gm = Math.Abs(img.At<byte>(y, bx) - img.At<byte>(y, bx - 2));
        double gc = Math.Abs(img.At<byte>(y, bx + 1) - img.At<byte>(y, bx - 1));
        double gp = Math.Abs(img.At<byte>(y, bx + 2) - img.At<byte>(y, bx));
        double denom = gm - 2 * gc + gp;
        double sub = Math.Abs(denom) < 1e-9 ? 0 : 0.5 * (gm - gp) / denom;
        return bx + Math.Clamp(sub, -1, 1);
    }

    private double Rms(double[] ys, double[] xs, double m, double c)
    {
        if (ys.Length == 0)
            return 0;
        double s = 0;
        for (int i = 0; i < ys.Length; i++)
        {
            double e = xs[i] - (m * ys[i] + c);
            s += e * e;
        }
        return Math.Sqrt(s / ys.Length);
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

    private ScaleReferenceResult Fail(string message)
    {
        _logger?.LogInformation("Scale reference not measured: {Message}", message);
        return new ScaleReferenceResult(false, 0, 0, 0, 0, 0, 0, message);
    }
}
