namespace ScanNTune.Core.Output;

/// <summary>
/// A ready-to-apply correction: the snippet to copy and a note on where it goes. Some flavours (Klipper
/// skew) split into two separately-copyable snippets — the console commands and a start-g-code line — each
/// with its own caption. When <see cref="SecondaryCode"/> is null there is just the one snippet.
/// </summary>
public sealed record Correction(
    string Code,
    string Hint,
    string? PrimaryCaption = null,
    string? SecondaryCaption = null,
    string? SecondaryCode = null);
