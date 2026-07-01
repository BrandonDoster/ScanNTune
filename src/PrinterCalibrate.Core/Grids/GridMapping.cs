namespace PrinterCalibrate.Core.Grids;

/// <summary>
/// The grid mapper's output: the indexed correspondences plus the pose it resolved from the
/// two-solid orientation marker (origin and the +X axis in pixel space). <see cref="Flipped"/>
/// is true when the marker showed the scan is mirror-flipped (already accounted for).
/// </summary>
public sealed record GridMapping(
    IReadOnlyList<GridCorrespondence> Points,
    double OriginX,
    double OriginY,
    double XAxisX,
    double XAxisY,
    bool Flipped);
