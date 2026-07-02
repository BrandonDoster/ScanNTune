using OpenCvSharp;
using ScanNTune.Core;
using ScanNTune.Core.Combining;

namespace ScanNTune.Tests;

/// <summary>
/// The two-scan combiner must remove the scanner's own anisotropy/skew. We fake a scanner that
/// stretches its X axis by a fixed amount (applied to BOTH scans, in the bed frame, after the
/// coupon is placed), scan the coupon once upright and once quarter-turned, and check that the
/// combined printer anisotropy is ~0 (the fixture is geometrically perfect) even though each scan
/// alone reads a large anisotropy — and that the scanner diagnostic recovers the stretch.
/// </summary>
[TestFixture]
public class ScanCombinerTests
{
    private const double ScannerXStretch = 1.03; // scanner reads +3% along its X axis

    private readonly CouponImageTransforms _img = new();

    [Test]
    public void CombiningQuarterTurnScansCancelsScannerAnisotropy()
    {
        (CalibrationResult a, CalibrationResult b) = ScanPair();
        TwoScanResult combined = new ScannerCancellingCombiner().Combine(a, b);

        Assert.Multiple(() =>
        {
            // Each scan alone sees the scanner's ~3% bias as anisotropy...
            Assert.That(Math.Abs(a.XScalePercent - a.YScalePercent), Is.GreaterThan(1.5),
                "single scan should still carry the scanner's anisotropy");
            // ...but the combined printer anisotropy is ~0 (the fixture is geometrically perfect).
            double printerAniso = combined.Combined.XScalePercent - combined.Combined.YScalePercent;
            Assert.That(printerAniso, Is.EqualTo(0.0).Within(0.5), "scanner anisotropy must cancel");
            // The scanner's own bias is recovered as the diagnostic (~3%).
            Assert.That(Math.Abs(combined.Scanner.AnisotropyPercent), Is.EqualTo(3.0).Within(0.6));
            Assert.That(combined.RotationLooksValid, Is.True);
        });
    }

    [Test]
    public void SameOrientationTwiceIsFlaggedAsInvalid()
    {
        // Two scans with NO quarter-turn between them: the scanner error cannot cancel.
        CalibrationResult a = Analyze(_img.StretchX(LoadFixture(), ScannerXStretch));
        CalibrationResult b = Analyze(_img.StretchX(LoadFixture(), ScannerXStretch));
        TwoScanResult combined = new ScannerCancellingCombiner().Combine(a, b);

        Assert.That(combined.RotationLooksValid, Is.False,
            "two same-pose scans are ~0° apart and must be flagged");
    }

    private (CalibrationResult a, CalibrationResult b) ScanPair()
    {
        using Mat original = LoadFixture();
        // Scan A: coupon upright, then the scanner stretches its X axis.
        using Mat aImg = _img.StretchX(original, ScannerXStretch);
        // Scan B: coupon quarter-turned, then the SAME scanner stretch (fixed in the bed frame).
        using Mat rotated = _img.Rotate(original, 90);
        using Mat bImg = _img.StretchX(rotated, ScannerXStretch);
        return (Analyze(aImg), Analyze(bImg));
    }

    private Mat LoadFixture()
    {
        string path = Path.Combine(TestContext.CurrentContext.TestDirectory, "TestFiles", "TestData_2solid.png");
        return Cv2.ImRead(path, ImreadModes.Color);
    }

    private CalibrationResult Analyze(Mat image)
    {
        using (image)
            return new CouponAnalyzer().Analyze(image, new AnalysisOptions());
    }
}
