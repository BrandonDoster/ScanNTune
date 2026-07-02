using OpenCvSharp;
using PrinterCalibrate.Core.Calibration;

namespace PrinterCalibrate.Tests;

/// <summary>
/// The card measurer must recover the scan's true px/mm from a card's long side regardless of the
/// card's colour (dark on light or light on dark), its orientation, or a small rotation — because it
/// fits the whole straight edge. These are portable: synthetic card images, no fixture needed.
/// </summary>
[TestFixture]
public class CardEdgeMeasurerTests
{
    private const double LongMm = 85.6;
    private const double Dpi = 254.0;         // → exactly 10 px/mm nominal
    private const double LongPx = 856.0;      // 85.6 mm × 10 px/mm
    private const double ShortPx = 540.0;

    [Test]
    public void DarkCardOnWhite_RecoversPxPerMm()
        => AssertRecovers(Synthetic(bg: 255, card: 60, portrait: false, rotationDeg: 0));

    [Test]
    public void PaleCardOnDarkBacking_RecoversPxPerMm()
        => AssertRecovers(Synthetic(bg: 40, card: 235, portrait: false, rotationDeg: 0));

    [Test]
    public void PortraitCard_RecoversPxPerMm()
        => AssertRecovers(Synthetic(bg: 255, card: 60, portrait: true, rotationDeg: 0));

    [Test]
    public void SlightlyRotatedCard_RecoversPxPerMm()
    {
        using Mat img = Synthetic(bg: 255, card: 60, portrait: false, rotationDeg: 3.0);
        ScaleReferenceResult r = new CardEdgeMeasurer().Measure(img, LongMm, Dpi);
        Assert.Multiple(() =>
        {
            Assert.That(r.Success, Is.True);
            Assert.That(r.PxPerMm, Is.EqualTo(10.0).Within(0.05), "perpendicular width is rotation-invariant");
            Assert.That(r.ParallelismDegrees, Is.LessThan(0.2));
        });
    }

    [Test]
    public void BlankScan_FailsGracefully()
    {
        using var img = new Mat(400, 400, MatType.CV_8UC1, new Scalar(255));
        ScaleReferenceResult r = new CardEdgeMeasurer().Measure(img, LongMm, Dpi);
        Assert.Multiple(() =>
        {
            Assert.That(r.Success, Is.False);
            Assert.That(r.Message, Is.Not.Null.And.Not.Empty);
        });
    }

    [Test]
    public void RealCardScan_Reports()
    {
        string path = Path.Combine(TestContext.CurrentContext.TestDirectory, "TestFiles", "Cardscan.png");
        if (!File.Exists(path)) { Assert.Ignore("real scan not present"); return; }
        using Mat img = Cv2.ImRead(path, ImreadModes.Color);
        ScaleReferenceResult r = new CardEdgeMeasurer().Measure(img, 85.5, 600);
        TestContext.Out.WriteLine(
            $"success={r.Success} px/mm={r.PxPerMm:0.0000} width={r.MeasuredWidthPx:0.0}px " +
            $"detected={r.DetectedMm:0.00}mm straight={r.StraightnessPx:0.000}px parallel={r.ParallelismDegrees:0.0000}° n={r.EdgePointCount}");
        Assert.Multiple(() =>
        {
            Assert.That(r.Success, Is.True);
            Assert.That(r.PxPerMm, Is.EqualTo(23.60).Within(0.2), "matches the validated ~23.60 px/mm");
        });
    }

    private void AssertRecovers(Mat img)
    {
        using (img)
        {
            ScaleReferenceResult r = new CardEdgeMeasurer().Measure(img, LongMm, Dpi);
            Assert.Multiple(() =>
            {
                Assert.That(r.Success, Is.True);
                Assert.That(r.PxPerMm, Is.EqualTo(10.0).Within(0.05), "px/mm from the long side");
                Assert.That(r.DetectedMm, Is.EqualTo(LongMm).Within(0.5), "detected mm at the nominal DPI");
                Assert.That(r.StraightnessPx, Is.LessThan(0.5), "clean synthetic edges fit straight");
                Assert.That(r.ParallelismDegrees, Is.LessThan(0.2));
            });
        }
    }

    /// <summary>A filled card rectangle (long side = 856 px) on a plain background, optionally
    /// portrait or rotated about its centre.</summary>
    private Mat Synthetic(int bg, int card, bool portrait, double rotationDeg)
    {
        double w = portrait ? ShortPx : LongPx;
        double h = portrait ? LongPx : ShortPx;
        var image = new Mat(1120, 1220, MatType.CV_8UC1, new Scalar(bg));
        double cx = image.Width / 2.0, cy = image.Height / 2.0;
        double hw = w / 2.0, hh = h / 2.0;
        double a = rotationDeg * Math.PI / 180.0;
        double ca = Math.Cos(a), sa = Math.Sin(a);
        var corners = new[]
        {
            (-hw, -hh), (hw, -hh), (hw, hh), (-hw, hh),
        };
        var pts = new Point[corners.Length];
        for (int i = 0; i < corners.Length; i++)
        {
            (double dx, double dy) = corners[i];
            pts[i] = new Point(
                (int)Math.Round(cx + dx * ca - dy * sa),
                (int)Math.Round(cy + dx * sa + dy * ca));
        }
        Cv2.FillConvexPoly(image, pts, new Scalar(card), LineTypes.Link4);
        return image;
    }
}
