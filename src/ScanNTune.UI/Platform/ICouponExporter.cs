using System.Threading.Tasks;

namespace ScanNTune.UI.Platform;

/// <summary>
/// Hands the user the printable calibration coupon STL. This is inherently platform-specific: the desktop
/// head drops the bundled STL in a temp folder and opens the OS "Open with" chooser, while the browser head
/// triggers a file download. The STL bytes themselves come from the shared <c>avares://ScanNTune.UI</c> asset.
/// </summary>
public interface ICouponExporter
{
    Task ExportAsync();
}
