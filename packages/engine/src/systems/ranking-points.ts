import type { RankingMatrix } from "../content.js";
import type { FirResult, GameState } from "../core/state.js";
import { fullName } from "../model/player.js";

/**
 * FIR ranking points: looking up placement points from the Points Matrix
 * (Ranking Regs Annex A) and rolling a player's counted total per the FIR
 * best-N rules. These are the real "FIR ranking points" — distinct from the
 * per-sport Glicko strength estimate in ranking.ts.
 */

/** Minimum participants for a class to award any FIR points (Ranking Regs 4.2
 * / Players & Draws 3.6 — a 2-player draw awards none). */
export const MIN_RANKING_PARTICIPANTS = 3;

/** Rolling ranking window — the FIR World Ranking counts the previous 24
 * calendar months (Ranking Regs 3). One game week ≈ one real week. */
export const RANKING_WINDOW_WEEKS = 104;

/**
 * Points for a finishing position in a class, from the Ranking Matrix. Returns
 * 0 when the class had fewer than {@link MIN_RANKING_PARTICIPANTS} players.
 * Finishing positions beyond the table clamp to its last row (the published
 * "49+" entry). Throws if the tier or class is missing from the matrix — a
 * content-authoring gap, surfaced loudly rather than as a silent zero.
 */
export function rankingPointsFor(
  tier: string,
  division: string,
  finishingPosition: number,
  participantCount: number,
  matrix: RankingMatrix,
): number {
  if (participantCount < MIN_RANKING_PARTICIPANTS) return 0;
  const byClass = matrix[tier];
  if (!byClass) throw new Error(`No ranking matrix for tier "${tier}"`);
  const points = byClass[division];
  if (!points || points.length === 0) {
    throw new Error(`No ranking matrix for tier "${tier}" class "${division}"`);
  }
  const idx = Math.min(Math.max(Math.trunc(finishingPosition), 1), points.length) - 1;
  return points[idx]!;
}

const isSatCha = (tier: string): boolean => tier === "SAT" || tier === "CHA";
// World Tour Finals is scored on the WC column (see ranking-matrix.json), so it
// shares the WC per-category cap here too.
const isWc = (tier: string): boolean => tier === "World Championships" || tier === "World Tour Finals";

/**
 * The human's counted FIR World Ranking points as of `currentWeek`, applying
 * the FIR best-N counting rules (Ranking Regs 3) over the 24-month window:
 * the best 2 Challenger/Satellite results, plus the best 8 of everything else,
 * capped at 1 World Championships and 3 Super World Tour results.
 *
 * The "best 8" selection is greedy (highest points first, skipping a result
 * once its category cap is hit) — optimal enough for a career's handful of
 * events; a fully optimal cap solver is a deferred refinement.
 */
export function firPointsTotal(ledger: readonly FirResult[], currentWeek: number): number {
  const inWindow = ledger.filter((r) => currentWeek - r.weekIndex < RANKING_WINDOW_WEEKS);
  const byPoints = (a: FirResult, b: FirResult) => b.points - a.points;

  const bestSatCha = inWindow.filter((r) => isSatCha(r.tier)).sort(byPoints).slice(0, 2);
  const counted = new Set(bestSatCha.map((r) => r.tournamentId));
  let total = bestSatCha.reduce((sum, r) => sum + r.points, 0);

  let picked = 0;
  let wc = 0;
  let swt = 0;
  for (const r of inWindow.filter((x) => !counted.has(x.tournamentId)).sort(byPoints)) {
    if (picked >= 8) break;
    if (isWc(r.tier) && wc >= 1) continue;
    if (r.tier === "SWT" && swt >= 3) continue;
    if (isWc(r.tier)) wc++;
    else if (r.tier === "SWT") swt++;
    picked++;
    total += r.points;
  }
  return total;
}

export interface FirRankingStanding {
  rank: number;
  playerId: string;
  name: string;
  nationality: string;
  points: number;
}

/**
 * The real FIR World Ranking — every player of the given gender who has a
 * counted result, ordered by points, best first. FIR keeps entirely separate
 * men's and women's rankings (never a combined list — see
 * `systems/inbox.ts`'s digest), same as division/category placement already
 * splits by gender (`systems/division.ts`, `projectedField`). This is the
 * ladder official FIR communications and category placement are always
 * based on; Glicko (`systems/ranking.ts`'s `glickoRanking`) is a separate,
 * unofficial "how strong are they" estimate used to describe players, never
 * to rank them.
 *
 * NPCs use their static, real-world `firPoints` snapshot; the human uses
 * their own growing total (`firPointsTotal` over `career.firResults`), or is
 * omitted entirely if they haven't played a single counted tournament yet —
 * same as any other player with no result on file. Deterministic tie-break
 * on id, matching `glickoRanking`'s and `divisionAssignments`' convention.
 */
export function firWorldRanking(state: GameState, gender: "m" | "f"): FirRankingStanding[] {
  const humanId = state.career.playerId;
  const humanPoints = state.career.firResults.length === 0 ? null : firPointsTotal(state.career.firResults, state.calendar.weekIndex);

  return state.players
    .filter((p) => p.identity.gender === gender)
    .map((p) => ({
      playerId: p.identity.id,
      name: fullName(p),
      nationality: p.identity.nationality,
      points: p.identity.id === humanId ? humanPoints : p.firPoints,
    }))
    .filter((row): row is { playerId: string; name: string; nationality: string; points: number } => row.points !== null)
    .sort((a, b) => b.points - a.points || (a.playerId < b.playerId ? -1 : 1))
    .map((row, i) => ({ rank: i + 1, ...row }));
}
