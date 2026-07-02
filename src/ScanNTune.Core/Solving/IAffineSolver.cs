namespace ScanNTune.Core.Solving;

/// <summary>Least-squares fit of the nominal-mm → measured-px affine map.</summary>
public interface IAffineSolver
{
    AffineModel Solve(IReadOnlyList<GridCorrespondence> correspondences);
}
