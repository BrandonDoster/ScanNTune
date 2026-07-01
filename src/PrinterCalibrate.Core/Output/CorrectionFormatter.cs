using System.Globalization;

namespace PrinterCalibrate.Core.Output;

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

        double tan = Math.Tan(skewDegrees * Math.PI / 180.0);
        if (!double.IsFinite(tan) || Math.Abs(skewDegrees) >= 45.0)
            return new Correction("skew out of range — check the scan", "A real coupon skews well under 1°; this suggests a detection problem.");

        switch (flavour)
        {
            case Marlin:
                return new Correction(
                    string.Format(_inv, "M852 I{0:0.000000}\nM500", tan),
                    string.Format(_inv, "Send via console; M500 saves it. Or set #define XY_SKEW_FACTOR {0:0.000000} in Configuration.h.", tan));

            case RepRap:
                return new Correction(
                    string.Format(_inv, "M556 S100 X{0:0.000}", 100.0 * tan),
                    "Add to config.g.");

            default: // Klipper
                double l = coupon.BaselineMm;
                double ac = l * Math.Sqrt((1.0 + tan) * (1.0 + tan) + 1.0);
                double bd = l * Math.Sqrt((tan - 1.0) * (tan - 1.0) + 1.0);
                double ad = l * Math.Sqrt(tan * tan + 1.0);
                return new Correction(
                    string.Format(_inv, "SET_SKEW XY={0:0.###},{1:0.###},{2:0.###}\nSKEW_PROFILE SAVE=CaliFlower", ac, bd, ad),
                    "Send both via console, then SAVE_CONFIG. Add SKEW_PROFILE LOAD=CaliFlower to your start g-code.");
        }
    }

    public Correction Size(string flavour, double xScalePercent, double yScalePercent, double? currentX, double? currentY)
    {
        double xf = xScalePercent / 100.0;
        double yf = yScalePercent / 100.0;
        double avg = (xf + yf) / 2.0;

        switch (flavour)
        {
            case StepsPerMm:
                if (currentX is { } sx && currentY is { } sy)
                    return new Correction(
                        string.Format(_inv, "M92 X{0:0.000} Y{1:0.000}\nM500", sx * (1.0 - xf), sy * (1.0 - yf)),
                        "Send via console; M500 saves. (Marlin M92 / Klipper steps.)");
                return new Correction(
                    "enter current steps/mm above",
                    "New = current × (1 − error), per axis.");

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
                    string.Format(_inv, "X {0:0.00} %   Y {1:0.00} %", (1.0 - xf) * 100.0, (1.0 - yf) * 100.0),
                    "Scale the model per-axis in your slicer (X and Y can differ).");

            default: // Shrinkage
                return new Correction(
                    string.Format(_inv, "XY shrinkage: {0:0.00} %", (1.0 + avg) * 100.0),
                    "OrcaSlicer / SuperSlicer: Filament → Advanced → Shrinkage compensation (XY). Single value; use Steps/mm for per-axis.");
        }
    }
}
