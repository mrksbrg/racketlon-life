import { BALANCE } from "../balance.js";
import type { ContentBundle } from "../content.js";
import { ageOn, weekIndexForDate } from "../core/date.js";
import type { EventLog } from "../core/events.js";
import { Rng, childSeed } from "../core/rng.js";
import type { GameState } from "../core/state.js";
import { getPlayer } from "../core/state.js";
import type { Player, Ratings } from "../model/player.js";
import type { MatchState } from "../match/engine.js";
import {
  aiChooseTactic,
  createMatch,
  matchRefFromPlayer,
  playPoint,
  resumeMatch,
  setTactic,
} from "../match/engine.js";
import type { RatingResultsBook } from "../systems/ranking.js";
import { applyTournamentRatings, cloneRatings, combinedRating, recordMatchResults } from "../systems/ranking.js";
import { travelCost } from "../systems/travel.js";

/**
 * Single-elimination tournament: entry, seeding, and round-by-round
 * progression. AI-vs-AI matches auto-resolve instantly; the human's own
 * matches are handed back to the UI to play interactively (reusing the
 * regular Match screen), one round at a time, with energy carrying over
 * between rounds — a tournament day is a stamina arc, not isolated matches.
 *
 * A `TournamentSession` is deliberately NOT part of GameState — it's
 * ephemeral, held by the `Game` facade for the duration of the event.
 * Only its permanent effects (entry fee, prize money, fatigue, EventLog
 * entries) are written into GameState. Reloading mid-tournament simply
 * restarts that week fresh, since nothing autosaves until the week
 * concludes — a deliberate M1 simplification.
 */

export type FieldSize = 8 | 16 | 32 | 64;

export interface TournamentDef {
  id: string;
  name: string;
  /** host city, for display and TravelSystem distance */
  city: string;
  /** ISO 3166-1 alpha-2 host country/territory */
  country: string;
  /** host city coordinates — TravelSystem's distance input */
  lat: number;
  lon: number;
  /** tour tier badge, e.g. "SAT" | "CHA" | "IWT" | "SWT" | "World Championships" */
  tier: string;
  /** ISO date (YYYY-MM-DD) the event starts — placed on the game's week grid
   * via `weekIndexForDate`; each real event happens exactly once */
  date: string;
  /** trip length — TravelSystem's hotel/food cost input */
  nights: number;
  entryFee: number;
  /** per-gender draw size — men's and women's fields are always this same
   * size, seeded and played as separate brackets; see `projectedField` */
  fieldSize: FieldSize;
  /** prize money indexed by rounds won: 0 = lost round 1 … last = won it all */
  prizeByRoundsWon: number[];
}

/**
 * Standard single-elimination seed placement, so top seeds meet as late as
 * possible — the textbook recursive "reflection" method: start with [1, 2],
 * then each doubling pairs every existing seed `s` with `size + 1 - s`.
 * Verified to reproduce the well-known 4/8/16-player orders (1v8/4v5/2v7/3v6
 * at 8, etc.) exactly, and extends the same way to 32/64.
 */
function standardSeedOrder(size: FieldSize): number[] {
  let order = [1, 2];
  while (order.length < size) {
    const next = order.length * 2;
    order = order.flatMap((seed) => [seed, next + 1 - seed]);
  }
  return order;
}

export interface TournamentSession {
  def: TournamentDef;
  weekIndex: number;
  seed: string;
  humanId: string;
  /** entrant ids in fixed bracket-position order, seeded once at entry */
  bracketBySeed: string[];
  currentRound: number; // 0-indexed
  /** winners advancing out of each round, in bracket order; human's own
   * slot is filled in once their match concludes */
  roundWinners: string[][];
  pendingMatch: MatchState | null;
  pendingPairIndex: number | null;
  /** energy the human carries into their next match (recovers a little between rounds) */
  humanEnergyCarry: number;
  cumulativeEnergySpent: number;
  roundsWon: number;
  totalRounds: number;
  /** entrants' ratings as of tournament entry — the Glicko-2 rating period's
   * fixed opponent snapshot, so results earlier in the draw can't bleed into
   * later ones within the same period */
  ratingsSnapshot: ReadonlyMap<string, Ratings>;
  /** every decisive set result recorded so far this tournament, applied to
   * ratings once the event concludes */
  resultsBook: RatingResultsBook;
}

export type TournamentAdvanceResult =
  | { status: "nextRound"; match: MatchState; round: number; totalRounds: number }
  | { status: "eliminated"; roundsWon: number; totalRounds: number; prizeMoney: number }
  | { status: "won"; totalRounds: number; prizeMoney: number };

/**
 * Every content tournament placed on the game's week grid, keyed by the
 * `weekIndex` its real-world `date` falls into. Real events don't recur —
 * each `TournamentDef` occupies exactly one week — so this is a direct
 * lookup rather than an arithmetic recurrence rule.
 */
