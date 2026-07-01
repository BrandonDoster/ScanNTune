using MathNet.Numerics.LinearAlgebra;

namespace PrinterCalibrate.Core.Solving;

/// <summary>
/// Solves the over-determined system mapping nominal millimetres to measured pixels:
///   px = a·mx + b·my + tx
///   py = c·mx + d·my + ty
/// The X and Y rows are independent, so two 3-parameter least-squares fits suffice. The 2x2
/// linear part is then decomposed into per-axis scale and the skew (departure from 90°).
/// </summary>
public sealed class AffineSolver : IAffineSolver
{
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

        var qr = design.QR();
        Vector<double> cx = qr.Solve(px); // a, b, tx
        Vector<double> cy = qr.Solve(py); // c, d, ty
        double a = cx[0], b = cx[1], tx = cx[2];
        double c2 = cy[0], d = cy[1], ty = cy[2];

        double scaleX = Math.Sqrt(a * a + c2 * c2);
        double scaleY = Math.Sqrt(b * b + d * d);

        double cosBetween = (a * b + c2 * d) / (scaleX * scaleY);
        cosBetween = Math.Clamp(cosBetween, -1.0, 1.0);
        double angleBetweenDeg = Math.Acos(cosBetween) * 180.0 / Math.PI;
        double skewDegrees = angleBetweenDeg - 90.0;

        double squaredError = 0;
        for (int i = 0; i < n; i++)
        {
            GridCorrespondence p = correspondences[i];
            double ex = a * p.NominalXmm + b * p.NominalYmm + tx - p.MeasuredXpx;
            double ey = c2 * p.NominalXmm + d * p.NominalYmm + ty - p.MeasuredYpx;
            squaredError += ex * ex + ey * ey;
        }
        double rms = Math.Sqrt(squaredError / n);

        return new AffineModel(scaleX, scaleY, skewDegrees, rms, n);
    }
}
