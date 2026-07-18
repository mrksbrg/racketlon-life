import type { RankingMatrix } from "../content.js";
import type { Calendar } from "../core/date.js";
import { yearOfWeek } from "../core/date.js";
import type { GameState } from "../core/state.js";
import type { FirResult } from "../model/player.js";
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
 * The FIR best-N counting rules (Ranking Regs 3) applied to an already
 * time-windowed set of results: the best 2 Challenger/Satellite results,
 * plus the best 8 of everything else, capped at 1 World Championships and 3
 * Super World Tour results. Shared by the rolling-24-month World Ranking
 * total ({@link firPointsTotal}) and the calendar-year Tour Race total
 * ({@link firRacePointsTotal}) — only the window differs between the two.
 *
 * The "best 8" selection is greedy (highest points first, skipping a result
 * once its category cap is hit) — optimal enough for a career's handful of
 * events; a fully optimal cap solver is a deferred refinement.
 */
function countedTotal(results: readonly FirResult[]): number {
  const byPoints = (a: FirResult, b: FirResult) => b.points - a.points;

  const bestSatCha = results.filter((r) => isSatCha(r.tier)).sort(byPoints).slice(0, 2);
  const counted = new Set(bestSatCha.map((r) => r.tournamentId));
  let total = bestSatCha.reduce((sum, r) => sum + r.points, 0);

  let picked = 0;
  let wc = 0;
  let swt = 0;
  for (const r of results.filter((x) => !counted.has(x.tournamentId)).sort(byPoints)) {
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

/**
 * The human's counted FIR World Ranking points as of `currentWeek` — a
 * rolling 24-month window (Ranking Regs 3), applying {@link countedTotal}'s
 * best-N rules.
 */
export function firPointsTotal(ledger: readonly FirResult[], currentWeek: number): number {
  const inWindow = ledger.filter((r) => currentWeek - r.weekIndex < RANKING_WINDOW_WEEKS);
  return countedTotal(inWindow);
}

/**
 * A player's World Tour Race points: results from the current calendar year
 * only (an Order-of-Merit view, not the rolling World Ranking window),
 * applying the same best-N counting rules via {@link countedTotal}. Resets
 * to 0 every January, same as the real FIR race. Every player carries their
 * own `firResults` ledger (`Player.firResults`, populated by
 * `tournament/engine.ts`'s `recordEntrantResults` for every entrant of every
 * scheduled tournament, human and NPC alike — see `facade.ts`'s
 * `simulateUnplayedWorldTournaments`), so this is genuinely meaningful for
 * anyone, not human-only.
 */
export function firRacePointsTotal(ledger: readonly FirResult[], cal: Calendar): number {
  const currentYear = yearOfWeek(cal, cal.weekIndex);
  const inSeason = ledger.filter((r) => yearOfWeek(cal, r.weekIndex) === currentYear);
  return countedTotal(inSeason);
}

export interface FirRankingStanding {
  rank: number;
  playerId: string;
  name: string;
  nationality: string;
  points: number;
}

/**
 * A player's rolling-24-month "official" points: their static, real-world
 * `firPoints` snapshot if they have one (an already-established real
 * ranking — never overwritten by in-game results, matching FIR's real
 * ranking staying anchored to a player's actual competitive history), else
 * their own growing total from `firPointsTotal` over their in-game
 * `firResults` ledger — see `Player.firResults`. Null only if neither
 * exists yet (no real-world snapshot *and* no counted in-game result),
 * meaning this player has genuinely never appeared on any ranking.
 *
 * This fallback is what lets a purely fictional player (never real-world
 * ranked, `firPoints: null` from birth — see `world/factory.ts`) climb onto
 * the World Ranking the same way a human career does, once they've actually
 * won FIR ranking points in-game (`tournament/engine.ts`'s
 * `recordEntrantResults`, which now runs for every scheduled tournament's
 * whole field, not just sessions the human shares — see `facade.ts`'s
 * `simulateUnplayedWorldTournaments`). Before this, an NPC's in-game
 * tournament wins were structurally invisible on this ladder — they'd earn
 * `firResults` entries but never surface here, since only `p.firPoints` was
 * ever read for anyone but the human.
 */
function officialPointsFor(player: { firPoints: number | null; firResults: readonly FirResult[] }, currentWeek: number): number | null {
  if (player.firPoints !== null) return player.firPoints;
  return player.firResults.length === 0 ? null : firPointsTotal(player.firResults, currentWeek);
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
 * Every player's points come from `officialPointsFor` — a real-world
 * snapshot if they have one, else their own earned ledger total (human and
 * NPC alike) — and a player is omitted entirely only if neither exists,
 * same as any other player with no result on file. Deterministic tie-break
 * on id, matching `glickoRanking`'s and `divisionAssignments`' convention.
 */
export function firWorldRanking(state: GameState, gender: "m" | "f"): FirRankingStanding[] {
  const week = state.calendar.weekIndex;

  return state.players
    .filter((p) => p.identity.gender === gender)
    .map((p) => ({
      playerId: p.identity.id,
      name: fullName(p),
      nationality: p.identity.nationality,
      points: officialPointsFor(p, week),
    }))
    .filter((row): row is { playerId: string; name: string; nationality: string; points: number } => row.points !== null)
    .sort((a, b) => b.points - a.points || (a.playerId < b.playerId ? -1 : 1))
    .map((row, i) => ({ rank: i + 1, ...row }));
}

/**
 * Publishes every player's queued FIR ranking points (`Player.pendingFirResults`
 * — populated the instant a tournament concludes, see `tournament/engine.ts`'s
 * `recordEntrantResults`) into their real ledger (`Player.firResults`), which
 * `officialPointsFor`/`firWorldRanking`/`firPointsTotal`/`firRacePointsTotal`
 * all read. Called exactly once per calendar-month crossing, from
 * `orchestrator.ts`'s `simulateWeek` — real FIR points aren't live the moment
 * a tournament ends; the federation batches a month's worth of results and
 * publishes them together on the 1st of the next month. Glicko ratings have
 * no such delay (`recordEntrantResults` applies those immediately) — only
 * the official points wait.
 */
export function publishPendingFirResults(state: GameState): void {
  for (const p of state.players) {
    if (p.pendingFirResults.length === 0) continue;
    p.firResults.push(...p.pendingFirResults);
    p.pendingFirResults = [];
  }
}
