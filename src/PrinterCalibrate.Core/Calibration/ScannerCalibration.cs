using System.Text.Json.Serialization;

namespace PrinterCalibrate.Core.Calibration;

/// <summary>
/// A stored scanner calibration: the true pixels-per-mm the scanner resolves, recovered by measuring
/// a reference of known length. <see cref="CorrectionFactor"/> is the scanner's scale error relative
/// to its nominal DPI and is roughly constant across DPI settings, so <see cref="PxPerMmAtDpi"/> can
/// apply the same calibration to a coupon scanned at any resolution.
/// </summary>
public sealed record ScannerCalibration(
    double PxPerMm,
    double Dpi,
    double ReferenceMm,
    double MeasuredWidthPx,
    double StraightnessPx,
    double ParallelismDegrees,
    DateTime CalibratedUtc)
{
    /// <summary>Pixels-per-mm the DPI setting nominally implies (DPI / 25.4), before the scanner's error.</summary>
    [JsonIgnore]
    public double NominalPxPerMm => Dpi / 25.4;

    /// <summary>Measured px/mm ÷ nominal px/mm — the scanner's isotropic scale error (~1.0).</summary>
    [JsonIgnore]
    public double CorrectionFactor => NominalPxPerMm > 0 ? PxPerMm / NominalPxPerMm : 1.0;

    /// <summary>The DPI the scanner effectively resolves at (PxPerMm × 25.4).</summary>
    [JsonIgnore]
    public double EffectiveDpi => PxPerMm * 25.4;

    /// <summary>The scale error as a percentage of nominal (negative = the scanner reads small).</summary>
    [JsonIgnore]
    public double PercentVsNominal => (CorrectionFactor - 1.0) * 100.0;

    /// <summary>The true px/mm for a scan taken at <paramref name="dpi"/>, applying the stored error.</summary>
    public double PxPerMmAtDpi(double dpi) => (dpi / 25.4) * CorrectionFactor;
}
