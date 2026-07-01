using OpenCvSharp;
using PrinterCalibrate.Core;

namespace PrinterCalibrate.Tests;

/// <summary>
/// A scan the pipeline can't resolve must fail as a <see cref="CouponAnalysisException"/> that still
/// carries whatever rings were detected — the UI relies on that to show the user what was captured
/// instead of only an error.
/// </summary>
[TestFixture]
public class DiagnosticFailureTests
{
    [Test]
    public void BlankScanThrowsCouponAnalysisExceptionCarryingDetectedRings()
    {
        using var blank = new Mat(600, 600, MatType.CV_8UC3, Scalar.White);

        var analyzer = new CouponAnalyzer();
        var ex = Assert.Throws<CouponAnalysisException>(
            () => analyzer.Analyze(blank, new AnalysisOptions()));

        Assert.That(ex!.DetectedRings, Is.Not.Null, "detected rings must be available for the diagnostic overlay");
    }
}
