using System.Globalization;
using ScanNTune.Core.Output;

namespace ScanNTune.Tests;

/// <summary>
/// Pins the size-correction formulas to their exact published forms and guards against implausible
/// inputs. The exact correction is the nominal/measured ratio (new = current / (1 + error)), the
/// standard steps-per-mm and slicer-scale procedure; a first-order (1 − error) approximation leaves
/// a residual of error² that the tool's own precision would resolve. The out-of-range guard mirrors
/// the skew branch's: a real printer errs well under 2%, so a huge scale reading means a wrong DPI
/// or a broken detection, and emitting firmware commands from it (e.g. M92 X0.000 at +100%) would
/// actively damage a config.
/// </summary>
[TestFixture]
public class CorrectionMathTests
{
    private readonly CorrectionFormatter _formatter = new();

    [TestCase(CorrectionFormatter.Shrinkage)]
    [TestCase(CorrectionFormatter.StepsPerMm)]
    [TestCase(CorrectionFormatter.RotationDistance)]
    [TestCase(CorrectionFormatter.Scale)]
    public void ImplausibleScaleIsGuardedNotEmitted(string flavour)
    {
        // +100% is what a coupon scanned at twice the calibrated DPI reads; no firmware command
        // may be synthesized from it (StepsPerMm would emit "M92 X0.000\nM500").
        Correction c = _formatter.Size(flavour, 100.0, 100.0, 80.0, 80.0);

        Assert.Multiple(() =>
        {
            Assert.That(c.Code, Does.Contain("out of range"));
            Assert.That(c.Code, Does.Not.Contain("M92"));
            Assert.That(c.Code, Does.Not.Contain("%"));
        });
    }

    [Test]
    public void PlausibleScalePassesTheGuard()
    {
        Correction c = _formatter.Size(CorrectionFormatter.Shrinkage, 1.5, 1.5, null, null);
        Assert.That(c.Code, Does.Contain("%"));
    }

    [Test]
    public void StepsPerMmUsesTheExactRatio()
    {
        // Part 2% oversize, current 80 steps/mm: exact new = 80 / 1.02 = 78.431 (not 80·0.98 = 78.4).
        Correction c = _formatter.Size(CorrectionFormatter.StepsPerMm, 2.0, 2.0, 80.0, 80.0);
        Assert.That(c.Code, Does.StartWith("M92 X78.431 Y78.431"));
    }

    [Test]
    public void ScalePercentUsesTheExactRatio()
    {
        // Part 2% oversize: exact slicer scale = 100 / 1.02 = 98.04% (not 98.00) — a 100 mm part
        // scaled to 98.00% prints 99.96 mm.
        Correction c = _formatter.Size(CorrectionFormatter.Scale, 2.0, 2.0, null, null);
        Assert.That(c.Code, Is.EqualTo("X 98.04 %   Y 98.04 %"));
    }

    [Test]
    public void ShrinkageAndRotationDistanceStayExact()
    {
        // These two were already the exact published forms; pin them so they cannot drift.
        Correction shrink = _formatter.Size(CorrectionFormatter.Shrinkage, 2.0, 2.0, null, null);
        Correction rot = _formatter.Size(CorrectionFormatter.RotationDistance, 2.0, 2.0, 32.0, 32.0);

        Assert.Multiple(() =>
        {
            Assert.That(shrink.Code, Is.EqualTo("XY shrinkage: 102.00 %"));
            Assert.That(rot.Code, Is.EqualTo("X 32.6400   Y 32.6400"));
        });
    }

    [Test]
    public void StepsPerMmHintDoesNotClaimKlipperSupport()
    {
        // Klipper implements neither M92 nor M500; its equivalent is the Rotation distance flavour.
        Correction c = _formatter.Size(CorrectionFormatter.StepsPerMm, 1.0, 1.0, 80.0, 80.0);

        Assert.Multiple(() =>
        {
            Assert.That(c.Hint, Does.Not.Contain("Klipper steps"));
            Assert.That(c.Hint, Does.Contain("Marlin"));
            Assert.That(c.Hint, Does.Contain("Rotation distance"));
        });
    }
}
