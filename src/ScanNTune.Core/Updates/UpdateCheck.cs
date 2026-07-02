using Microsoft.Extensions.Logging;

namespace ScanNTune.Core.Updates;

/// <summary>
/// Runs the background update flow once at startup: check → download → stage for next restart. The updater
/// is built through a factory so a construction fault is caught by the same try as the rest — any failure
/// (offline, flaky feed, updater init) is logged and swallowed so it never blocks the app from opening.
/// All awaits use <c>ConfigureAwait(false)</c> so the download continuations stay off the UI thread.
/// </summary>
public sealed class UpdateCheck
{
    private readonly Func<IAppUpdater> _updaterFactory;
    private readonly ILogger<UpdateCheck>? _logger;

    public UpdateCheck(Func<IAppUpdater> updaterFactory, ILogger<UpdateCheck>? logger = null)
    {
        _updaterFactory = updaterFactory;
        _logger = logger;
    }

    public async Task RunAsync()
    {
        try
        {
            var updater = _updaterFactory();

            if (!await updater.CheckForUpdateAsync().ConfigureAwait(false)) return;

            await updater.DownloadUpdateAsync().ConfigureAwait(false);
            updater.ApplyUpdateOnExit();
        }
        catch (Exception exception)
        {
            _logger?.LogError(exception, "Background update check failed.");
        }
    }
}
