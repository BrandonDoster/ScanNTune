namespace PrinterCalibrate.Core.Grids;

/// <summary>
/// The grid mapper's output: the indexed correspondences plus the pose it resolved (origin and
/// the +X axis in pixel space, and whether the printed fiducial was used to fix that pose).
/// </summary>
public sealed record GridMapping(
    IReadOnlyList<GridCorrespondence> Points,
    double OriginX,
    double OriginY,
    double XAxisX,
    double XAxisY,
    bool FiducialUsed);
