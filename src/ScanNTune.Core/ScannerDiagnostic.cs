namespace ScanNTune.Core;

/// <summary>
/// The scanner's own systematic geometric error, recovered as the half-difference between two
/// quarter-turn scans. <see cref="AnisotropyPercent"/> is how much more the scanner stretches one
/// bed axis than the other (positive = the axis that was along the first scan's +X reads larger);
/// <see cref="SkewDegrees"/> is the scanner's own axis skew. Both are cancelled from the printer
/// result — they are reported only as a health readout for the scanner.
/// </summary>
public sealed record ScannerDiagnostic(double AnisotropyPercent, double SkewDegrees);
