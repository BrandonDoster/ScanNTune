namespace PrinterCalibrate.Core.Calibration;

/// <summary>
/// The outcome of measuring a known-length reference (a bank card) in a scan: the pixels-per-mm the
/// scan actually resolves, plus quality figures that let the caller judge and sanity-check the fit.
/// When <see cref="Success"/> is false the reference could not be measured and <see cref="Message"/>
/// says why; the numeric fields are then zero.
/// </summary>
public sealed record ScaleReferenceResult(
    bool Success,
    double PxPerMm,
    double MeasuredWidthPx,
    double DetectedMm,
    double StraightnessPx,
    double ParallelismDegrees,
    int EdgePointCount,
    string? Message = null);
