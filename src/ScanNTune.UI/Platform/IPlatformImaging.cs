using OpenCvSharp;

namespace ScanNTune.UI.Platform;

/// <summary>
/// Head-supplied image decoding. Turning encoded bytes (PNG/JPEG/...) into a BGR <see cref="Mat"/> is
/// platform-specific: the desktop head uses OpenCV's own codecs, while the WebAssembly head decodes with
/// Skia because the wasm OpenCV build ships no image codecs. (Overlays need no codec: the drawn Mat is
/// turned into a bitmap directly from its pixels, which works on both platforms.)
/// </summary>
public interface IPlatformImaging
{
    /// <summary>Decode encoded image bytes into a 3-channel BGR Mat, the layout the engine expects.</summary>
    Mat DecodeBgr(byte[] data);

    /// <summary>
    /// Read only the pixel dimensions of encoded image bytes, cheaply (from the header where the codec allows),
    /// so a downscaled preview thumbnail can still report the scan's true resolution.
    /// </summary>
    (int Width, int Height) GetImageSize(byte[] data);
}
