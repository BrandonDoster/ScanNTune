using PrinterCalibrate.Core;

namespace PrinterCalibrate.Tests;

/// <summary>
/// End-to-end check of the full pipeline against TestData_2solid.png — a render of the coupon's
/// own STL (with the two-solid orientation marker), i.e. geometrically perfect (100% scale, zero
/// skew). The render is reference-free, so the strongest assertions are the ones independent of
/// absolute scale: zero skew and isotropy (X error ≈ Y error). Tolerances sit ~3x above the observed values
/// (skew 0.001°, X/Y ±0.016%, RMS 0.09 px) to stay meaningful without being flaky.
/// </summary>
[TestFixture]
public class CouponAnalyzerEndToEndTests
{
    // 25 rings, but two are solid orientation rings (no hole), so only 23 are detectable.
    private const int ExpectedRingHoles = 23;

    private CalibrationResult _result = null!;

    [OneTimeSetUp]
    public void Analyze()
    {
        string path = Path.Combine(TestContext.CurrentContext.TestDirectory, "TestFiles", "TestData_2solid.png");
        Assert.That(File.Exists(path), Is.True, $"Test image not found at {path}");

        var analyzer = new CouponAnalyzer();
        _result = analyzer.Analyze(path, new AnalysisOptions());

        TestContext.Out.WriteLine($"Rings detected : {_result.RingsDetected}");
        TestContext.Out.WriteLine($"X scale error  : {_result.XScalePercent:+0.0000;-0.0000} %");
        TestContext.Out.WriteLine($"Y scale error  : {_result.YScalePercent:+0.0000;-0.0000} %");
        TestContext.Out.WriteLine($"Skew           : {_result.SkewDegrees:+0.0000;-0.0000} deg");
        TestContext.Out.WriteLine($"px/mm X, Y     : {_result.MeasuredPxPerMmX:0.000}, {_result.MeasuredPxPerMmY:0.000}");
        TestContext.Out.WriteLine($"RMS residual   : {_result.RmsResidualPx:0.000} px");
    }

    [Test]
    public void DetectsTheFullRingGrid()
        => Assert.That(_result.RingsDetected, Is.EqualTo(ExpectedRingHoles));

    [Test]
    public void PerfectRenderHasZeroSkew()
        => Assert.That(_result.SkewDegrees, Is.EqualTo(0.0).Within(0.05));

    [Test]
    public void PerfectRenderIsIsotropic()
        => Assert.That(_result.XScalePercent - _result.YScalePercent, Is.EqualTo(0.0).Within(0.10));

    [Test]
    public void ScaleErrorsAreNearZero()
    {
        Assert.That(_result.XScalePercent, Is.EqualTo(0.0).Within(0.10));
        Assert.That(_result.YScalePercent, Is.EqualTo(0.0).Within(0.10));
    }

    [Test]
    public void AffineFitIsTight()
        => Assert.That(_result.RmsResidualPx, Is.LessThan(0.5));
}
