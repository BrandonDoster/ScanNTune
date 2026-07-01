using OpenCvSharp;
using PrinterCalibrate.Core;

namespace PrinterCalibrate.Tests;

/// <summary>
/// The two-solid marker must give identical readings no matter how the coupon is placed —
/// rotated AND/OR mirror-flipped — with no manual flag. An X-stretched copy makes X ≠ Y so a
/// swap would show; a sheared copy checks the skew sign survives a flip.
/// </summary>
[TestFixture]
public class FlipInvarianceTests
{
    [TestCase(false, 0)]
    [TestCase(false, 90)]
    [TestCase(false, 270)]
    [TestCase(true, 0)]
    [TestCase(true, 90)]
    [TestCase(true, 180)]
    [TestCase(true, 270)]
    public void LabelsSurviveFlipAndRotation(bool flip, int rotation)
    {
        CalibrationResult r = Analyze(flip, rotation, stretchX: true);

        Assert.Multiple(() =>
        {
            // Physical X was stretched ~2%, so X error stays clearly positive and Y negative at
            // every pose — if a flip swapped the axes these would invert.
            Assert.That(r.XScalePercent, Is.GreaterThan(0.5), "X must stay X under flip/rotation");
            Assert.That(r.YScalePercent, Is.LessThan(-0.5), "Y must stay Y under flip/rotation");
        });
    }

    [Test]
    public void SkewSignSurvivesFlip()
    {
        double normal = Analyze(flip: false, rotation: 0, shearDegrees: 1.0).SkewDegrees;
        double flipped = Analyze(flip: true, rotation: 0, shearDegrees: 1.0).SkewDegrees;

        Assert.Multiple(() =>
        {
            Assert.That(Math.Abs(normal), Is.GreaterThan(0.5), "a 1° shear should read ~1°");
            Assert.That(flipped, Is.EqualTo(normal).Within(0.2), "a flip must not change the skew sign");
        });
    }

    private readonly CouponImageTransforms _img = new();

    private CalibrationResult Analyze(bool flip, int rotation, bool stretchX = false, double shearDegrees = 0.0)
    {
        string path = Path.Combine(TestContext.CurrentContext.TestDirectory, "TestFiles", "TestData_2solid.png");
        using Mat original = Cv2.ImRead(path, ImreadModes.Color);

        // Physical print imperfection (anisotropy / skew), applied to the coupon itself.
        using Mat shaped = stretchX ? _img.StretchX(original, 1.02)
                         : shearDegrees != 0.0 ? _img.Shear(original, shearDegrees)
                         : original.Clone();

        // How it was placed on the scanner: maybe mirror-flipped, then some rotation.
        using Mat flipped = flip ? _img.FlipY(shaped) : shaped.Clone();
        using Mat placed = _img.Rotate(flipped, rotation);

        return new CouponAnalyzer().Analyze(placed, new AnalysisOptions());
    }
}
