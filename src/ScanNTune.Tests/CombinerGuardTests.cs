using ScanNTune.Core;
using ScanNTune.Core.Combining;

namespace ScanNTune.Tests;

/// <summary>
/// The two-scan cancellation is only exact for a quarter-turn of the SAME face: the un-cancelled
/// scanner leakage grows as sin(turn error), and a mirror-flip between the scans makes the scanner
/// skew ADD instead of cancel (a shear is a spin-2 quantity; reflecting it negates its cross
/// component, undoing the quarter-turn sign flip) while the scanner diagnostic reads ~0. Both
/// conditions must therefore invalidate the pair.
/// </summary>
[TestFixture]
public class CombinerGuardTests
{
    private readonly ScannerCancellingCombiner _combiner = new();

    [Test]
    public void FlipMismatchInvalidatesThePair()
    {
        // Coupon scanned face-up, then flipped over for the quarter-turned second scan: the
        // turn still reads ~90° but the skew cancellation is broken.
        TwoScanResult r = _combiner.Combine(Scan(0.0, flipped: false), Scan(90.0, flipped: true));

        Assert.Multiple(() =>
        {
            Assert.That(r.FlipMismatch, Is.True, "opposite Flipped states must be flagged");
            Assert.That(r.RotationLooksValid, Is.False, "a flip-mismatched pair cannot be trusted");
        });
    }

    [Test]
    public void SameFlipStateOnBothScansIsAccepted()
    {
        // Both face-down is as valid as both face-up — only a MISMATCH breaks the algebra.
        TwoScanResult r = _combiner.Combine(Scan(0.0, flipped: true), Scan(90.0, flipped: true));

        Assert.Multiple(() =>
        {
            Assert.That(r.FlipMismatch, Is.False);
            Assert.That(r.RotationLooksValid, Is.True);
        });
    }

    [TestCase(70.0)]   // 20° off a quarter-turn: leaks up to sin(20°) ≈ 34% of the scanner error
    [TestCase(110.0)]
    [TestCase(250.0)]
    public void FarOffQuarterTurnIsInvalid(double turnDegrees)
    {
        TwoScanResult r = _combiner.Combine(Scan(0.0, flipped: false), Scan(turnDegrees, flipped: false));
        Assert.That(r.RotationLooksValid, Is.False,
            $"a {turnDegrees}° turn leaks un-cancelled scanner error comparable to the signal");
    }

    [TestCase(87.0)]   // real placements land within a few degrees (the test scans hit 89.8/269.8)
    [TestCase(93.0)]
    [TestCase(273.0)]
    public void NearQuarterTurnIsValid(double turnDegrees)
    {
        TwoScanResult r = _combiner.Combine(Scan(0.0, flipped: false), Scan(turnDegrees, flipped: false));
        Assert.That(r.RotationLooksValid, Is.True);
    }

    private CalibrationResult Scan(double xAxisAngleDegrees, bool flipped)
    {
        double rad = xAxisAngleDegrees * Math.PI / 180.0;
        return new CalibrationResult(
            0.0, 0.0, 0.0, 23, 23.6, 23.6, 0.5,
            [],
            new Orientation(flipped, 0.0, 0.0, Math.Cos(rad), Math.Sin(rad)));
    }
}
