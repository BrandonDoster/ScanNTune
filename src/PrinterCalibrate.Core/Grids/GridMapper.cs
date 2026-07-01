namespace PrinterCalibrate.Core.Grids;

/// <summary>
/// Default grid mapper. Estimates the grid axes/pitch from nearest-neighbour vectors, indexes
/// the rings, then resolves orientation from the fiducial: the one grid corner with no detected
/// hole is the solid origin disk. Because a flatbed scan is a pure rotation (no mirror), which
/// corner is solid uniquely fixes the rotation — so the printer's +X/+Y are identified correctly
/// at 0/90/180/270°. If exactly one missing corner can't be found, it falls back to assuming an
/// upright scan (origin bottom-left).
///
/// Assumption: the scan is not mirrored. A mirrored (flipped) scan would flip the skew sign;
/// detecting that via the +X satellite dot is a future refinement.
/// </summary>
public sealed class GridMapper : IGridMapper
{
    public GridMapping Map(IReadOnlyList<DetectedRing> rings, CouponSpec spec)
    {
        ArgumentNullException.ThrowIfNull(rings);
        ArgumentNullException.ThrowIfNull(spec);
        if (rings.Count < 4)
            throw new InvalidOperationException($"Need at least 4 rings to fit a grid, found {rings.Count}.");

        var points = rings.Select(r => (x: r.CenterX, y: r.CenterY)).ToArray();
        int n = points.Length;
        Geometry geo = EstimateGeometry(points);
        if (geo.PitchPx <= 0)
            throw new InvalidOperationException("Could not estimate a positive grid pitch.");

        // theta is folded into (-45°,45°], so U points +x and V points +y (image-y down).
        (double x, double y) colHat = geo.U;
        (double x, double y) rowHat = geo.V;

        var col = new int[n];
        var row = new int[n];
        for (int i = 0; i < n; i++)
        {
            double rx = points[i].x - geo.CentroidX;
            double ry = points[i].y - geo.CentroidY;
            col[i] = (int)Math.Round((rx * colHat.x + ry * colHat.y) / geo.PitchPx);
            row[i] = (int)Math.Round((rx * rowHat.x + ry * rowHat.y) / geo.PitchPx);
        }

        int minCol = col.Min(), minRow = row.Min();
        for (int i = 0; i < n; i++)
        {
            col[i] -= minCol;
            row[i] -= minRow;
        }
        int maxCol = col.Max(), maxRow = row.Max();

        // Pixel position of index (0,0), then of any (c,r).
        (double x, double y) g00 = OriginOfIndexSpace(points, col, row, colHat, rowHat, geo.PitchPx);

        (int c, int r) originCorner = FindSolidCorner(col, row, maxCol, maxRow, out bool fiducialUsed);

        // Map the solid corner to the printer's +X / +Y axes (rotation table; no mirror).
        (double x, double y) xHat, yHat;
        if (originCorner == (0, maxRow))       { xHat = colHat;          yHat = Negate(rowHat); }
        else if (originCorner == (0, 0))       { xHat = rowHat;          yHat = colHat; }
        else if (originCorner == (maxCol, 0))  { xHat = Negate(colHat);  yHat = rowHat; }
        else                                   { xHat = Negate(rowHat);  yHat = Negate(colHat); }

        (double x, double y) originPx =
        (
            g00.x + originCorner.c * geo.PitchPx * colHat.x + originCorner.r * geo.PitchPx * rowHat.x,
            g00.y + originCorner.c * geo.PitchPx * colHat.y + originCorner.r * geo.PitchPx * rowHat.y
        );

        double pitchMm = spec.PitchMm;
        var mapped = new List<GridCorrespondence>(n);
        for (int i = 0; i < n; i++)
        {
            double dx = points[i].x - originPx.x;
            double dy = points[i].y - originPx.y;
            int xi = (int)Math.Round((dx * xHat.x + dy * xHat.y) / geo.PitchPx);
            int yi = (int)Math.Round((dx * yHat.x + dy * yHat.y) / geo.PitchPx);
            mapped.Add(new GridCorrespondence(xi, yi, xi * pitchMm, yi * pitchMm, points[i].x, points[i].y));
        }

        return new GridMapping(mapped, originPx.x, originPx.y, xHat.x, xHat.y, fiducialUsed);
    }

    /// <summary>The grid corner with no detected ring is the solid origin. Falls back to (0,maxRow).</summary>
    private (int c, int r) FindSolidCorner(int[] col, int[] row, int maxCol, int maxRow, out bool found)
    {
        var occupied = new HashSet<(int, int)>();
        for (int i = 0; i < col.Length; i++)
            occupied.Add((col[i], row[i]));

        (int, int)[] corners = [(0, 0), (0, maxRow), (maxCol, 0), (maxCol, maxRow)];
        var missing = corners.Where(c => !occupied.Contains(c)).ToList();
        if (missing.Count == 1)
        {
            found = true;
            return missing[0];
        }

        found = false;
        return (0, maxRow); // assume an upright scan
    }

    private (double x, double y) OriginOfIndexSpace(
        (double x, double y)[] points, int[] col, int[] row,
        (double x, double y) colHat, (double x, double y) rowHat, double pitchPx)
    {
        double ox = 0, oy = 0;
        for (int i = 0; i < points.Length; i++)
        {
            ox += points[i].x - (col[i] * pitchPx * colHat.x + row[i] * pitchPx * rowHat.x);
            oy += points[i].y - (col[i] * pitchPx * colHat.y + row[i] * pitchPx * rowHat.y);
        }
        return (ox / points.Length, oy / points.Length);
    }

    private (double x, double y) Negate((double x, double y) v) => (-v.x, -v.y);

    private Geometry EstimateGeometry((double x, double y)[] points)
    {
        int n = points.Length;
        double sum4Cos = 0, sum4Sin = 0;
        var neighbourDistances = new List<double>(n);

        for (int i = 0; i < n; i++)
        {
            double best = double.MaxValue;
            int bestJ = -1;
            for (int j = 0; j < n; j++)
            {
                if (i == j)
                    continue;
                double dx = points[j].x - points[i].x;
                double dy = points[j].y - points[i].y;
                double d2 = dx * dx + dy * dy;
                if (d2 < best)
                {
                    best = d2;
                    bestJ = j;
                }
            }

            double vx = points[bestJ].x - points[i].x;
            double vy = points[bestJ].y - points[i].y;
            neighbourDistances.Add(Math.Sqrt(vx * vx + vy * vy));
            double angle = Math.Atan2(vy, vx);
            sum4Cos += Math.Cos(4 * angle); // 4x maps the 90° grid symmetry onto a full circle
            sum4Sin += Math.Sin(4 * angle);
        }

        double theta = Math.Atan2(sum4Sin, sum4Cos) / 4.0; // in (-45°, 45°]
        var u = (x: Math.Cos(theta), y: Math.Sin(theta));
        var v = (x: -Math.Sin(theta), y: Math.Cos(theta));
        double cx = points.Average(p => p.x);
        double cy = points.Average(p => p.y);
        return new Geometry(u, v, Median(neighbourDistances), cx, cy);
    }

    private double Median(IReadOnlyList<double> values)
    {
        var sorted = values.OrderBy(v => v).ToList();
        int n = sorted.Count;
        if (n == 0)
            return 0;
        return n % 2 == 1 ? sorted[n / 2] : (sorted[n / 2 - 1] + sorted[n / 2]) / 2.0;
    }

    private readonly record struct Geometry(
        (double x, double y) U, (double x, double y) V, double PitchPx, double CentroidX, double CentroidY);
}
