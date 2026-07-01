namespace PrinterCalibrate.Core;

/// <summary>
/// One ring matched to its place in the nominal grid: the integer (col,row) index, the
/// nominal millimetre position it should occupy, and where it was actually measured (px).
/// Col runs along the printer's +X axis, row along +Y.
/// </summary>
public readonly record struct GridCorrespondence(
    int Col,
    int Row,
    double NominalXmm,
    double NominalYmm,
    double MeasuredXpx,
    double MeasuredYpx);
