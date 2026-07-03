using System.Globalization;

namespace ScanNTune.Core.Input;

/// <summary>
/// Parses numbers the user typed into a text box. The UI displays results in the current culture
/// (a German machine shows "0,098"), so typed input is accepted in the current culture FIRST and
/// invariant form second (pre-filled field values are written invariantly and must round-trip).
/// Group separators are rejected in both passes: "1.200" meant as twelve hundred cannot be told
/// apart from 1.2, so callers put range checks on top where the ambiguity matters.
/// </summary>
public sealed class UserNumberParser
{
    public bool TryParseDouble(string? text, out double value)
    {
        value = 0;
        if (string.IsNullOrWhiteSpace(text))
            return false;
        return double.TryParse(text, NumberStyles.Float, CultureInfo.CurrentCulture, out value)
               || double.TryParse(text, NumberStyles.Float, CultureInfo.InvariantCulture, out value);
    }

    public bool TryParseInt(string? text, out int value)
    {
        value = 0;
        if (string.IsNullOrWhiteSpace(text))
            return false;
        return int.TryParse(text, NumberStyles.Integer, CultureInfo.CurrentCulture, out value)
               || int.TryParse(text, NumberStyles.Integer, CultureInfo.InvariantCulture, out value);
    }
}
