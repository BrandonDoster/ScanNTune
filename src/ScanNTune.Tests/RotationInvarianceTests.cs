using OpenCvSharp;
using ScanNTune.Core;

namespace ScanNTune.Tests;

/// <summary>
/// Proves the pipeline resolves orientation from the fiducial at any scan rotation: the +X axis
/// tracks the rotation, and X/Y labels never swap — including for an anisotropic (X-stretched)
/// coupon, where the stretched physical axis must stay labelled X at every rotation.
/// </summary>
[TestFixture]
public class RotationInvarianceTests
{
    [TestCase(0, 0.0)]
    [TestCase(90, 90.0)]
    [TestCase(180, 180.0)]
    [TestCase(270, 270.0)]
    public void OrientationTracksRotation(int rotationDegrees, double expectedXAngle)
    {
        CalibrationResult result = Analyze(rotationDegrees);

        Assert.Multiple(() =>
        {
            Assert.That(result.RingsDetected, Is.EqualTo(23));
            Assert.That(AngleDifference(result.Orientation.XAxisAngleDegrees, expectedXAngle),
                Is.EqualTo(0.0).Within(2.0), "+X axis should track the rotation");
        });
    }

    [Test]
    public void LabellingIsRotationInvariantForAnisotropicCoupon()
    {
        CalibrationResult at0 = Analyze(0, stretchX: true);
        CalibrationResult at90 = Analyze(90, stretchX: true);
        CalibrationResult at270 = Analyze(270, stretchX: true);

        Assert.Multiple(() =>
        {
            // Physical X was stretched ~2%, so X error is clearly positive at every rotation.
            Assert.That(at0.XScalePercent, Is.GreaterThan(0.5));
            Assert.That(at90.XScalePercent, Is.EqualTo(at0.XScalePercent).Within(0.15));
            Assert.That(at270.XScalePercent, Is.EqualTo(at0.XScalePercent).Within(0.15));
            Assert.That(at90.YScalePercent, Is.EqualTo(at0.YScalePercent).Within(0.15));
        });
    }

    private readonly CouponImageTransforms _img = new();

    private CalibrationResult Analyze(int rotationDegrees, bool stretchX = false)
    {
        string path = Path.Combine(TestContext.CurrentContext.TestDirectory, "TestFiles", "TestData_2solid.png");
        using Mat original = Cv2.ImRead(path, ImreadModes.Color);
        using Mat source = stretchX ? _img.StretchX(original, 1.02) : original.Clone();
        using Mat rotated = _img.Rotate(source, rotationDegrees);
        return new CouponAnalyzer().Analyze(rotated, new AnalysisOptions());
    }

    /// <summary>Signed smallest angle from b to a, in degrees (-180, 180].</summary>
    private double AngleDifference(double a, double b) => ((a - b + 540.0) % 360.0) - 180.0;
}
