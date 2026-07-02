using System;
using System.Collections.Generic;
using System.Linq;
using System.Text;
using System.Text.Json;
using Nuke.Common;
using Nuke.Common.IO;
using Nuke.Common.Tooling;
using Nuke.Common.Tools.DotNet;
using Serilog;
using static Nuke.Common.Tools.DotNet.DotNetTasks;
using static Nuke.Common.Tools.Git.GitTasks;

class Build : NukeBuild
{
    public static int Main() => Execute<Build>(x => x.Test);

    [Parameter("Configuration to build — default is 'Debug' (local) or 'Release' (server)")]
    readonly string Configuration = IsLocalBuild ? "Debug" : "Release";

    AbsolutePath SourceRoot => RootDirectory / "src";
    AbsolutePath Solution => SourceRoot / "ScanNTune.slnx";
    AbsolutePath TestProject => SourceRoot / "ScanNTune.Tests" / "ScanNTune.Tests.csproj";
    AbsolutePath DesktopProject => SourceRoot / "ScanNTune.App" / "ScanNTune.App.csproj";
    AbsolutePath AppIcon => SourceRoot / "ScanNTune.App" / "Assets" / "ScanNTune.ico";
    AbsolutePath ArtifactsDirectory => RootDirectory / "artifacts";
    AbsolutePath DesktopPublishDirectory => ArtifactsDirectory / "desktop";
    AbsolutePath VelopackDirectory => ArtifactsDirectory / "velopack";

    const string GitHubRepoUrl = "https://github.com/jaak0b/ScanNTune";

    [Parameter("GitHub token for publishing releases. Defaults to the GH_TOKEN or GITHUB_TOKEN environment variable.")]
    readonly string GitHubToken = Environment.GetEnvironmentVariable("GH_TOKEN")
        ?? Environment.GetEnvironmentVariable("GITHUB_TOKEN");

    Target Restore => _ => _
        .Executes(() => DotNetRestore(s => s.SetProjectFile(Solution)));

    Target Compile => _ => _
        .DependsOn(Restore)
        .Executes(() => DotNetBuild(s => s
            .SetProjectFile(Solution)
            .SetConfiguration(Configuration)
            .EnableNoRestore()));

    Target Test => _ => _
        .DependsOn(Compile)
        .Executes(() => DotNetTest(s => s
            .SetProjectFile(TestProject)
            .SetConfiguration(Configuration)
            .EnableNoRestore()
            .EnableNoBuild()));

    Target RunDesktop => _ => _
        .DependsOn(Compile)
        .Executes(() =>
        {
            Assert.True(EnvironmentInfo.IsWin, "RunDesktop targets the Windows desktop head.");
            DotNetRun(s => s
                .SetProjectFile(DesktopProject)
                .SetConfiguration(Configuration)
                .EnableNoRestore());
        });

    Target PublishDesktop => _ => _
        .Description("Publishes the Windows desktop head self-contained (win-x64) for packaging.")
        .Executes(() =>
        {
            DesktopPublishDirectory.CreateOrCleanDirectory();
            DotNetPublish(s => s
                .SetProject(DesktopProject)
                .SetConfiguration("Release")
                .SetRuntime("win-x64")
                .SetSelfContained(true)
                .SetOutput(DesktopPublishDirectory));
        });

    AbsolutePath PortableZip(string version) => ArtifactsDirectory / $"ScanNTune-{version}-win-x64-portable.zip";

    Target PackPortable => _ => _
        .Description("Zips the self-contained desktop publish into a portable, no-install archive.")
        .DependsOn(PublishDesktop)
        .Executes(() =>
        {
            var zip = PortableZip(ReleaseVersion());
            zip.DeleteFile();
            DesktopPublishDirectory.ZipTo(zip);
            Log.Information("Portable zip → {Zip}", zip);
        });

    Target Pack => _ => _
        .Description("Builds the Velopack Windows installer and update feed into artifacts/velopack.")
        .DependsOn(PublishDesktop)
        .Executes(() =>
        {
            VelopackDirectory.CreateOrCleanDirectory();
            var notesFile = WriteReleaseNotes();

            Vpk("pack"
                + " --packId ScanNTune"
                + " --packTitle \"ScanNTune\""
                + " --packAuthors Jakob"
                + $" --packVersion {ReleaseVersion()}"
                + $" --packDir \"{DesktopPublishDirectory}\""
                + " --mainExe ScanNTune.App.exe"
                + $" --icon \"{AppIcon}\""
                + $" --releaseNotes \"{notesFile}\""
                + $" --outputDir \"{VelopackDirectory}\"");

            Log.Information("Velopack output → {Dir}", VelopackDirectory);
        });

