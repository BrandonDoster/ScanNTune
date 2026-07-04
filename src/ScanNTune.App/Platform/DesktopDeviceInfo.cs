using ScanNTune.UI.Platform;

namespace ScanNTune.App.Platform;

// The desktop app always has a physical keyboard, so text entry stays on everywhere.
internal sealed class DesktopDeviceInfo : IDeviceInfo
{
    public bool IsTouchPrimary => false;
}
