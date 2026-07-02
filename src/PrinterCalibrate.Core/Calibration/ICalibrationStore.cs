namespace PrinterCalibrate.Core.Calibration;

/// <summary>Persists the one-time scanner calibration between sessions.</summary>
public interface ICalibrationStore
{
    /// <summary>The stored calibration, or null if the scanner has never been calibrated.</summary>
    ScannerCalibration? Load();

    void Save(ScannerCalibration calibration);

    /// <summary>Forget the stored calibration (so the next run prompts to calibrate again).</summary>
    void Clear();
}