    Target Release => _ => _
        .Description("Publishes a GitHub release: the Windows installer + update feed + portable zip, with notes built from PR labels.")
        .DependsOn(Test, Pack, PackPortable)
        .Requires(() => GitHubToken)
        .Executes(() =>
        {
            var version = ReleaseVersion();
            var tag = $"v{version}";
            var releaseName = $"ScanNTune {version}";

            Vpk("upload github"
                + $" --repoUrl {GitHubRepoUrl}"
                + $" --token {GitHubToken}"
                + " --publish"
                + $" --releaseName \"{releaseName}\""
                + $" --tag {tag}"
                + $" --outputDir \"{VelopackDirectory}\"",
                logInvocation: false);

            Gh($"release upload {tag} \"{PortableZip(version)}\" --clobber");

            Log.Information("Released {Tag}: installer + update feed + portable zip", tag);
        });

    void Gh(string arguments)
    {
        var gh = ToolPathResolver.GetPathExecutable("gh");
        ProcessTasks.StartProcess(gh, arguments, RootDirectory, GitHubEnvironment(), logInvocation: false)
            .AssertZeroExitCode();
    }

    void Vpk(string arguments, bool logInvocation = true)
    {
        var dotnet = ToolPathResolver.GetPathExecutable("dotnet");
        ProcessTasks.StartProcess(dotnet, "vpk " + arguments, RootDirectory, logInvocation: logInvocation)
            .AssertZeroExitCode();
    }

    string ReleaseVersion()
    {
        var dotnet = ToolPathResolver.GetPathExecutable("dotnet");
        var process = ProcessTasks.StartProcess(dotnet,
            "nbgv get-version --variable SimpleVersion", RootDirectory, logOutput: false);
        process.AssertZeroExitCode();
        return process.Output
            .Where(o => o.Type == OutputType.Std)
            .Select(o => o.Text.Trim())
            .First(t => t.Length > 0);
    }

    AbsolutePath WriteReleaseNotes()
    {
        var body = NotesFromPullRequests();
        var notesFile = ArtifactsDirectory / "release-notes.md";
        ArtifactsDirectory.CreateDirectory();
        notesFile.WriteAllText(body);
        return notesFile;
    }

    // Release notes come ONLY from the labelled pull requests (via GitHub's generate-notes, driven by
    // .github/release.yml). There is deliberately no commit-message fallback: if generate-notes fails or
    // returns nothing, we throw and cancel the release rather than ship low-quality notes.
    string NotesFromPullRequests()
    {
        // Release .Requires the token; a local Pack without it is a dev build, not a release.
        if (string.IsNullOrEmpty(GitHubToken))
            return "Local build — not an official release.";

        var headSha = GitLines("rev-parse HEAD").FirstOrDefault()?.Trim();
        var previousTag = GitLines("tag --list v* --sort=-version:refname").FirstOrDefault()?.Trim();

        var arguments = new StringBuilder($"api repos/{GitHubRepoSlug}/releases/generate-notes")
            .Append($" -f tag_name=v{ReleaseVersion()}");
        if (!string.IsNullOrEmpty(headSha))
            arguments.Append($" -f target_commitish={headSha}");
        if (!string.IsNullOrEmpty(previousTag))
            arguments.Append($" -f previous_tag_name={previousTag}");

        var gh = ToolPathResolver.GetPathExecutable("gh");
        var process = ProcessTasks.StartProcess(gh, arguments.ToString(), RootDirectory, GitHubEnvironment(), logOutput: false);
        process.AssertZeroExitCode();

        var json = string.Join(Environment.NewLine,
            process.Output.Where(o => o.Type == OutputType.Std).Select(o => o.Text));
        using var document = JsonDocument.Parse(json);
        var body = document.RootElement.GetProperty("body").GetString();
        Assert.True(!string.IsNullOrWhiteSpace(body),
            "GitHub generate-notes returned an empty release body — aborting. Label the user-facing PRs (feature/fix/bug) and retry.");
        return body!.Trim();
    }

    IEnumerable<string> GitLines(string arguments) =>
        Git(arguments, workingDirectory: RootDirectory, logOutput: false)
            .Where(o => o.Type == OutputType.Std)
            .Select(o => o.Text);

    string GitHubRepoSlug => new Uri(GitHubRepoUrl).AbsolutePath.Trim('/');

    IReadOnlyDictionary<string, string> GitHubEnvironment()
    {
        var environment = Environment.GetEnvironmentVariables()
            .Cast<System.Collections.DictionaryEntry>()
            .ToDictionary(entry => (string)entry.Key, entry => (string)entry.Value);
        environment["GH_TOKEN"] = GitHubToken;
        return environment;
    }
}
