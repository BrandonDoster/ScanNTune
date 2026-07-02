namespace ScanNTune.Core.Updates;

/// <summary>
/// Background auto-update port. The implementation checks a release feed, downloads a pending update,
/// and stages it to apply on exit — the UI stays headless-testable by depending only on this.
/// </summary>
public interface IAppUpdater
{
    Task<bool> CheckForUpdateAsync();

    Task DownloadUpdateAsync();

    void ApplyUpdateOnExit();
}