export function tournamentCalendar(content: ContentBundle): Map<number, TournamentDef> {
  const map = new Map<number, TournamentDef>();
  for (const def of Object.values(content.tournaments)) {
    map.set(weekIndexForDate(def.date), def);
  }
  return map;
}

export function tournamentForWeek(content: ContentBundle, weekIndex: number): TournamentDef | null {
  return tournamentCalendar(content).get(weekIndex) ?? null;
}

export function isTournamentWeek(content: ContentBundle, weekIndex: number): boolean {
  return tournamentCalendar(content).has(weekIndex);
}

/** Resolves one match fully via AI tactics on both sides — for AI-vs-AI pairs. */
export function simulateMatchAuto(m: MatchState): void {
  let guard = 0;
  while (m.phase !== "finished" && ++guard < 2000) {
    if (m.phase === "break") {
      setTactic(m, "a", aiChooseTactic(m, "a"));
      setTactic(m, "b", aiChooseTactic(m, "b"));
      resumeMatch(m);
    } else {
      playPoint(m);
    }
  }
}

/**
 * Deterministically projects which tier-1 NPCs would fill a given week's
 * tournament field — independent of whether the human ultimately enters.
 * Lets the Tour screen show "who's entered" ahead of the tournament actually
 * happening, and is what `pickEntrants` uses once the human does enter, so
 * the preview and the real bracket are guaranteed to agree.
 *
 * Draws are gender-separated — never mixed — so the pool is filtered to the
 * human's own gender before sampling. Men's and women's fields are always
 * the same size (`def.fieldSize`); only the human's own draw is ever
 * generated, since nothing in the game currently depends on the other one.
 */
export function projectedField(state: GameState, def: TournamentDef, weekIndex: number): Player[] {
  const rng = new Rng(childSeed(state.seed, "tournament", weekIndex, def.id));
  const human = getPlayer(state, state.career.playerId);
  const pool = state.players.filter((p) => p.simTier === 1 && p.identity.gender === human.identity.gender);
  const needed = def.fieldSize - 1;
  if (pool.length < needed) {
    throw new Error(
      `Not enough tier-1 ${human.identity.gender} players (${pool.length}) for a ${def.fieldSize}-player draw`,
    );
  }
  const shuffled = [...pool];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = rng.int(i + 1);
    [shuffled[i], shuffled[j]] = [shuffled[j]!, shuffled[i]!];
  }
  return shuffled.slice(0, needed);
}

function pickEntrants(state: GameState, def: TournamentDef, weekIndex: number): Player[] {
  const human = getPlayer(state, state.career.playerId);
  return [human, ...projectedField(state, def, weekIndex)];
}

/** Seeds entrants by Glicko rating (what a real seeding committee would see,
 * not hidden true skill) into fixed bracket positions. */
export function seedBracket(entrants: Player[], fieldSize: FieldSize): string[] {
  const order = standardSeedOrder(fieldSize);
  const sorted = [...entrants].sort((a, b) => combinedRating(b) - combinedRating(a));
  const bySeed = new Map<number, string>();
  sorted.forEach((p, i) => bySeed.set(i + 1, p.identity.id));
  return order.map((seed) => bySeed.get(seed)!);
}

function roundPairs(participants: string[]): Array<[string, string]> {
  const pairs: Array<[string, string]> = [];
  for (let i = 0; i < participants.length; i += 2) {
    pairs.push([participants[i]!, participants[i + 1]!]);
  }
  return pairs;
}

/** Resolves every pair in the current round except the human's, which
 * becomes the session's pendingMatch for the UI to play interactively. */
function resolveRound(state: GameState, session: TournamentSession): void {
  const round = session.currentRound;
  const participants = round === 0 ? session.bracketBySeed : session.roundWinners[round - 1]!;
  const pairs = roundPairs(participants);
  const winners: (string | null)[] = new Array(pairs.length).fill(null);
  const ref = (player: Player) =>
    matchRefFromPlayer(player, ageOn(state.calendar.mondayISO, player.identity.birthDate));

  pairs.forEach(([a, b], i) => {
    if (a === session.humanId || b === session.humanId) {
      const human = getPlayer(state, session.humanId);
      const opponent = getPlayer(state, a === session.humanId ? b : a);
      const seed = childSeed(session.seed, "round", round, i);
      const m = createMatch(ref(human), ref(opponent), seed);
      m.energy.a = session.humanEnergyCarry;
      session.pendingMatch = m;
      session.pendingPairIndex = i;
    } else {
      const pa = getPlayer(state, a);
      const pb = getPlayer(state, b);
      const seed = childSeed(session.seed, "round", round, i);
      const m = createMatch(ref(pa), ref(pb), seed);
      simulateMatchAuto(m);
      recordMatchResults(session.resultsBook, m);
      winners[i] = m.winner === "a" ? a : b;
    }
  });

  session.roundWinners[round] = winners as string[];
}

