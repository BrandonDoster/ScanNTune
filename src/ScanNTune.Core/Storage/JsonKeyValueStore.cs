using System.Collections.Concurrent;
using System.Text.Json;

namespace ScanNTune.Core.Storage;

public interface IKeyValueStore
{
    T? GetValue<T>(string key, T? defaultValue = default);

    void SetValue<T>(string key, T value);
}

/// <summary>
/// A tiny JSON-backed key/value store: one <c>Settings.json</c> under the given directory, loaded lazily and
/// rewritten on every set. IO or deserialize faults propagate to the caller (e.g. <see cref="Updates.UpdateCheck"/>),
/// whose try/catch logs and recovers.
/// </summary>
public sealed class JsonKeyValueStore : IKeyValueStore
{
    private readonly Lazy<ConcurrentDictionary<string, object?>> _data;
    private readonly string _directoryPath;
    private readonly string _settingsFilePath;

    public JsonKeyValueStore(string path)
    {
        _directoryPath = path;
        _settingsFilePath = Path.Combine(_directoryPath, "Settings.json");
        _data = new Lazy<ConcurrentDictionary<string, object?>>(ValueFactory);
    }

    private ConcurrentDictionary<string, object?> ValueFactory()
    {
        if (!Directory.Exists(_directoryPath))
            Directory.CreateDirectory(_directoryPath);

        return File.Exists(_settingsFilePath)
            ? JsonSerializer.Deserialize<ConcurrentDictionary<string, object?>>(File.ReadAllText(_settingsFilePath)) ?? new()
            : new();
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
        File.WriteAllText(_settingsFilePath, JsonSerializer.Serialize(_data.Value, new JsonSerializerOptions { WriteIndented = true }));
    }
}
