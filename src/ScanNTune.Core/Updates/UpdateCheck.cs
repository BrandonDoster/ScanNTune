using Microsoft.Extensions.Logging;
using ScanNTune.Core.Storage;

namespace ScanNTune.Core.Updates;

/// <summary>
/// Runs the background update flow once at startup: check → download → stage for next restart. The updater
/// is built through a factory so a construction fault is caught by the same try as the rest. Every step and
/// every failure is logged (the logger is required, never null), and any exception is swallowed so
/// a flaky network or offline machine never blocks the app from opening. All awaits use
/// <c>ConfigureAwait(false)</c> so the download continuations stay off the UI thread.
/// </summary>
public sealed class UpdateCheck
{
    // GitHub throttles unauthenticated release-feed calls to 60/hour per IP; checking at most once an hour keeps
    // us far under that no matter how often the app is launched.
    private const double MinIntervalHours = 1;
    private const string LastCheckedKey = "update.lastCheckedUtc";

    private readonly Func<IAppUpdater> _updaterFactory;
    private readonly IKeyValueStore _store;
    private readonly ILogger<UpdateCheck> _logger;

    public UpdateCheck(Func<IAppUpdater> updaterFactory, IKeyValueStore store, ILogger<UpdateCheck> logger)
    {
        _updaterFactory = updaterFactory;
        _store = store;
        _logger = logger;
    }

    public async Task<UpdateOutcome> RunAsync()
    {
        try
        {
            DateTimeOffset now = DateTimeOffset.UtcNow;
            DateTimeOffset lastChecked = _store.GetValue<DateTimeOffset>(LastCheckedKey);
            if (now - lastChecked < TimeSpan.FromHours(MinIntervalHours))
            {
                _logger.LogInformation("Skipping update check; last ran {LastChecked:o}, within the {Hours}h minimum interval.",
                    lastChecked, MinIntervalHours);
                return UpdateOutcome.UpToDate;
            }

            var updater = _updaterFactory();

            _logger.LogInformation("Checking for updates…");
            // Record the attempt before the network call so a failure (e.g. a 403 rate-limit) still waits the full
            // hour rather than retrying on the next launch.
            _store.SetValue(LastCheckedKey, now);

            if (!await updater.CheckForUpdateAsync().ConfigureAwait(false))
            {
                _logger.LogInformation("No update available.");
                return UpdateOutcome.UpToDate;
            }

            _logger.LogInformation("Update found; downloading…");
            await updater.DownloadUpdateAsync().ConfigureAwait(false);

            updater.ApplyUpdateOnExit();
            _logger.LogInformation("Update downloaded and staged; it applies on the next restart.");
            return UpdateOutcome.UpdateStaged;
        }
        catch (Exception exception)
        {
            _logger.LogError(exception, "Background update check failed.");
            return UpdateOutcome.Failed;
        }
    }
}
