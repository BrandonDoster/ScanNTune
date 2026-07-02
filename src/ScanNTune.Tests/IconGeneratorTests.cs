using OpenCvSharp;

namespace ScanNTune.Tests;

/// <summary>
/// Renders the ScanNTune app icon (the coupon's two-solid orientation marker on a graphite tile)
/// and packs a multi-resolution Windows .ico. Drawn with OpenCvSharp at a 1024 px supersample and
/// downscaled with area interpolation so every size is cleanly anti-aliased. Kept <see cref="ExplicitAttribute"/>
/// because it writes build assets into ScanNTune.App/Assets, not a unit assertion — run it on demand
/// with: dotnet test --filter GenerateAppIcon.
/// </summary>
[TestFixture]
public class IconGeneratorTests
{
    // #22262d graphite tile, #ffffff rings, #38bdf8 cyan markers — expressed as OpenCV BGR.
    private static readonly Scalar Graphite = new(0x2d, 0x26, 0x22);
    private static readonly Scalar White = new(0xff, 0xff, 0xff);
    private static readonly Scalar Cyan = new(0xf8, 0xbd, 0x38);

    private static readonly int[] IconSizes = { 16, 24, 32, 48, 64, 128, 256 };

    [Test, Explicit("Writes app-icon assets; run on demand.")]
    public void GenerateAppIcon()
    {
        const int master = 1024;
        using Mat tile = RenderTile(master);

        string assets = Path.GetFullPath(Path.Combine(
            TestContext.CurrentContext.TestDirectory, "..", "..", "..", "..", "ScanNTune.App", "Assets"));
        Directory.CreateDirectory(assets);

        var frames = new List<byte[]>();
        foreach (int size in IconSizes)
        {
            using var scaled = new Mat();
            Cv2.Resize(tile, scaled, new Size(size, size), 0, 0, InterpolationFlags.Area);
            Cv2.ImEncode(".png", scaled, out byte[] png);
            frames.Add(png);
            if (size == 256)
                File.WriteAllBytes(Path.Combine(assets, "icon-256.png"), png);
        }

        byte[] ico = PackIco(IconSizes, frames);
        string icoPath = Path.Combine(assets, "ScanNTune.ico");
        File.WriteAllBytes(icoPath, ico);

        TestContext.Out.WriteLine($"Wrote {icoPath} ({ico.Length} bytes, {IconSizes.Length} frames)");
        Assert.That(File.Exists(icoPath), Is.True);
    }

    /// <summary>Draw the graphite rounded tile with the 3x3 ring grid and the two solid cyan markers.</summary>
    private Mat RenderTile(int s)
    {
        // Proportions taken from the 256 px master SVG (rx 0.225, ring r 0.1168, stroke 0.0332, grid 0.2/0.5/0.8).
        int rx = (int)Math.Round(0.225 * s);
        int r = (int)Math.Round(0.1168 * s);
        int stroke = Math.Max(1, (int)Math.Round(0.0332 * s));
        int[] g = { (int)Math.Round(0.20 * s), (int)Math.Round(0.50 * s), (int)Math.Round(0.80 * s) };

        using var bgr = new Mat(s, s, MatType.CV_8UC3, Graphite);
        using var alpha = RoundedRectMask(s, rx);

        foreach (int cy in g)
            foreach (int cx in g)
            {
                bool marker = cy == g[0] && (cx == g[0] || cx == g[1]); // top-left corner + its +X neighbour
                if (marker)
                    Cv2.Circle(bgr, new Point(cx, cy), r, Cyan, -1, LineTypes.AntiAlias);
                else
                    Cv2.Circle(bgr, new Point(cx, cy), r, White, stroke, LineTypes.AntiAlias);
            }

        Mat[] channels = Cv2.Split(bgr);
        try
        {
            var bgra = new Mat();
            Cv2.Merge(new[] { channels[0], channels[1], channels[2], alpha }, bgra);
            return bgra;
        }
        finally
        {
            foreach (Mat c in channels)
                c.Dispose();
        }
    }

    /// <summary>Filled rounded-rectangle alpha mask: centre cross of rects plus four anti-aliased corner discs.</summary>
    private Mat RoundedRectMask(int s, int rx)
    {
        var mask = new Mat(s, s, MatType.CV_8UC1, Scalar.All(0));
        Cv2.Rectangle(mask, new Rect(rx, 0, s - 2 * rx, s), Scalar.All(255), -1);
        Cv2.Rectangle(mask, new Rect(0, rx, s, s - 2 * rx), Scalar.All(255), -1);
        foreach (var c in new[]
                 {
                     new Point(rx, rx), new Point(s - rx, rx),
                     new Point(rx, s - rx), new Point(s - rx, s - rx),
                 })
            Cv2.Circle(mask, c, rx, Scalar.All(255), -1, LineTypes.AntiAlias);
        return mask;
    }

    /// <summary>Assemble a PNG-compressed ICO (ICONDIR + ICONDIRENTRY[] + PNG blobs).</summary>
    private byte[] PackIco(int[] sizes, List<byte[]> frames)
    {
        using var ms = new MemoryStream();
        using var w = new BinaryWriter(ms);

        w.Write((ushort)0);          // reserved
        w.Write((ushort)1);          // type: icon
        w.Write((ushort)sizes.Length);

        int offset = 6 + 16 * sizes.Length;
        for (int i = 0; i < sizes.Length; i++)
        {
            w.Write((byte)(sizes[i] >= 256 ? 0 : sizes[i])); // width  (0 == 256)
            w.Write((byte)(sizes[i] >= 256 ? 0 : sizes[i])); // height (0 == 256)
            w.Write((byte)0);        // palette colours
            w.Write((byte)0);        // reserved
            w.Write((ushort)1);      // colour planes
            w.Write((ushort)32);     // bits per pixel
            w.Write(frames[i].Length);
            w.Write(offset);
            offset += frames[i].Length;
        }

        foreach (byte[] frame in frames)
            w.Write(frame);

        w.Flush();
        return ms.ToArray();
    }
}
