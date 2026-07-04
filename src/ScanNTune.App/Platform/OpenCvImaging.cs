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
}
