using MathNet.Numerics.LinearAlgebra;

namespace ScanNTune.Core.Solving;

/// <summary>
/// Solves the over-determined system mapping nominal millimetres to measured pixels:
///   px = a·mx + b·my + tx
///   py = c·mx + d·my + ty
/// The X and Y rows share the same per-point weights, so two 3-parameter fits suffice. The 2x2
/// linear part is then decomposed into per-axis scale and the skew (departure from 90°).
///
/// The fit is robust by default: after an initial least-squares pass it re-weights each ring by a
/// Huber function of its residual and refits a few times, so a hole whose centre was corrupted by
/// stringing/shadow (several px off) is down-weighted instead of dragging the whole fit. With clean
/// data no point is down-weighted, so it reduces to ordinary least squares.
/// </summary>
public sealed class AffineSolver : IAffineSolver
{
    private readonly bool _robust;
    private readonly double _huberTune;
    private readonly int _iterations;

    // 1.345 is the standard Huber tuning constant: it gives ~95% efficiency relative to least
    // squares on clean Gaussian data while still bounding an outlier's influence. It is a property
    // of the M-estimator, not a value fitted to any scan.
    public AffineSolver(bool robust = true, double huberTune = 1.345, int iterations = 4)
    {
        _robust = robust;
        _huberTune = huberTune;
        _iterations = iterations;
    }

    public AffineModel Solve(IReadOnlyList<GridCorrespondence> correspondences)
    {
        ArgumentNullException.ThrowIfNull(correspondences);
        int n = correspondences.Count;
        if (n < 3)
            throw new InvalidOperationException($"Need at least 3 correspondences, got {n}.");

        var design = Matrix<double>.Build.Dense(n, 3);
        var px = Vector<double>.Build.Dense(n);
        var py = Vector<double>.Build.Dense(n);
        for (int i = 0; i < n; i++)
        {
            GridCorrespondence c = correspondences[i];
            design[i, 0] = c.NominalXmm;
            design[i, 1] = c.NominalYmm;
            design[i, 2] = 1.0;
            px[i] = c.MeasuredXpx;
            py[i] = c.MeasuredYpx;
        }

        var weights = Vector<double>.Build.Dense(n, 1.0);
        Vector<double> cx = WeightedSolve(design, px, weights);
        Vector<double> cy = WeightedSolve(design, py, weights);

        if (_robust)
        {
            for (int iter = 0; iter < _iterations; iter++)
            {
                if (!UpdateWeights(design, px, py, cx, cy, weights))
                    break; // residuals are uniform (no outliers) — nothing to down-weight
                cx = WeightedSolve(design, px, weights);
                cy = WeightedSolve(design, py, weights);
            }
        }

        double a = cx[0], b = cx[1], tx = cx[2];
        double c2 = cy[0], d = cy[1], ty = cy[2];

        double scaleX = Math.Sqrt(a * a + c2 * c2);
        double scaleY = Math.Sqrt(b * b + d * d);

        double cosBetween = (a * b + c2 * d) / (scaleX * scaleY);
        cosBetween = Math.Clamp(cosBetween, -1.0, 1.0);
        double skewDegrees = Math.Acos(cosBetween) * 180.0 / Math.PI - 90.0;

        // Report the UNWEIGHTED RMS over every hole, not the weighted (inlier-only) residual: this
        // number is the "is the part actually a uniform affine deformation?" signal. A non-affine
        // defect (gantry warp, thermal bow) shows up only here, so down-weighting the very holes
        // that reveal it would hide it. The robust weights above still drive the parameter fit; the
        // reported residual just measures every hole honestly against that fit. On clean data all
        // weights are 1, so this equals the ordinary least-squares residual.
        double sumSq = 0;
        for (int i = 0; i < n; i++)
        {
            GridCorrespondence p = correspondences[i];
            double ex = a * p.NominalXmm + b * p.NominalYmm + tx - p.MeasuredXpx;
            double ey = c2 * p.NominalXmm + d * p.NominalYmm + ty - p.MeasuredYpx;
            sumSq += ex * ex + ey * ey;
        }
        double rms = Math.Sqrt(sumSq / n);

        return new AffineModel(scaleX, scaleY, skewDegrees, rms, n);
    }

    private Vector<double> WeightedSolve(Matrix<double> design, Vector<double> target, Vector<double> weights)
    {
        int n = design.RowCount;
        var wDesign = Matrix<double>.Build.Dense(n, design.ColumnCount);
        var wTarget = Vector<double>.Build.Dense(n);
        for (int i = 0; i < n; i++)
        {
            double s = Math.Sqrt(weights[i]);
            wDesign[i, 0] = design[i, 0] * s;
            wDesign[i, 1] = design[i, 1] * s;
            wDesign[i, 2] = design[i, 2] * s;
            wTarget[i] = target[i] * s;
        }
        return wDesign.QR().Solve(wTarget);
    }

    /// <summary>
    /// Recomputes Huber weights from the current residuals. Returns false (leaving weights unchanged)
    /// when the residual scale is ~0, i.e. a clean fit with nothing to down-weight.
    /// </summary>
    private bool UpdateWeights(Matrix<double> design, Vector<double> px, Vector<double> py,
        Vector<double> cx, Vector<double> cy, Vector<double> weights)
    {
        int n = design.RowCount;
        var residuals = new double[n];
        for (int i = 0; i < n; i++)
        {
            double ex = design[i, 0] * cx[0] + design[i, 1] * cx[1] + cx[2] - px[i];
            double ey = design[i, 0] * cy[0] + design[i, 1] * cy[1] + cy[2] - py[i];
            residuals[i] = Math.Sqrt(ex * ex + ey * ey);
        }

        // Robust scale via the median absolute residual (MAD, scaled to a Gaussian sigma). Average
        // the two central order statistics for even n so the median is unbiased regardless of hole
        // count.
        var sorted = (double[])residuals.Clone();
        Array.Sort(sorted);
        double median = n % 2 == 1 ? sorted[n / 2] : 0.5 * (sorted[n / 2 - 1] + sorted[n / 2]);
        double sigma = 1.4826 * median;
        if (sigma < 1e-6)
            return false;

        double threshold = _huberTune * sigma;
        for (int i = 0; i < n; i++)
            weights[i] = residuals[i] <= threshold ? 1.0 : threshold / residuals[i];
        return true;
    }
}