/**
 * Deducts the entry fee plus travel cost (flights + hotel/food, `systems/travel.ts`),
 * seeds the bracket, and resolves round 1 — the human's first match comes
 * back as `session.pendingMatch`. Only ever called once the facade has
 * confirmed the human registered for this week's tournament at least
 * `entryDeadlineWeeks` in advance — consumes (removes) that registration
 * here, since it's now being acted on rather than pending.
 */
export function startTournament(
  state: GameState,
  def: TournamentDef,
  content: ContentBundle,
  log: EventLog,
): TournamentSession {
  const human = getPlayer(state, state.career.playerId);
  const travel = travelCost(human.identity.nationality, def, content);
  state.career.money -= def.entryFee + travel.total;
  const week = state.calendar.weekIndex;
  const entryIdx = state.career.tournamentEntries.findIndex(
    (e) => e.weekIndex === week && e.tournamentId === def.id,
  );
  if (entryIdx !== -1) state.career.tournamentEntries.splice(entryIdx, 1);

  const rngSeed = childSeed(state.seed, "tournament", week, def.id);
  const entrants = pickEntrants(state, def, week);
  const bracketBySeed = seedBracket(entrants, def.fieldSize);
  const totalRounds = Math.log2(def.fieldSize);

  log.push({
    week,
    type: "tournament.entered",
    subject: state.career.playerId,
    data: { name: def.name, entryFee: def.entryFee, travelCost: travel.total },
  });

  const session: TournamentSession = {
    def,
    weekIndex: week,
    seed: rngSeed,
    humanId: state.career.playerId,
    bracketBySeed,
    currentRound: 0,
    roundWinners: [],
    pendingMatch: null,
    pendingPairIndex: null,
    humanEnergyCarry: 100,
    cumulativeEnergySpent: 0,
    roundsWon: 0,
    totalRounds,
    ratingsSnapshot: new Map(entrants.map((p) => [p.identity.id, cloneRatings(p.ratings)])),
    resultsBook: new Map(),
  };

  resolveRound(state, session);
  return session;
}

function concludeTournament(
  state: GameState,
  session: TournamentSession,
  log: EventLog,
  roundsWon: number,
): TournamentAdvanceResult {
  const prize = session.def.prizeByRoundsWon[roundsWon] ?? 0;
  state.career.money += prize;
  const human = getPlayer(state, session.humanId);
  const fatigueGain = session.cumulativeEnergySpent * BALANCE.tournament.fatigueConversionFactor;
  human.condition.fatigue = Math.min(100, human.condition.fatigue + fatigueGain);

  const won = roundsWon === session.totalRounds;
  log.push({
    week: session.weekIndex,
    type: won ? "tournament.won" : "tournament.eliminated",
    subject: session.humanId,
    data: { name: session.def.name, roundsWon, totalRounds: session.totalRounds, prizeMoney: prize },
  });

  applyTournamentRatings(
    state,
    session.resultsBook,
    session.ratingsSnapshot,
    session.humanId,
    session.weekIndex,
    log,
  );

  return won
    ? { status: "won", totalRounds: session.totalRounds, prizeMoney: prize }
    : { status: "eliminated", roundsWon, totalRounds: session.totalRounds, prizeMoney: prize };
}

/**
 * Advances the bracket once the human's current match has concluded. Takes
 * the finished MatchState directly (rather than trusting the session's own
 * stored reference) so it works regardless of how the UI's reactive layer
 * wraps that object.
 */
export function advanceTournament(
  state: GameState,
  session: TournamentSession,
  finishedMatch: MatchState,
  log: EventLog,
): TournamentAdvanceResult {
  if (finishedMatch.phase !== "finished") {
    throw new Error("Cannot advance a tournament round before its match is finished");
  }
  const humanWon = finishedMatch.winner === "a";
  const spent = session.humanEnergyCarry - finishedMatch.energy.a;
  session.cumulativeEnergySpent += Math.max(0, spent);
  recordMatchResults(session.resultsBook, finishedMatch);
  session.roundWinners[session.currentRound]![session.pendingPairIndex!] = humanWon
    ? session.humanId
    : finishedMatch.players.b.id;
  session.pendingMatch = null;
  session.pendingPairIndex = null;

  if (!humanWon) {
    return concludeTournament(state, session, log, session.roundsWon);
  }

  session.roundsWon += 1;
  session.humanEnergyCarry = Math.min(
    100,
    finishedMatch.energy.a + BALANCE.tournament.energyRecoveryBetweenRounds,
  );

  if (session.roundsWon === session.totalRounds) {
    return concludeTournament(state, session, log, session.roundsWon);
  }

  session.currentRound += 1;
  resolveRound(state, session);
  return {
    status: "nextRound",
    match: session.pendingMatch!,
    round: session.currentRound,
    totalRounds: session.totalRounds,
  };
}
