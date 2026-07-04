using ScanNTune.Core.Storage;

namespace ScanNTune.Tests;

[TestFixture]
public class JsonKeyValueStoreTests
{
    private string _tempDir = null!;
    private string _settingsFile = null!;

    [SetUp]
    public void Setup()
    {
        _tempDir = Path.Combine(Path.GetTempPath(), "ScanNTuneTest_" + Guid.NewGuid());
        _settingsFile = Path.Combine(_tempDir, "Settings.json");
    }

    [TearDown]
    public void Teardown()
    {
        if (Directory.Exists(_tempDir))
            Directory.Delete(_tempDir, true);
    }

    [Test]
    public void GetValue_KeyIsMissing_ReturnsDefault()
    {
        var key = Guid.NewGuid().ToString();
        var store = new JsonKeyValueStore(_tempDir);
        var value = store.GetValue(key, 42);
        Assert.That(value, Is.EqualTo(42));
    }

    [Test]
    public void SetValue_SavesValue_And_GetValue_LoadsIt()
    {
        var store = new JsonKeyValueStore(_tempDir);

        var key = Guid.NewGuid().ToString();
        store.SetValue(key, "value");

        var loaded = store.GetValue<string>(key);

        Assert.That(loaded, Is.EqualTo("value"));
        Assert.That(File.Exists(_settingsFile), Is.True);
    }

    [Test]
    public void Values_PersistAcrossInstances()
    {
        var key = Guid.NewGuid().ToString();

        var store1 = new JsonKeyValueStore(_tempDir);
        store1.SetValue(key, 5);

        var store2 = new JsonKeyValueStore(_tempDir);
        var loaded = store2.GetValue<int>(key);

        Assert.That(loaded, Is.EqualTo(5));
    }

    [Test]
    public void SetValue_OverwritesExistingValue()
    {
        var store = new JsonKeyValueStore(_tempDir);
        var key = Guid.NewGuid().ToString();

        store.SetValue(key, 10);
        store.SetValue(key, 20);

        var loaded = store.GetValue<int>(key);
        Assert.That(loaded, Is.EqualTo(20));
    }
}
