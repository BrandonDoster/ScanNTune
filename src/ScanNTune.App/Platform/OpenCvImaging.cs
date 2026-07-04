using System;
using OpenCvSharp;
using ScanNTune.UI.Platform;

namespace ScanNTune.App.Platform;

/// <summary>Desktop imaging: OpenCV decodes images on its own.</summary>
public sealed class OpenCvImaging : IPlatformImaging
{
    public Mat DecodeBgr(byte[] data)
    {
        Mat image = Cv2.ImDecode(data, ImreadModes.Color);
        if (image.Empty())
        {
            image.Dispose();
            throw new InvalidOperationException("Could not decode the image.");
        }
        return image;
    }

    public (int Width, int Height) GetImageSize(byte[] data)
    {
        // Desktop decodes natively and fast, so a full decode to read the size is fine here; there is no
        // memory pressure to warrant a header-only path as there is in the browser.
        using Mat image = Cv2.ImDecode(data, ImreadModes.Color);
        if (image.Empty())
            throw new InvalidOperationException("Could not decode the image.");
        return (image.Width, image.Height);
    }
}
