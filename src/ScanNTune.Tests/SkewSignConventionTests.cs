using System.Globalization;
using OpenCvSharp;
using ScanNTune.Core;
using ScanNTune.Core.Output;
using ScanNTune.Core.Solving;

namespace ScanNTune.Tests;

/// <summary>
/// Anchors the absolute sign of the skew convention end-to-end. <see cref="AffineModel.SkewDegrees"/>
/// is the measured ERROR, like the scale figures: the X/Y corner angle minus 90°, so a part whose
/// axes CLOSE below 90° (sheared x' = x + t·y) reads NEGATIVE, and an opened corner reads positive
/// (matching the Califlower calculator's Measured column). The firmware shear factor is the
/// negation of that error — the conversion lives in CorrectionFormatter, verified against the
/// firmware sources (klippy skew_correction.py applies x − y·factor; Marlin planner.h subtracts;
/// RRF Move.cpp ADDS). The flip/rotation tests elsewhere prove the sign is *consistent* across
/// poses; these tests pin which sign a known shear direction produces, so a flipped convention can
/// never ship again.
/// </summary>
[TestFixture]
public class SkewSignConventionTests
{
    private const double ShearDeg = 1.0;
    private const double PxPerMm = 10.0;
    private const double PitchMm = 25.0;

    private readonly double _shearTan = Math.Tan(ShearDeg * Math.PI / 180.0);

    [Test]
    public void PlusXShearReadsNegative_InImageFrame()
    {
        // Physical shear x' = x + t·y closes the corner angle below 90°, so the measured angle
        // error is NEGATIVE. Viewed in an image frame whose rows grow downward (py = C − y): the
        // frame every scan and render arrives in.
        AffineModel m = new AffineSolver().Solve(ShearedGrid(mirrorX: false));
        Assert.That(m.SkewDegrees, Is.EqualTo(-ShearDeg).Within(0.001),
            "x' = x + t·y closes the corner: the angle error is negative");
    }

    [Test]
    public void PlusXShearReadsNegative_InMirroredImageFrame()
    {
        // The same physical shear scanned face-down (the image is additionally mirrored in x).
        // The inter-axis angle is reflection-invariant, so the sign must not change.
        AffineModel m = new AffineSolver().Solve(ShearedGrid(mirrorX: true));
        Assert.That(m.SkewDegrees, Is.EqualTo(-ShearDeg).Within(0.001),
            "a mirrored view of the same part must read the same skew");
    }

    [Test]
    public void FixtureShearReadsPositive()
    {
        // The fixture render is a top view with physical +Y pointing UP the image, so an
        // image-space shear x_img += k·y_img (rows grow DOWNWARD) is the physical shear
        // x' = x − k·y, which OPENS the corner angle: a positive angle error end to end.
        string path = Path.Combine(TestContext.CurrentContext.TestDirectory, "TestFiles", "TestData_2solid.png");
        using Mat original = Cv2.ImRead(path, ImreadModes.Color);
        using Mat sheared = new CouponImageTransforms().Shear(original, ShearDeg);

        CalibrationResult r = new CouponAnalyzer().Analyze(sheared, new AnalysisOptions());
        Assert.That(r.SkewDegrees, Is.EqualTo(ShearDeg).Within(0.1),
            "a +1° image shear of the y-up render opens the corner: positive angle error");
    }

    [Test]
    public void KlipperCorrectionCancelsTheMeasuredShear()
    {
        // A part sheared x' = x + t·y measures an angle error of −atan(t). Round trip: feed the
        // emitted AC/BD/AD through Klipper's own calc_skew_factor (klippy/extras/skew_correction.py).
        // Klipper applies x − y·factor to every move, so the factor must equal +t to cancel.
        Correction c = new CorrectionFormatter().Skew(CorrectionFormatter.Klipper, -ShearDeg, new CouponSpec());
        double[] xy = ParseCsv(c.Code, prefix: "SET_SKEW XY=");
        double ac = xy[0], bd = xy[1], ad = xy[2];

        double side = Math.Sqrt(2 * ac * ac + 2 * bd * bd - 4 * ad * ad) / 2.0;
        double factor = Math.Tan(Math.PI / 2 - Math.Acos((ac * ac - side * side - ad * ad) / (2 * side * ad)));

        Assert.Multiple(() =>
        {
            Assert.That(ac, Is.GreaterThan(bd), "an x' = x + t·y part must emit AC > BD");
            Assert.That(factor, Is.EqualTo(_shearTan).Within(0.001),
                "Klipper must recover +tan(shear) from the emitted lengths");
        });
    }

    [Test]
    public void MarlinEmitsPositiveFactorForPlusXShear()
    {
        // Marlin's planner SUBTRACTS the factor (planner.h skew(): sx = cx − cy·skew_factor.xy),
        // so cancelling x' = x + t·y (measured angle error −atan(t)) needs a POSITIVE M852 I.
        Correction marlin = new CorrectionFormatter().Skew(CorrectionFormatter.Marlin, -ShearDeg, new CouponSpec());
        double marlinI = ParseAfterPrefix(marlin.Code, "M852 I");
        Assert.That(marlinI, Is.EqualTo(_shearTan).Within(1e-6), "M852 I = +tan(shear)");
    }

    [Test]
    public void RepRapEmitsNegativeFactorForPlusXShear()
    {
        // RepRapFirmware ADDS the factor on the user→machine transform (Move.cpp AxisTransform:
        // xyzPoint[X] += tanXY·Y, tanXY = X/S from M556) — opposite of Marlin — so cancelling
        // x' = x + t·y needs a NEGATIVE M556 X.
        Correction rrf = new CorrectionFormatter().Skew(CorrectionFormatter.RepRap, -ShearDeg, new CouponSpec());
        double rrfX = ParseAfterPrefix(rrf.Code, "M556 S100 X");
        Assert.That(rrfX, Is.EqualTo(-100.0 * _shearTan).Within(1e-3), "M556 X = −100·tan(shear)");
    }

    /// <summary>
    /// A perfect 5x5 grid printed by a machine that shears x' = x + t·y, then imaged: y flipped
    /// (image rows grow downward) and optionally x-mirrored (a face-down scan).
    /// </summary>
    private List<GridCorrespondence> ShearedGrid(bool mirrorX)
    {
        const double extentMm = 4 * PitchMm;
        var pts = new List<GridCorrespondence>();
        for (int i = 0; i < 5; i++)
        {
            for (int j = 0; j < 5; j++)
            {
                double nx = i * PitchMm, ny = j * PitchMm;
                double printedX = nx + _shearTan * ny;
                double imgX = mirrorX ? extentMm - printedX : printedX;
                double imgY = extentMm - ny;
                pts.Add(new GridCorrespondence(i, j, nx, ny, imgX * PxPerMm, imgY * PxPerMm));
            }
        }
        return pts;
    }

    private double[] ParseCsv(string code, string prefix)
    {
        string line = code.Split('\n')[0];
        Assert.That(line, Does.StartWith(prefix));
        double[] values = line.Substring(prefix.Length)
            .Split(',')
            .Select(s => double.Parse(s, CultureInfo.InvariantCulture))
            .ToArray();
        Assert.That(values, Has.Length.EqualTo(3), "SET_SKEW must carry AC,BD,AD");
        return values;
    }

    private double ParseAfterPrefix(string code, string prefix)
    {
        string line = code.Split('\n')[0];
        Assert.That(line, Does.StartWith(prefix));
        return double.Parse(line.Substring(prefix.Length), CultureInfo.InvariantCulture);
    }
}
