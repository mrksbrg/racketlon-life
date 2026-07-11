/**
 * Assigns players to a tournament tier's skill divisions (A/B/C/D) by
 * percentile rank on real FIR ranking points — see content.ts's
 * `RealPlayerDef.firPoints` and BALANCE.division.byTier.
 *
 * Rule: partition into {has real FIR points} / {null}. **All** null players
 * go to the tier's single lowest division, unconditionally — this is the
 * only reading that matches "unranked defaults to the lowest division"
 * given the real dataset's ~50% null rate for men (a plain whole-population
 * percentile would let nulls leak into multiple bands). The ranked-only
 * subset splits as evenly as possible across the *remaining* bands, best
 * division first, ordered by points descending with a deterministic id
 * tie-break (matching `firWorldRanking()`'s convention).
 *
 * Pure and decoupled from `GameState`/`Player` so it's directly testable
 * against `defaultContent.players`, and cheap to call once per lookup
 * (O(n log n) — batch it rather than resolving one player at a time).
 */
export function divisionAssignments(
  players: readonly { id: string; firPoints: number | null }[],
  tierDivisions: readonly string[],
): Map<string, string> {
  if (tierDivisions.length === 0) throw new Error("divisionAssignments: tierDivisions must be non-empty");
  const lowest = tierDivisions[tierDivisions.length - 1]!;
  const result = new Map<string, string>();

  const ranked = players
    .filter((p): p is { id: string; firPoints: number } => p.firPoints !== null)
    .sort((a, b) => b.firPoints - a.firPoints || (a.id < b.id ? -1 : 1));

  for (const p of players) {
    if (p.firPoints === null) result.set(p.id, lowest);
  }

  const remainingBands = tierDivisions.length - 1; // divisions available to ranked players
  if (remainingBands <= 0) {
    // single-division tier — ranked players share the same (only) division
    for (const p of ranked) result.set(p.id, tierDivisions[0]!);
    return result;
  }

  ranked.forEach((p, i) => {
    const bandIndex = Math.min(Math.floor((i * remainingBands) / ranked.length), remainingBands - 1);
    result.set(p.id, tierDivisions[bandIndex]!);
  });

  return result;
}

/** Convenience for a single lookup once you already have the population's
 * full assignment map — most callers should compute `divisionAssignments`
 * once and read from the map directly instead. */
export function divisionOf(assignments: ReadonlyMap<string, string>, playerId: string): string {
  const division = assignments.get(playerId);
  if (!division) throw new Error(`No division assignment for player ${playerId}`);
  return division;
}
