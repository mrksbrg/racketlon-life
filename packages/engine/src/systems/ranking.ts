import { BALANCE } from "../balance.js";
import type { EventLog } from "../core/events.js";
import type { GameState } from "../core/state.js";
import { getPlayer } from "../core/state.js";
import type { MatchState } from "../match/engine.js";
import type { Player, Ratings } from "../model/player.js";
import { fullName } from "../model/player.js";
import type { Sport } from "../model/sport.js";
import { SPORTS } from "../model/sport.js";
import { glicko2Update } from "./glicko.js";

/**
 * Turns tournament results into Glicko-2 rating updates. Each of the four
 * sets in a match is its own per-sport contest, so a single racketlon match
 * produces up to four independent Glicko results (one per sport) rather than
 * one blended "match result" — matching `Ratings` being per-sport.
 *
 * Updates are batched per tournament (one Glicko-2 "rating period"): every
 * set a player contested during the event is collected into a
 * `RatingResultsBook`, then applied once at the end against opponents'
 * *pre-tournament* ratings (captured in a snapshot at entry). This is the
 * spec-correct way to run Glicko-2 across multiple games in a period — an
 * incremental per-match update would let an early opponent's rating drift
 * mid-tournament and contaminate later results in the same period.
 */

export function combinedRating(player: Player): number {
  return SPORTS.reduce((sum, s) => sum + player.ratings[s].rating, 0) / SPORTS.length;
}

export interface GlickoStanding {
  rank: number;
  playerId: string;
  name: string;
  nationality: string;
  /** combined Glicko-2 rating, rounded */
  rating: number;
}

/**
 * The whole population ranked by combined Glicko-2 rating, best first — a
 * strength *estimate* ladder, NOT the FIR World Ranking. This is deliberately
 * not called anything with "ranking" or "world" in isolation: official FIR
 * standings and category placement are always based on real FIR points
 * (`systems/ranking-points.ts`'s `firWorldRanking`), never on this. Glicko
 * describes a player's relative strength (what opponent lists and the Me
 * screen show); it never determines who's actually "ranked" or which
 * division someone plays in. Deterministic tie-break on id so equal ratings
 * never reshuffle. Currently unused in-engine (kept as a general-purpose
 * strength ladder for future flavor UI, e.g. a "form guide").
 */
export function glickoRanking(state: GameState): GlickoStanding[] {
  return state.players
    .map((p) => ({
      playerId: p.identity.id,
      name: fullName(p),
      nationality: p.identity.nationality,
      rating: Math.round(combinedRating(p)),
    }))
    .sort((a, b) => b.rating - a.rating || (a.playerId < b.playerId ? -1 : 1))
    .map((row, i) => ({ rank: i + 1, ...row }));
}

export function cloneRatings(ratings: Ratings): Ratings {
  return {
    tt: { ...ratings.tt },
    bd: { ...ratings.bd },
    sq: { ...ratings.sq },
    tn: { ...ratings.tn },
  };
}

interface RatingResultEntry {
  opponentId: string;
  score: 0 | 0.5 | 1;
}

/** playerId → sport → every set result that player contested this period. */
export type RatingResultsBook = Map<string, Partial<Record<Sport, RatingResultEntry[]>>>;

function pushResult(book: RatingResultsBook, playerId: string, sport: Sport, opponentId: string, score: 0 | 0.5 | 1): void {
  let bySport = book.get(playerId);
  if (!bySport) {
    bySport = {};
    book.set(playerId, bySport);
  }
  (bySport[sport] ??= []).push({ opponentId, score });
}

/** Records every decisive set from a finished match into the book. Sets with
 * no points played, or tied at the point the match ended early, carry no
 * signal and are skipped. */
export function recordMatchResults(book: RatingResultsBook, m: MatchState): void {
  m.sets.forEach((set, i) => {
    if (set.a === set.b) return;
    const sport = SPORTS[i]!;
    const aWon = set.a > set.b;
    pushResult(book, m.players.a.id, sport, m.players.b.id, aWon ? 1 : 0);
    pushResult(book, m.players.b.id, sport, m.players.a.id, aWon ? 0 : 1);
  });
}

/**
 * Applies one Glicko-2 rating period: every player with entries in `book`
 * gets their per-sport ratings updated from the sets they played, scored
 * against opponents' ratings as of `ratingsSnapshot` (taken at tournament
 * entry). Emits `ranking.moved` for the human's own rating changes only —
 * NPC ratings still update (so future seeding stays meaningful) without
 * adding log noise for players the human never sees details of.
 */
export function applyTournamentRatings(
  state: GameState,
  book: RatingResultsBook,
  ratingsSnapshot: ReadonlyMap<string, Ratings>,
  humanId: string,
  week: number,
  log: EventLog,
): void {
  for (const [playerId, bySport] of book) {
    const player = getPlayer(state, playerId);
    for (const sport of SPORTS) {
      const results = bySport[sport];
      if (!results || results.length === 0) continue;
      const opponents = results.map((r) => {
        const oppRatings = ratingsSnapshot.get(r.opponentId)!;
        return { rating: oppRatings[sport].rating, rd: oppRatings[sport].rd, score: r.score };
      });
      const before = player.ratings[sport];
      const after = glicko2Update(before, opponents, BALANCE.ranking.tau);
      player.ratings[sport] = after;
      if (playerId === humanId) {
        log.push({
          week,
          type: "ranking.moved",
          subject: playerId,
          data: { sport, before: Math.round(before.rating), after: Math.round(after.rating) },
        });
      }
    }
  }
}
