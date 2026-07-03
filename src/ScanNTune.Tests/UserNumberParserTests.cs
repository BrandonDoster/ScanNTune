using System.Globalization;
using ScanNTune.Core.Input;

namespace ScanNTune.Tests;

/// <summary>
/// User-typed numbers must parse in the user's own locale (decimal comma on e.g. German Windows)
/// AND in invariant form (the app pre-fills fields invariantly), because the UI displays results
/// with the current culture — showing "+0,098 %" while rejecting a typed comma is inconsistent.
/// The parser tries the current culture first, then invariant.
/// </summary>
[TestFixture]
public class UserNumberParserTests
{
    private readonly UserNumberParser _parser = new();

    [Test]
    public void ParsesCommaDecimalInAGermanLocale()
    {
        using CultureScope _ = new("de-DE");
        Assert.Multiple(() =>
        {
            Assert.That(_parser.TryParseDouble("85,60", out double v), Is.True);
            Assert.That(v, Is.EqualTo(85.60).Within(1e-9));
        });
    }

    [Test]
    public void StillParsesDotDecimalInAGermanLocale()
    {
        // Pre-filled field values are written invariantly and must round-trip.
        using CultureScope _ = new("de-DE");
        Assert.Multiple(() =>
        {
            Assert.That(_parser.TryParseDouble("85.60", out double v), Is.True);
            Assert.That(v, Is.EqualTo(85.60).Within(1e-9));
        });
    }

    [Test]
    public void ParsesDotDecimalInAnEnglishLocale()
    {
        using CultureScope _ = new("en-US");
        Assert.Multiple(() =>
        {
            Assert.That(_parser.TryParseDouble("600.5", out double v), Is.True);
            Assert.That(v, Is.EqualTo(600.5).Within(1e-9));
        });
    }

    [Test]
    public void RejectsNonNumericAndEmptyInput()
    {
        Assert.Multiple(() =>
        {
            Assert.That(_parser.TryParseDouble("abc", out _), Is.False);
            Assert.That(_parser.TryParseDouble("", out _), Is.False);
            Assert.That(_parser.TryParseDouble(null, out _), Is.False);
            Assert.That(_parser.TryParseDouble("  ", out _), Is.False);
        });
    }

    [Test]
    public void ParsesIntegersInBothForms()
    {
        using CultureScope scope = new("de-DE");
        Assert.Multiple(() =>
        {
            Assert.That(_parser.TryParseInt("5", out int v), Is.True);
            Assert.That(v, Is.EqualTo(5));
            Assert.That(_parser.TryParseInt("5,5", out _), Is.False, "a fraction is not an integer");
        });
    }

    /// <summary>Sets CurrentCulture for the test and restores it on dispose.</summary>
    private sealed class CultureScope : IDisposable
    {
        private readonly CultureInfo _previous;

        public CultureScope(string name)
        {
            _previous = CultureInfo.CurrentCulture;
            CultureInfo.CurrentCulture = new CultureInfo(name);
        }

        public void Dispose() => CultureInfo.CurrentCulture = _previous;
    }
}
