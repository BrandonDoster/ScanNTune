using ScanNTune.Core.Calibration;

namespace ScanNTune.Tests;

/// <summary>
/// The stored calibration must round-trip through JSON unchanged, treat a missing/empty file as
/// "not calibrated", and apply the scanner's scale error correctly at any DPI.
/// </summary>
[TestFixture]
public class CalibrationStoreTests
{
    [Test]
    public void SaveThenLoad_RoundTrips()
    {
        string path = Path.GetTempFileName(); // exists but empty → first Load is "uncalibrated"
        try
        {
            var store = new JsonCalibrationStore(path);
            Assert.That(store.Load(), Is.Null, "an empty/corrupt file reads as not calibrated");

            var cal = new ScannerCalibration(
                PxPerMm: 23.5969, Dpi: 600, ReferenceMm: 85.5, MeasuredWidthPx: 2017.5,
                StraightnessPx: 0.297, ParallelismDegrees: 0.0018,
                CalibratedUtc: new DateTime(2026, 7, 2, 12, 0, 0, DateTimeKind.Utc));
            store.Save(cal);

            ScannerCalibration? loaded = store.Load();
            Assert.That(loaded, Is.Not.Null);
            Assert.Multiple(() =>
            {
                Assert.That(loaded!.PxPerMm, Is.EqualTo(cal.PxPerMm).Within(1e-9));
                Assert.That(loaded.Dpi, Is.EqualTo(cal.Dpi).Within(1e-9));
                Assert.That(loaded.ReferenceMm, Is.EqualTo(cal.ReferenceMm).Within(1e-9));
                Assert.That(loaded.MeasuredWidthPx, Is.EqualTo(cal.MeasuredWidthPx).Within(1e-9));
                Assert.That(loaded.CalibratedUtc, Is.EqualTo(cal.CalibratedUtc));
            });

            store.Clear();
            Assert.That(store.Load(), Is.Null, "cleared calibration is gone");
        }
        finally
        {
            if (File.Exists(path))
                File.Delete(path);
        }
    }

    [Test]
    public void PxPerMmAtDpi_AppliesScannerErrorAtAnyDpi()
    {
        var cal = new ScannerCalibration(23.5969, 600, 85.5, 2017.5, 0.3, 0.002, DateTime.UtcNow);
        double factor = 23.5969 / (600.0 / 25.4);
        Assert.Multiple(() =>
        {
            Assert.That(cal.CorrectionFactor, Is.EqualTo(factor).Within(1e-12));
            Assert.That(cal.PxPerMmAtDpi(600), Is.EqualTo(23.5969).Within(1e-9), "at its own DPI it returns the measured px/mm");
            Assert.That(cal.PxPerMmAtDpi(1200), Is.EqualTo((1200.0 / 25.4) * factor).Within(1e-9));
            Assert.That(cal.EffectiveDpi, Is.EqualTo(23.5969 * 25.4).Within(1e-9));
        });
    }
}
