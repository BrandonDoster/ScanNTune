using ScanNTune.Core;
using ScanNTune.Core.Solving;

namespace ScanNTune.Tests;

/// <summary>
/// The affine fit must resist a single badly-detected ring (centre corrupted by stringing/shadow)
/// without letting it drag the scale/skew, while leaving clean data exactly as ordinary least
/// squares would.
/// </summary>
[TestFixture]
public class AffineSolverTests
{
    private const double Kx = 10.1;   // true px/mm along X
    private const double Ky = 9.9;    // true px/mm along Y
    private const double Pitch = 25.0;

    [Test]
    public void RobustFitResistsOneOutlier()
    {
        List<GridCorrespondence> pts = PerfectGrid();
        // Corrupt one ring's centre by ~30 px, as a real stringing/shadow artefact would.
        GridCorrespondence bad = pts[7];
        pts[7] = bad with { MeasuredXpx = bad.MeasuredXpx + 30.0, MeasuredYpx = bad.MeasuredYpx + 25.0 };

        AffineModel robust = new AffineSolver().Solve(pts);
        AffineModel plain = new AffineSolver(robust: false).Solve(pts);

        Assert.Multiple(() =>
        {
            Assert.That(robust.ScaleXPxPerMm, Is.EqualTo(Kx).Within(0.03), "robust recovers X scale");
            Assert.That(robust.ScaleYPxPerMm, Is.EqualTo(Ky).Within(0.03), "robust recovers Y scale");
            Assert.That(robust.SkewDegrees, Is.EqualTo(0.0).Within(0.05), "robust recovers zero skew");
            // The plain fit is measurably dragged by the outlier; the robust fit is much closer.
            Assert.That(Math.Abs(plain.ScaleXPxPerMm - Kx),
                Is.GreaterThan(Math.Abs(robust.ScaleXPxPerMm - Kx) + 0.02), "robust must beat plain LS here");
        });
    }

    [Test]
    public void RobustFitResistsHighLeverageCornerOutlier()
    {
        List<GridCorrespondence> pts = PerfectGrid();
        // The far corner (4,4) — the last point added — has the highest leverage on an affine fit,
        // so a corrupted centre there drags scale/skew the most: the hardest case for the robust fit.
        GridCorrespondence bad = pts[24];
        pts[24] = bad with { MeasuredXpx = bad.MeasuredXpx - 28.0, MeasuredYpx = bad.MeasuredYpx + 26.0 };

        AffineModel robust = new AffineSolver().Solve(pts);

        Assert.Multiple(() =>
        {
            Assert.That(robust.ScaleXPxPerMm, Is.EqualTo(Kx).Within(0.03), "robust recovers X scale despite corner outlier");
            Assert.That(robust.ScaleYPxPerMm, Is.EqualTo(Ky).Within(0.03), "robust recovers Y scale despite corner outlier");
            Assert.That(robust.SkewDegrees, Is.EqualTo(0.0).Within(0.05), "robust recovers zero skew despite corner outlier");
        });
    }

    [Test]
    public void RobustReweightingLeavesNearCleanDataCloseToPlain()
    {
        // Small deterministic sub-pixel scatter on every hole and NO gross outlier. Residuals are
        // nonzero, so this actually drives the IRLS reweighting loop (the sigma~0 early-out does not
        // fire); with no true outlier the robust fit must stay essentially on top of plain LS.
        List<GridCorrespondence> pts = PerfectGrid();
        for (int k = 0; k < pts.Count; k++)
        {
            GridCorrespondence p = pts[k];
            double dx = 0.4 * (((k * 7) % 5) - 2);   // deterministic, within [-0.8, +0.8] px
            double dy = 0.4 * (((k * 3) % 5) - 2);
            pts[k] = p with { MeasuredXpx = p.MeasuredXpx + dx, MeasuredYpx = p.MeasuredYpx + dy };
        }

        AffineModel robust = new AffineSolver().Solve(pts);
        AffineModel plain = new AffineSolver(robust: false).Solve(pts);

        Assert.Multiple(() =>
        {
            Assert.That(robust.ScaleXPxPerMm, Is.EqualTo(plain.ScaleXPxPerMm).Within(0.05), "robust ~ plain when no gross outlier");
            Assert.That(robust.ScaleYPxPerMm, Is.EqualTo(plain.ScaleYPxPerMm).Within(0.05));
            Assert.That(robust.SkewDegrees, Is.EqualTo(plain.SkewDegrees).Within(0.05));
        });
    }

    [Test]
    public void CleanDataMatchesPlainLeastSquares()
    {
        List<GridCorrespondence> pts = PerfectGrid();

        AffineModel robust = new AffineSolver().Solve(pts);
        AffineModel plain = new AffineSolver(robust: false).Solve(pts);

        Assert.Multiple(() =>
        {
            Assert.That(robust.ScaleXPxPerMm, Is.EqualTo(plain.ScaleXPxPerMm).Within(1e-9));
            Assert.That(robust.ScaleYPxPerMm, Is.EqualTo(plain.ScaleYPxPerMm).Within(1e-9));
            Assert.That(robust.SkewDegrees, Is.EqualTo(plain.SkewDegrees).Within(1e-9));
        });
    }

    private List<GridCorrespondence> PerfectGrid()
    {
        var pts = new List<GridCorrespondence>();
        for (int i = 0; i < 5; i++)
        {
            for (int j = 0; j < 5; j++)
            {
                double nx = i * Pitch, ny = j * Pitch;
                pts.Add(new GridCorrespondence(i, j, nx, ny, nx * Kx, ny * Ky));
            }
        }
        return pts;
    }
}
