using ScanNTune.Core;
using ScanNTune.Core.Grids;

namespace ScanNTune.Tests;

/// <summary>
/// Pins the grid mapper's documented miss tolerance: the two solid marker vertices plus AT MOST one
/// stray missed hole. More strays make the marker search unreliable (a second corner+neighbour pair
/// of misses silently relocates the origin), so they must be a loud rejection, and a stray adjacent
/// to a corner is genuinely ambiguous (two candidate +X directions) and must also reject rather
/// than guess.
/// </summary>
[TestFixture]
public class GridMapperToleranceTests
{
    private const double PitchPx = 100.0;

    private readonly GridMapper _mapper = new();
    private readonly CouponSpec _spec = new();

    [Test]
    public void OneStrayMissedHoleIsTolerated()
    {
        List<DetectedRing> rings = Grid((0, 0), (1, 0), (2, 2));
        GridMapping mapping = _mapper.Map(rings, _spec);
        Assert.That(mapping.Points, Has.Count.EqualTo(22));
    }

    [Test]
    public void TwoStrayMissedHolesAreRejected()
    {
        // Marker + two strays = 4 missing vertices; beyond the documented tolerance the marker
        // identification can silently land on the wrong corner, so this must throw.
        List<DetectedRing> rings = Grid((0, 0), (1, 0), (2, 2), (3, 1));
        Assert.That(() => _mapper.Map(rings, _spec),
            Throws.InvalidOperationException.With.Message.Contains("missing"));
    }

    [Test]
    public void AWholeMissingOuterRowIsRejected()
    {
        // Glare wiping out the last row shrinks the DETECTED extent to 5×4; the miss count must be
        // taken against the specified grid so those five holes still count as missing.
        List<DetectedRing> rings = Grid((0, 0), (1, 0), (0, 4), (1, 4), (2, 4), (3, 4), (4, 4));
        Assert.That(() => _mapper.Map(rings, _spec),
            Throws.InvalidOperationException.With.Message.Contains("missing"));
    }

    [Test]
    public void StrayMissAdjacentToTheMarkerCornerIsRejectedAsAmbiguous()
    {
        // Marker (0,0)+(1,0) plus a stray miss at (0,1): the corner now has two missing
        // neighbours and the +X direction cannot be determined — must reject, not guess.
        List<DetectedRing> rings = Grid((0, 0), (1, 0), (0, 1));
        Assert.That(() => _mapper.Map(rings, _spec),
            Throws.InvalidOperationException.With.Message.Contains("ambiguous"));
    }

    /// <summary>A perfect 5×5 grid of detections at 100 px pitch, minus the given vertices.</summary>
    private List<DetectedRing> Grid(params (int c, int r)[] missing)
    {
        var gone = new HashSet<(int, int)>(missing);
        var rings = new List<DetectedRing>();
        for (int c = 0; c < 5; c++)
        {
            for (int r = 0; r < 5; r++)
            {
                if (gone.Contains((c, r)))
                    continue;
                rings.Add(new DetectedRing(c * PitchPx, r * PitchPx, 20.0, 0.8));
            }
        }
        return rings;
    }
}
