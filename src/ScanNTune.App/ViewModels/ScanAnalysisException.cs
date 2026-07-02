using System;

namespace ScanNTune.App.ViewModels;

/// <summary>
/// Raised when one scan fails to resolve, carrying which scan it was, how many rings were found, and
/// a rendered diagnostic overlay (the detected rings) so the UI can show what was captured.
/// </summary>
public sealed class ScanAnalysisException : Exception
{
    public ScanAnalysisException(bool isFirst, int ringCount, string message, byte[] diagnosticPng)
        : base(message)
    {
        IsFirst = isFirst;
        RingCount = ringCount;
        DiagnosticPng = diagnosticPng;
    }

    public bool IsFirst { get; }

    public int RingCount { get; }

    public byte[] DiagnosticPng { get; }
}
