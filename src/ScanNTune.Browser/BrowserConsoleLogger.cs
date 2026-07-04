using System;
using Microsoft.Extensions.Logging;

namespace ScanNTune.Browser;

/// <summary>
/// A minimal, synchronous <see cref="ILoggerProvider"/> that writes to the browser devtools console via
/// <see cref="Console"/>. The framework console logger spins up a background processing thread, which
/// single-threaded WebAssembly does not support, so we use this instead.
/// </summary>
public sealed class BrowserConsoleLoggerProvider : ILoggerProvider
{
    public ILogger CreateLogger(string categoryName) => new BrowserConsoleLogger(categoryName);

    public void Dispose()
    {
    }

    private sealed class BrowserConsoleLogger : ILogger
    {
        private readonly string _category;

        public BrowserConsoleLogger(string category) => _category = category;

        public IDisposable? BeginScope<TState>(TState state) where TState : notnull => null;

        public bool IsEnabled(LogLevel logLevel) => logLevel >= LogLevel.Information;

        public void Log<TState>(LogLevel logLevel, EventId eventId, TState state, Exception? exception,
            Func<TState, Exception?, string> formatter)
        {
            if (!IsEnabled(logLevel))
                return;
            string message = formatter(state, exception);
            Console.WriteLine(exception is null
                ? $"[{logLevel}] {_category}: {message}"
                : $"[{logLevel}] {_category}: {message} {exception.GetType().Name}: {exception.Message}");
        }
    }
}
