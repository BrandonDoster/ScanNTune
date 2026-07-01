namespace PrinterCalibrate.Core.Output;

/// <summary>A single ready-to-apply correction: the snippet to copy and a note on where it goes.</summary>
public sealed record Correction(string Code, string Hint);
