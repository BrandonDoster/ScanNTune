using System.Globalization;

namespace ScanNTune.Core.Output;

/// <summary>
/// Default correction formatter. Same maths as the Vector 3D "Califlower" calculator, but
/// exposed per-flavour so each can be shown on its own: shrinkage = (1 + error)·100, part
/// scale = (1 - error)·100, steps/mm scale by (1 - error), rotation distance by (1 + error),
/// Marlin XY_SKEW_FACTOR = tan(skew), Klipper SET_SKEW from the baseline triangle.
/// </summary>
public sealed class CorrectionFormatter : ICorrectionFormatter
{
    public const string Klipper = "Klipper";
    public const string Marlin = "Marlin";
    public const string RepRap = "RepRapFirmware";

    public const string Shrinkage = "Shrinkage %";
    public const string StepsPerMm = "Steps/mm";
    public const string RotationDistance = "Rotation distance";
    public const string Scale = "Scale %";

    private readonly CultureInfo _inv = CultureInfo.InvariantCulture;

    public IReadOnlyList<string> SkewFlavours { get; } = [Klipper, Marlin, RepRap];

    public IReadOnlyList<string> SizeFlavours { get; } = [Shrinkage, StepsPerMm, RotationDistance, Scale];

    public string? CurrentValueLabel(string sizeFlavour) => sizeFlavour switch
    {
        StepsPerMm => "current steps/mm",
        RotationDistance => "current rot. dist.",
        _ => null,
    };

    public Correction Skew(string flavour, double skewDegrees, CouponSpec coupon)
    {
        ArgumentNullException.ThrowIfNull(coupon);

        // skewDegrees is the measured corner-angle error (angle − 90°). The shear the firmwares
        // model, x' = x + tan·y, CLOSES the corner, so its coefficient is the negation of the
        // angle error. All three emissions below are stated in terms of that shear coefficient
        // and are verified against the firmware sources (klippy skew_correction.py applies
        // x − y·factor; Marlin planner.h subtracts; RRF Move.cpp adds).
        double tan = Math.Tan(-skewDegrees * Math.PI / 180.0);
        if (!double.IsFinite(tan) || Math.Abs(skewDegrees) >= 45.0)
            return new Correction("skew out of range, check the scan", "A real coupon skews well under 1°; this suggests a detection problem.");

        switch (flavour)
        {
            case Marlin:
                return new Correction(
                    string.Format(_inv, "M852 I{0:0.000000}\nM500", tan),
                    string.Format(_inv, "Send via console; M500 saves it. Or set #define XY_SKEW_FACTOR {0:0.000000} in Configuration.h.", tan));

            case RepRap:
                // RRF's user-to-machine transform ADDS tanXY·Y (Move.cpp AxisTransform), the
                // opposite of Marlin's planner which subtracts — so RRF needs the negated factor.
                return new Correction(
                    string.Format(_inv, "M556 S100 X{0:0.000}", -100.0 * tan),
                    "Add to config.g.");

            default: // Klipper
                double l = coupon.BaselineMm;
                double ac = l * Math.Sqrt((1.0 + tan) * (1.0 + tan) + 1.0);
                double bd = l * Math.Sqrt((tan - 1.0) * (tan - 1.0) + 1.0);
                double ad = l * Math.Sqrt(tan * tan + 1.0);
                return new Correction(
                    string.Format(_inv, "SET_SKEW XY={0:0.###},{1:0.###},{2:0.###}\nSKEW_PROFILE SAVE=ScanNTune\nSAVE_CONFIG", ac, bd, ad),
                    string.Empty,
                    PrimaryCaption: "Paste into the Klipper console:",
                    SecondaryCaption: "Add this to your start g-code:",
                    SecondaryCode: "SKEW_PROFILE LOAD=ScanNTune");
        }
    }

    public Correction Size(string flavour, double xScalePercent, double yScalePercent, double? currentX, double? currentY)
    {
        // A real printer's dimensional error is well under 2%; a reading beyond a few percent means
        // a wrong DPI (a 2x mismatch reads ±50-100%) or a broken detection. Refusing to synthesize
        // firmware commands from it matters: at +100% the steps/mm branch would emit M92 X0.000.
        if (!double.IsFinite(xScalePercent) || !double.IsFinite(yScalePercent)
            || Math.Abs(xScalePercent) >= 10.0 || Math.Abs(yScalePercent) >= 10.0)
            return new Correction(
                "scale out of range, check the scan and DPI",
                "A real printer errs well under 2%; this suggests the scan DPI doesn't match the calibration, or a detection problem.");

        double xf = xScalePercent / 100.0;
        double yf = yScalePercent / 100.0;
        double avg = (xf + yf) / 2.0;

        // The exact correction is the nominal/measured ratio: new = current / (1 + error). The
        // first-order form current × (1 − error) leaves an error² residual, so the ratio is used
        // throughout (shrinkage and rotation distance are already exact in their (1 + error) form).
        switch (flavour)
        {
            case StepsPerMm:
                if (currentX is { } sx && currentY is { } sy)
                    return new Correction(
                        string.Format(_inv, "M92 X{0:0.000} Y{1:0.000}\nM500", sx / (1.0 + xf), sy / (1.0 + yf)),
                        "Send via console; M500 saves (Marlin). On Klipper use the Rotation distance flavour.");
                return new Correction(
                    "enter current steps/mm above",
                    "New = current / (1 + error), per axis.");

            case RotationDistance:
                if (currentX is { } rx && currentY is { } ry)
                    return new Correction(
                        string.Format(_inv, "X {0:0.0000}   Y {1:0.0000}", (1.0 + xf) * rx, (1.0 + yf) * ry),
                        "Set rotation_distance in printer.cfg (Klipper).");
                return new Correction(
                    "enter current rotation distance above",
                    "New = current × (1 + error), per axis.");

            case Scale:
                return new Correction(
                    string.Format(_inv, "X {0:0.00} %   Y {1:0.00} %", 100.0 / (1.0 + xf), 100.0 / (1.0 + yf)),
                    "Scale the model per-axis in your slicer (X and Y can differ).");

            default: // Shrinkage
                return new Correction(
                    string.Format(_inv, "XY shrinkage: {0:0.00} %", (1.0 + avg) * 100.0),
                    "OrcaSlicer / SuperSlicer: Filament → Advanced → Shrinkage compensation (XY). Single value; use Steps/mm for per-axis.");
        }
    }
}
