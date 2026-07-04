using System.Collections.Concurrent;
using System.Text.Json;
using Microsoft.Extensions.Logging;

namespace ScanNTune.Core.Storage;

public interface IKeyValueStore
{
    T? GetValue<T>(string key, T? defaultValue = default);

    void SetValue<T>(string key, T value);
}

/// <summary>
/// A tiny JSON-backed key/value store: one <c>Settings.json</c> under the given directory, loaded lazily and
/// rewritten on every set. An unreadable or corrupt file is logged and treated as empty (a fresh start) rather
/// than throwing; a failed write is logged and rethrown so the caller can decide how to recover.
/// </summary>
public sealed class JsonKeyValueStore : IKeyValueStore
{
    private readonly Lazy<ConcurrentDictionary<string, object?>> _data;
    private readonly string _directoryPath;
    private readonly string _settingsFilePath;
    private readonly ILogger<JsonKeyValueStore>? _logger;

    public JsonKeyValueStore(string path, ILogger<JsonKeyValueStore>? logger = null)
    {
        _directoryPath = path;
        _settingsFilePath = Path.Combine(_directoryPath, "Settings.json");
        _logger = logger;
        _data = new Lazy<ConcurrentDictionary<string, object?>>(ValueFactory);
    }

    private ConcurrentDictionary<string, object?> ValueFactory()
    {
        try
        {
            if (!Directory.Exists(_directoryPath))
                Directory.CreateDirectory(_directoryPath);

            return File.Exists(_settingsFilePath)
                ? JsonSerializer.Deserialize<ConcurrentDictionary<string, object?>>(File.ReadAllText(_settingsFilePath)) ?? new()
                : new();
        }
        catch (Exception ex) when (ex is IOException or JsonException or UnauthorizedAccessException)
        {
            _logger?.LogWarning(ex, "Could not read settings from {Path}; starting from an empty store.", _settingsFilePath);
            return new();
        }
    }

    public T? GetValue<T>(string key, T? defaultValue = default)
    {
        if (!_data.Value.TryGetValue(key, out var value))
            return defaultValue ?? default;

        if (value is JsonElement element)
            return element.Deserialize<T>();

        return (T?)value;
    }

    public void SetValue<T>(string key, T value)
    {
        _data.Value[key] = value;
        try
        {
            File.WriteAllText(_settingsFilePath, JsonSerializer.Serialize(_data.Value, new JsonSerializerOptions { WriteIndented = true }));
        }
        catch (Exception ex) when (ex is IOException or UnauthorizedAccessException)
        {
            _logger?.LogWarning(ex, "Could not write settings to {Path}.", _settingsFilePath);
            throw;
        }
    }
}
