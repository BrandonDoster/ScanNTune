using OpenCvSharp;

namespace ScanNTune.Core;

/// <summary>Runs the full scan → calibration pipeline.</summary>
public interface ICouponAnalyzer
{
    CalibrationResult Analyze(Mat image, AnalysisOptions options);

    CalibrationResult Analyze(string imagePath, AnalysisOptions options);
}
