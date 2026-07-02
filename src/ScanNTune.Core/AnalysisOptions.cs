namespace ScanNTune.Core;

/// <summary>
/// Inputs that tune a single analysis run.
/// </summary>
public sealed record AnalysisOptions
{
    public CouponSpec Coupon { get; init; } = new();

    /// <summary>
    /// True scale of the source image in pixels per millimetre (scanner DPI / 25.4, or a
    /// reference object). Required to report absolute X/Y shrinkage. When null, the analyzer
    /// reports anisotropy only (X vs Y), assuming the average scale is correct.
    /// </summary>
    public double? PxPerMm { get; init; }

    public double? CurrentStepsPerMmX { get; init; }
    public double? CurrentStepsPerMmY { get; init; }
    public double? CurrentRotationDistanceX { get; init; }
    public double? CurrentRotationDistanceY { get; init; }
}
