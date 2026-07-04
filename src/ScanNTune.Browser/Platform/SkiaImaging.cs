using System;
using System.IO;
using OpenCvSharp;
using ScanNTune.UI.Platform;
using SkiaSharp;

namespace ScanNTune.Browser.Platform;

/// <summary>
/// Browser imaging: the wasm OpenCV build has no image codecs, so decode with Skia (present for Avalonia
/// rendering) into a BGR Mat, the same 3-channel layout Cv2.ImRead(..., Color) hands the engine on desktop.
/// </summary>
public sealed class SkiaImaging : IPlatformImaging
{
    public Mat DecodeBgr(byte[] data)
    {
        using SKBitmap decoded = SKBitmap.Decode(data)
            ?? throw new InvalidOperationException("Skia failed to decode the image.");
        // Normalise to a known BGRA8888 layout so the channel order into OpenCV is deterministic.
        using var bgra = new SKBitmap(new SKImageInfo(decoded.Width, decoded.Height, SKColorType.Bgra8888, SKAlphaType.Unpremul));
        if (!decoded.CopyTo(bgra, SKColorType.Bgra8888))
            throw new InvalidOperationException("Skia could not convert the image to BGRA8888.");

        // Pass Skia's actual row stride: SKBitmap may pad rows, and assuming width*4 would shear the image.
        using var wrapper = Mat.FromPixelData(bgra.Height, bgra.Width, MatType.CV_8UC4, bgra.GetPixels(), bgra.RowBytes);
        Mat bgr = new Mat();
        Cv2.CvtColor(wrapper, bgr, ColorConversionCodes.BGRA2BGR);
        return bgr;
    }

    public (int Width, int Height) GetImageSize(byte[] data)
    {
        // SKCodec reads just the image header, so this stays cheap and low-memory even for a large photo
        // (no full-resolution decode, which is the whole point of not doing it on the wasm thread).
        using var stream = new MemoryStream(data);
        using SKCodec codec = SKCodec.Create(stream)
            ?? throw new InvalidOperationException("Skia could not read the image header.");
        return (codec.Info.Width, codec.Info.Height);
    }
}
