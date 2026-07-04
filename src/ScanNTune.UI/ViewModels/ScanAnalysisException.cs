using System;
using Avalonia.Media.Imaging;

namespace ScanNTune.UI.ViewModels;

/// <summary>
/// Raised when one scan fails to resolve, carrying which scan it was, how many rings were found, and a
/// diagnostic overlay (the detected rings) so the UI can show what was captured.
/// </summary>
public sealed class ScanAnalysisException : Exception
{
    public ScanAnalysisException(bool isFirst, int ringCount, string message, Bitmap? diagnostic)
        : base(message)
    {
        IsFirst = isFirst;
        RingCount = ringCount;
        Diagnostic = diagnostic;
    }

    public bool IsFirst { get; }

    public int RingCount { get; }

    public Bitmap? Diagnostic { get; }
}
