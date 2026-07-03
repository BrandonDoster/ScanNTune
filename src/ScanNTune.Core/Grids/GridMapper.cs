namespace ScanNTune.Core.Grids;

/// <summary>
/// Default grid mapper. Estimates the grid axes/pitch from nearest-neighbour vectors, indexes
/// the rings, then resolves orientation from the two-solid marker: the coupon's origin-corner
/// ring AND its neighbour are printed solid (no hole), so they show up as two adjacent grid
/// vertices with no detected ring. origin→neighbour is the coupon's +X, which pins orientation
/// at ANY rotation and flip. The marker is required — if it can't be located the scan is rejected
/// (there is no rotation-only fallback).
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

        // theta is folded into (-45°,45°], so colHat points +x and rowHat points +y (image-y down).
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

        var occupied = new HashSet<(int, int)>();
        for (int i = 0; i < n; i++)
            occupied.Add((col[i], row[i]));

        // The two solid marker vertices are always missing; tolerate at most ONE stray missed hole
        // on top. Beyond that the marker search can silently land on the wrong corner (a second
        // corner+neighbour pair of misses looks exactly like the marker), so reject loudly instead.
        // Count against the coupon's SPECIFIED grid, not the detected extent: a fully missed outer
        // row shrinks the extent and would otherwise hide its own misses from this check.
        int missing = spec.GridN * spec.GridN - occupied.Count;
        if (missing > 3)
            throw new InvalidOperationException(
                $"{missing} grid positions are missing a detected ring; only the two solid marker " +
                "rings plus one stray miss are tolerated. Check the scan quality and contrast.");

        int markerCandidates = FindMarker(occupied, maxCol, maxRow, out (int c, int r) origin, out (int dc, int dr) toNeighbour);
        if (markerCandidates == 0)
            throw new InvalidOperationException(
                "Could not locate the two solid orientation rings (an origin corner plus its neighbour). " +
                "Check the scan quality and that the coupon carries the orientation marker.");
        if (markerCandidates > 1)
            throw new InvalidOperationException(
                "The orientation marker is ambiguous: more than one corner has a missing neighbour, " +
                "so the +X direction cannot be determined (a hole next to a corner may have gone " +
                "undetected). Rescan with better contrast.");

        (double x, double y) g00 = OriginOfIndexSpace(points, col, row, colHat, rowHat, geo.PitchPx);
        (double x, double y) originPx =
            (g00.x + origin.c * geo.PitchPx * colHat.x + origin.r * geo.PitchPx * rowHat.x,
             g00.y + origin.c * geo.PitchPx * colHat.y + origin.r * geo.PitchPx * rowHat.y);

        (double x, double y) xHat = (toNeighbour.dc * colHat.x + toNeighbour.dr * rowHat.x,
                                     toNeighbour.dc * colHat.y + toNeighbour.dr * rowHat.y);
        (double x, double y) perp = Math.Abs(xHat.x * colHat.x + xHat.y * colHat.y) > 0.5 ? rowHat : colHat;
        if (perp.x * (geo.CentroidX - originPx.x) + perp.y * (geo.CentroidY - originPx.y) < 0)
            perp = (-perp.x, -perp.y);
        (double x, double y) yHat = perp;

        // Flip (informational): the marker's +X agrees with the rotation-only guess for this
        // corner on a normal scan, and points along its perpendicular (a swap) when mirror-flipped.
        (var xHatCorner, var yHatCorner) = CornerRuleAxes(origin, maxCol, maxRow, colHat, rowHat);
        bool flipped = Math.Abs(xHat.x * yHatCorner.x + xHat.y * yHatCorner.y) >
                       Math.Abs(xHat.x * xHatCorner.x + xHat.y * xHatCorner.y);

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

        return new GridMapping(mapped, originPx.x, originPx.y, xHat.x, xHat.y, flipped);
    }

    /// <summary>
    /// The two solid rings are two missing grid vertices: a corner and one edge-neighbour.
    /// Counts every such (corner, neighbour) pair and reports the last one found; the marker is
    /// only trustworthy when the count is exactly 1. A count above 1 is genuinely ambiguous —
    /// e.g. a stray missed hole adjacent to the marker corner gives that corner two missing
    /// neighbours and there is no way to tell which one is the printed +X.
    /// </summary>
    private int FindMarker(HashSet<(int, int)> occupied, int maxCol, int maxRow,
        out (int c, int r) origin, out (int dc, int dr) toNeighbour)
    {
        origin = default;
        toNeighbour = default;

        (int dc, int dr)[] steps = [(1, 0), (-1, 0), (0, 1), (0, -1)];
        int found = 0;
        for (int c = 0; c <= maxCol; c++)
        {
            for (int r = 0; r <= maxRow; r++)
            {
                if (occupied.Contains((c, r)) || !IsCorner((c, r), maxCol, maxRow))
                    continue;

                foreach ((int dc, int dr) in steps)
                {
                    int nc = c + dc, nr = r + dr;
                    if (nc < 0 || nc > maxCol || nr < 0 || nr > maxRow)
                        continue;
                    if (occupied.Contains((nc, nr)))
                        continue;

                    found++;
                    origin = (c, r);
                    toNeighbour = (dc, dr);
                }
            }
        }

        return found;
    }

    private bool IsCorner((int c, int r) v, int maxCol, int maxRow) =>
        (v.c == 0 || v.c == maxCol) && (v.r == 0 || v.r == maxRow);

    /// <summary>Rotation-only axis assignment from a corner (used only to flag a mirror-flip).</summary>
    private ((double x, double y) xHat, (double x, double y) yHat) CornerRuleAxes(
        (int c, int r) corner, int maxCol, int maxRow, (double x, double y) colHat, (double x, double y) rowHat)
    {
        (double x, double y) Neg((double x, double y) v) => (-v.x, -v.y);
        if (corner == (0, maxRow)) return (colHat, Neg(rowHat));
        if (corner == (0, 0)) return (rowHat, colHat);
        if (corner == (maxCol, 0)) return (Neg(colHat), rowHat);
        return (Neg(rowHat), Neg(colHat)); // (maxCol, maxRow)
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
        int m = sorted.Count;
        if (m == 0)
            return 0;
        return m % 2 == 1 ? sorted[m / 2] : (sorted[m / 2 - 1] + sorted[m / 2]) / 2.0;
    }

    private readonly record struct Geometry(
        (double x, double y) U, (double x, double y) V, double PitchPx, double CentroidX, double CentroidY);
}
