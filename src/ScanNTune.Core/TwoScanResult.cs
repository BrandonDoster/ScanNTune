namespace ScanNTune.Core;

/// <summary>
/// The result of combining two quarter-turn scans of the same coupon. <see cref="Combined"/> holds
/// the printer's X/Y scale and skew with the scanner's own anisotropy and skew averaged out (the
/// value the user should act on); <see cref="Scanner"/> is the scanner's error, recovered as a free
/// diagnostic. <see cref="ScanA"/> and <see cref="ScanB"/> are the untouched per-scan results (for
/// overlays and drill-down). <see cref="RelativeRotationDegrees"/> is how far the coupon actually
/// turned between the two scans — it should be ~90°; <see cref="RotationLooksValid"/> is false when
/// it is not, which means the scanner error could not cancel and the combined figures cannot be
/// trusted. <see cref="FlipMismatch"/> is the specific case where one scan is mirror-flipped
/// relative to the other (the coupon was turned over between scans): the skew cancellation is
/// broken even though the turn itself may read ~90°.
/// </summary>
public sealed record TwoScanResult(
    CalibrationResult Combined,
    ScannerDiagnostic Scanner,
    CalibrationResult ScanA,
    CalibrationResult ScanB,
    double RelativeRotationDegrees,
    bool RotationLooksValid,
    bool FlipMismatch = false);
