namespace ScanNTune.Core;

/// <summary>
/// The result of combining two quarter-turn scans of the same coupon. <see cref="Combined"/> holds
/// the printer's X/Y scale and skew with the scanner's own anisotropy and skew averaged out (the
/// value the user should act on); <see cref="Scanner"/> is the scanner's error, recovered as a free
/// diagnostic. <see cref="ScanA"/> and <see cref="ScanB"/> are the untouched per-scan results (for
/// overlays and drill-down). <see cref="RelativeRotationDegrees"/> is how far the coupon actually
/// turned between the two scans — it should be ~90°; <see cref="RotationLooksValid"/> is false when
/// it is not, which means the two poses were too similar for the scanner error to cancel and the
/// combined figures cannot be trusted.
/// </summary>
public sealed record TwoScanResult(
    CalibrationResult Combined,
    ScannerDiagnostic Scanner,
    CalibrationResult ScanA,
    CalibrationResult ScanB,
    double RelativeRotationDegrees,
    bool RotationLooksValid);
