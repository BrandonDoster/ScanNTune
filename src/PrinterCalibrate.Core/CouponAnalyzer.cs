using OpenCvSharp;
using PrinterCalibrate.Core.Detection;
using PrinterCalibrate.Core.Grids;
using PrinterCalibrate.Core.Solving;

namespace PrinterCalibrate.Core;

/// <summary>
/// Orchestrates the pipeline: detect ring centres + part mask → locate the orientation fiducial
/// → map rings to the nominal grid → fit the affine → convert scale/skew into a calibration
/// result. Stages are injected so each is independently testable; the parameterless constructor
/// wires the default implementations.
/// </summary>
public sealed class CouponAnalyzer : ICouponAnalyzer
{
    private readonly IRingDetector _detector;
    private readonly IGridMapper _mapper;
    private readonly IAffineSolver _solver;

    public CouponAnalyzer(
        IRingDetector detector,
        IGridMapper mapper,
        IAffineSolver solver)
    {
        _detector = detector ?? throw new ArgumentNullException(nameof(detector));
        _mapper = mapper ?? throw new ArgumentNullException(nameof(mapper));
        _solver = solver ?? throw new ArgumentNullException(nameof(solver));
    }

    public CouponAnalyzer()
        : this(new RingDetector(), new GridMapper(), new AffineSolver())
    {
    }

    public CalibrationResult Analyze(Mat image, AnalysisOptions options)
    {
        ArgumentNullException.ThrowIfNull(options);

        IReadOnlyList<DetectedRing> rings = _detector.Detect(image);
        GridMapping mapping = _mapper.Map(rings, options.Coupon);
        AffineModel affine = _solver.Solve(mapping.Points);

        double reference = options.PxPerMm
            ?? Math.Sqrt(affine.ScaleXPxPerMm * affine.ScaleYPxPerMm);

        double xScalePercent = (affine.ScaleXPxPerMm / reference - 1.0) * 100.0;
        double yScalePercent = (affine.ScaleYPxPerMm / reference - 1.0) * 100.0;
        double skewDegrees = affine.SkewDegrees;
        double pxPerMmX = affine.ScaleXPxPerMm;
        double pxPerMmY = affine.ScaleYPxPerMm;

        // A mirror-flipped scan swaps the X/Y axes and reverses the skew; undo that.
        if (options.ScannedFlipped)
        {
            (xScalePercent, yScalePercent) = (yScalePercent, xScalePercent);
            (pxPerMmX, pxPerMmY) = (pxPerMmY, pxPerMmX);
            skewDegrees = -skewDegrees;
        }

        var orientation = new Orientation(
            mapping.FiducialUsed, mapping.OriginX, mapping.OriginY, mapping.XAxisX, mapping.XAxisY);

        return new CalibrationResult(
            xScalePercent,
            yScalePercent,
            skewDegrees,
            rings.Count,
            pxPerMmX,
            pxPerMmY,
            affine.RmsResidualPx,
            rings,
            orientation);
    }

    public CalibrationResult Analyze(string imagePath, AnalysisOptions options)
    {
        using Mat image = Cv2.ImRead(imagePath, ImreadModes.Color);
        if (image.Empty())
            throw new InvalidOperationException($"Could not read image: {imagePath}");
        return Analyze(image, options);
    }
}
