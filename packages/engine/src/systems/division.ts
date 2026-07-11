/** A specific event's host-nation wildcard allowance for its top division —
 * see `divisionAssignments`' doc comment and FIR Tournament Regs 3.8.5. */
export interface HostWildcards {
  hostCountry: string;
  /** how many near-cutoff domestic players get promoted into the top division */
  count: number;
}

/**
 * Assigns players to a tournament tier's skill divisions (A/B/C/D) — see
 * BALANCE.division.byTier.
 *
 * Real FIR ranking points (content.ts's `RealPlayerDef.firPoints`) are the
 * primary, authoritative signal when a player has them: FIR ranking regs
 * place you by your official standing, not by anyone's private skill
 * estimate. But roughly half the real roster has never played a
 * FIR-counted result yet (`firPoints: null`) — that's a data-completeness
 * gap, not a strength signal: the imported dataset shows unranked players
 * average the *same* skill as ranked ones. Dumping all of them into the
 * single lowest division regardless of strength is exactly the "strong
 * player sandbagging the bottom bracket" problem real anti-sandbagging
 * rules exist to prevent.
 *
 * So: the two populations are percentile-banded *independently*, each
 * across the tier's full division range, then merged — ranked players by
 * points descending, unranked players by their in-game skill estimate
 * (`skill`, i.e. `combinedRating`) descending, both with a deterministic id
 * tie-break. A genuinely new/weak unranked player still lands in the
 * lowest band on their own merits; a strong-but-unranked one now reaches A
 * like a ranked player of equivalent strength would.
 *
 * `hostWildcards`, when given, models FIR Tournament Regs 3.8.5: "Players
 * can be offered a wildcard, to enter the Elite draw although they have a
 * lower ranking than the Cut-Off or no world ranking at all. Half of the
 * wildcards are offered by the Tournament Director" — in practice a TD
 * favors strong players from their own country. This promotes up to
 * `count` of the strongest domestic players who *just* missed the top
 * division (from both the ranked and unranked pools) into it, for this
 * event only — it never touches the underlying `firPoints`/`skill` values,
 * so it doesn't distort any other event's or the FIR World Ranking's view
 * of the player.
 *
 * Pure and decoupled from `GameState`/`Player` so it's directly testable
 * against `defaultContent.players`, and cheap to call once per lookup
 * (O(n log n) — batch it rather than resolving one player at a time).
 */
export function divisionAssignments(
  players: readonly { id: string; firPoints: number | null; skill: number; nationality?: string }[],
  tierDivisions: readonly string[],
  hostWildcards?: HostWildcards,
): Map<string, string> {
  if (tierDivisions.length === 0) throw new Error("divisionAssignments: tierDivisions must be non-empty");
  const result = new Map<string, string>();

  const ranked = players
    .filter((p): p is { id: string; firPoints: number; skill: number; nationality?: string } => p.firPoints !== null)
    .sort((a, b) => b.firPoints - a.firPoints || (a.id < b.id ? -1 : 1));
  const unranked = players
    .filter((p) => p.firPoints === null)
    .sort((a, b) => b.skill - a.skill || (a.id < b.id ? -1 : 1));

  bandInto(result, ranked, tierDivisions);
  bandInto(result, unranked, tierDivisions);

  if (hostWildcards && hostWildcards.count > 0) {
    promoteHostWildcards(result, ranked, unranked, tierDivisions[0]!, hostWildcards);
  }

  return result;
}

/**
 * Promotes up to `hostWildcards.count` domestic (nationality === hostCountry)
 * players not already in `topDivision` into it — alternating between the
 * ranked and unranked pools (each already sorted best-first) so the
 * strongest near-cutoff candidate from either pool goes first, matching
 * "half TD, half by merit" rather than exhausting one pool before the other.
 */
function promoteHostWildcards(
  result: Map<string, string>,
  ranked: readonly { id: string; nationality?: string }[],
  unranked: readonly { id: string; nationality?: string }[],
  topDivision: string,
  hostWildcards: HostWildcards,
): void {
  const isCandidate = (p: { id: string; nationality?: string }) =>
    p.nationality === hostWildcards.hostCountry && result.get(p.id) !== topDivision;
  const rankedCandidates = ranked.filter(isCandidate);
  const unrankedCandidates = unranked.filter(isCandidate);

  let budget = hostWildcards.count;
  let ri = 0;
  let ui = 0;
  while (budget > 0 && (ri < rankedCandidates.length || ui < unrankedCandidates.length)) {
    if (ri < rankedCandidates.length) {
      result.set(rankedCandidates[ri]!.id, topDivision);
      ri++;
      budget--;
    }
    if (budget <= 0) break;
    if (ui < unrankedCandidates.length) {
      result.set(unrankedCandidates[ui]!.id, topDivision);
      ui++;
      budget--;
    }
  }
}

/** Splits `sorted` (best first) as evenly as possible across every band in
 * `tierDivisions`, writing each id's band into `result`. */
function bandInto(
  result: Map<string, string>,
  sorted: readonly { id: string }[],
  tierDivisions: readonly string[],
): void {
  if (sorted.length === 0) return;
  const bands = tierDivisions.length;
  sorted.forEach((p, i) => {
    const bandIndex = Math.min(Math.floor((i * bands) / sorted.length), bands - 1);
    result.set(p.id, tierDivisions[bandIndex]!);
  });
}

/** Convenience for a single lookup once you already have the population's
 * full assignment map — most callers should compute `divisionAssignments`
 * once and read from the map directly instead. */
export function divisionOf(assignments: ReadonlyMap<string, string>, playerId: string): string {
  const division = assignments.get(playerId);
  if (!division) throw new Error(`No division assignment for player ${playerId}`);
  return division;
}
