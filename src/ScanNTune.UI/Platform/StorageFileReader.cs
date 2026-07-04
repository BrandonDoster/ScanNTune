using System.IO;
using System.Threading.Tasks;
using Avalonia.Platform.Storage;

namespace ScanNTune.UI.Platform;

/// <summary>
/// Reads an Avalonia <see cref="IStorageFile"/> to a byte[] through its storage stream, which works on the
/// desktop (real files) and in the browser (where no local path exists). Shared by the pages that ingest a
/// picked or dropped scan so the read path lives in one place.
/// </summary>
internal sealed class StorageFileReader
{
    public async Task<byte[]> ReadAllBytesAsync(IStorageFile file)
    {
        await using Stream stream = await file.OpenReadAsync();
        using var buffer = new MemoryStream();
        // In the browser the file is read in slices across the JS boundary, so a bigger copy buffer means far
        // fewer round-trips (a handful instead of a hundred for a several-MB photo). Harmless on the desktop.
        await stream.CopyToAsync(buffer, 1 << 20);
        return buffer.ToArray();
    }
}
