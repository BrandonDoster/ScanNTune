using System.Threading.Tasks;
using ScanNTune.Core.Updates;
using Velopack;
using Velopack.Sources;

namespace ScanNTune.App;

/// <summary>
/// Velopack-backed updater against the GitHub release feed. The staged update is applied silently after the
/// user closes the app — <c>restart: false</c> means it lands on the next launch, never interrupting a session.
/// Outside an installed build (e.g. dev runs) <see cref="UpdateManager.IsInstalled"/> is false and it no-ops.
/// </summary>
public sealed class VelopackAppUpdater : IAppUpdater
{
    private readonly UpdateManager _manager;
    private UpdateInfo? _pending;

    public VelopackAppUpdater()
        => _manager = new UpdateManager(new GithubSource("https://github.com/jaak0b/ScanNTune", null, false));

    public async Task<bool> CheckForUpdateAsync()
    {
        if (!_manager.IsInstalled) return false;

        _pending = await _manager.CheckForUpdatesAsync().ConfigureAwait(false);
        return _pending is not null;
    }

    public async Task DownloadUpdateAsync()
    {
        if (_pending is not null)
            await _manager.DownloadUpdatesAsync(_pending).ConfigureAwait(false);
    }

    public void ApplyUpdateOnExit()
    {
        if (_pending is not null)
            _manager.WaitExitThenApplyUpdates(_pending.TargetFullRelease, silent: true, restart: false);
    }
}
