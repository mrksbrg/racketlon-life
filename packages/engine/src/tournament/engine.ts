import { BALANCE } from "../balance.js";
import type { ContentBundle, RankingMatrix } from "../content.js";
import { ageOn, weekIndexForDate } from "../core/date.js";
import type { EventLog } from "../core/events.js";
import { Rng, childSeed } from "../core/rng.js";
import type { GameState } from "../core/state.js";
import { getPlayer } from "../core/state.js";
import type { Player, Ratings } from "../model/player.js";
import { fullName } from "../model/player.js";
import type { MatchState } from "../match/engine.js";
import {
  aiChooseTactic,
  createMatch,
  matchRefFromPlayer,
  playPoint,
  resumeMatch,
  setTactic,
} from "../match/engine.js";
import { divisionAssignments, divisionOf } from "../systems/division.js";
import { staminaRecoveryMult } from "../systems/effects.js";
import { rankingPointsFor } from "../systems/ranking-points.js";
import type { RatingResultsBook } from "../systems/ranking.js";
import { applyTournamentRatings, cloneRatings, combinedRating, recordMatchResults } from "../systems/ranking.js";
import { distanceKm, travelCost } from "../systems/travel.js";

/**
 * Monrad-style placement bracket: a real main draw plus real plate
 * (consolation) matches for anyone eliminated from it, capped so nobody in a
 * losing bracket plays more than 3 games total.
 *
 * The single lineage that has never lost — the "main draw" — always plays on
 * to a genuine final: 1st and 2nd are always decided by an actual match,
 * however many rounds that takes (`log2(fieldSize)`). The moment a player
 * loses for the first time, they drop into a plate lineage and keep getting
 * real matches against fellow losers until they've played 3 games total (or
 * the plate lineage itself shrinks to a single player, whichever comes
 * first). If there's still room for one more real match when it's a plate
 * group's turn, it's played — a genuine decisive result, exactly like a
 * bronze-medal match. Only when the *next* match would be a 4th game does
 * that group stop instead, sharing a tied position band (best position used
 * for ranking points — see `rankingPointsFor`). For an 8-player draw this
 * never actually bites (3 rounds total == the cap), so every entrant still
 * gets a fully distinct place 1..8; bigger draws progressively band deeper
 * losers together the further they are from the final. See `buildNextGroups`
 * for the mechanics and `advanceTournament` for how a player's own result is
 * known the moment their lineage is decided, independent of the rest of the
 * field.
 *
 * AI-vs-AI matches auto-resolve instantly; the human's own match each round
 * is handed back to the UI to play interactively (reusing the regular Match
 * screen), with energy carrying over between rounds — a tournament day is a
 * stamina arc, not isolated matches. Once the human's own lineage is decided,
 * any other still-live groups are silently fast-forwarded (no further UI
 * interaction) purely so NPC ratings stay realistic across the whole field.
 *
 * A `TournamentSession` is deliberately NOT part of GameState — it's
 * ephemeral, held by the `Game` facade for the duration of the event.
 * Only its permanent effects (entry fee, prize money, fatigue, ranking
 * points, EventLog entries) are written into GameState. Reloading
 * mid-tournament simply restarts that week fresh, since nothing autosaves
 * until the week concludes — a deliberate M1 simplification.
 */

/** Cap on `Player.recentResults` — the newest few tournaments only, so save
 * size stays bounded across a long career (every division's field, not just
 * the human's, gains an entry each time a sibling session concludes). */
const MAX_RECENT_RESULTS = 5;

export type FieldSize = 8 | 16 | 32 | 64;

export type DivisionCode = "A" | "B" | "C" | "D";

export interface TournamentDef {
  /** per-division-unique, e.g. "hamburg-open-2026-a" */
  id: string;
  /** shared across every division of the same physical event, e.g.
   * "hamburg-open-2026" — see `tournamentCalendar`, `humanDivisionDef` */
  eventId: string;
  /** skill-tier bracket within the event — how many divisions a tier gets
   * is BALANCE.division.byTier */
  division: DivisionCode;
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

/** One pairing within a round's group. `winner` is null only for the human's
 * own pair, until their match concludes (see `advanceTournament`) — every
 * other pair auto-resolves immediately in `resolveRound`. */
interface RoundPair {
  a: string;
  b: string;
  winner: string | null;
}

/**
 * A group of entrants still contesting a shared position-range — a
 * contiguous slice of bracket positions. `undefeated` marks the single
 * lineage that has never lost (always allowed to keep splitting, uncapped,
 * down to a real final); every other group is a plate lineage, capped at 3
 * total games (`gamesPlayed`) per the module doc comment. `frozen` means
 * this group will play no further matches — its members share a tied
 * position band once the tournament concludes (or, if `participants.length
 * === 1`, it already holds one fully-resolved position).
 */
interface Group {
  participants: string[];
  undefeated: boolean;
  /** games every member of this group has already played, entering it */
  gamesPlayed: number;
  frozen: boolean;
}

function isDecided(g: Group): boolean {
  return g.frozen || g.participants.length === 1;
}

/**
 * One played round, kept for the lifetime of the session so a draw/bracket
 * view can be rendered — see `drawRounds` in facade.ts. `groups` is the
 * groups *entering* this round (before it played); `pairs` mirrors it
 * one-for-one and is the same array `resolveRound` populated, so the
 * human's own pairing here updates in place (winner goes from `null` to a
 * real id) the moment their match concludes — no need to re-snapshot.
 */
interface RoundRecord {
  round: number;
  groups: Group[];
  pairs: (RoundPair[] | null)[];
}

export interface TournamentSession {
  def: TournamentDef;
  weekIndex: number;
  seed: string;
  humanId: string;
  /** entrant ids in fixed bracket-position order, seeded once at entry */
  bracketBySeed: string[];
  currentRound: number; // 0-indexed
  /**
   * This round's groups, in bracket-position order — see {@link Group} and
   * the module doc comment for how they split and freeze round to round.
   */
  groups: Group[];
  /** this round's pairings, one entry per group in `groups` — null for a
   * group that didn't play this round (already decided); populated by
   * `resolveRound`; null (the whole array) before the session's first round
   * has been resolved */
  roundPairs: (RoundPair[] | null)[] | null;
  pendingMatch: MatchState | null;
  pendingGroupIndex: number | null;
  pendingPairIndexInGroup: number | null;
  /** energy the human carries into their next match (recovers a little between rounds) */
  humanEnergyCarry: number;
  cumulativeEnergySpent: number;
  /** total matches won this tournament — indexes `prizeByRoundsWon`;
   * distinct from `finishingPosition`, since two different placement paths
   * can share the same win count (see `concludeTournament`'s doc comment) */
  roundsWon: number;
  totalRounds: number;
  /** entrants' ratings as of tournament entry — the Glicko-2 rating period's
   * fixed opponent snapshot, so results earlier in the draw can't bleed into
   * later ones within the same period */
  ratingsSnapshot: ReadonlyMap<string, Ratings>;
  /** every decisive set result recorded so far this tournament, applied to
   * ratings once the event concludes */
  resultsBook: RatingResultsBook;
  /** the FIR placement-points table, snapshotted at entry so scoring doesn't
   * need a `content` parameter threaded through every advance call */
  rankingMatrix: RankingMatrix;
  /** every round the human actually experienced, oldest first — see
   * {@link RoundRecord}. Only `resolveRound` appends (the human-facing path);
   * `finishAllRemainingGroups`' silent mop-up after the human's own result is
   * known deliberately isn't recorded, so this stops exactly where their
   * tournament did. */
  history: RoundRecord[];
}

export type TournamentAdvanceResult =
  | { status: "nextRound"; match: MatchState; round: number; totalRounds: number }
  | {
      status: "eliminated";
      roundsWon: number;
      totalRounds: number;
      prizeMoney: number;
      finishingPosition: number;
      rankingPoints: number;
      /** how many entrants share this exact position — 1 means a clean,
       * untied placement; >1 means a plate band tied on the cap */
      tiedCount: number;
    }
  | {
      status: "won";
      totalRounds: number;
      prizeMoney: number;
      finishingPosition: number;
      rankingPoints: number;
      tiedCount: number;
    };

/**
 * Every content tournament placed on the game's week grid, keyed by the
 * `weekIndex` its real-world `date` falls into. Real events don't recur —
 * each event occupies exactly one week — so this is a direct lookup rather
 * than an arithmetic recurrence rule. A week's value is *every division's*
 * `TournamentDef` for that event (they share a date); see `humanDivisionDef`
 * for resolving which one specific division matters to the human.
 */
export function tournamentCalendar(content: ContentBundle): Map<number, TournamentDef[]> {
  const map = new Map<number, TournamentDef[]>();
  for (const def of Object.values(content.tournaments)) {
    const week = weekIndexForDate(def.date);
    const defs = map.get(week);
    if (defs) defs.push(def);
    else map.set(week, [def]);
  }
  return map;
}

export function tournamentForWeek(content: ContentBundle, weekIndex: number): TournamentDef[] | null {
  return tournamentCalendar(content).get(weekIndex) ?? null;
}

export function isTournamentWeek(content: ContentBundle, weekIndex: number): boolean {
  return tournamentCalendar(content).has(weekIndex);
}

/**
 * Every division of an event the human may enter this week: their own
 * FIR-points-percentile band first (see `systems/division.ts`), then every
 * *tougher* band above it, best (elite "A") last — "playing up" a class,
 * same as FIR's real Tournament Regs 3.3 allows. Playing down is never
 * offered — a player above a class's cut-off plays their real class, same
 * as the FIR rule this mirrors.
 *
 * The human's own `firPoints` stays their static (always-null) snapshot here
 * — the same field NPCs carry — rather than their growing in-career total
 * (`firPointsTotal`, systems/ranking-points.ts). Feeding the growing total in
 * here would let the human become the *only* ranked entrant against an
 * otherwise-unranked NPC pool for a division, which `divisionAssignments`
 * would then place in the tier's top band by points alone — a band
 * `projectedField` might not be able to fill with tier-1 NPCs banded there
 * on points. Since `divisionAssignments` now bands unranked players
 * (including the human) by in-game skill instead of dumping them all in the
 * lowest band, the human's own division already climbs naturally as their
 * skill grows over a career — no separate follow-up needed.
 *
 * Also passes the event's host country through as `divisionAssignments`'
 * `hostWildcards` — a strong-but-borderline local human can find themselves
 * wildcarded straight into the tougher class at their own country's event
 * (FIR Tournament Regs 3.8.5), same as any NPC.
 */
export function humanEligibleDivisions(state: GameState, defs: TournamentDef[]): TournamentDef[] {
  const human = getPlayer(state, state.career.playerId);
  const tier = defs[0]!.tier;
  const tierDivisions = BALANCE.division.byTier[tier];
  if (!tierDivisions) throw new Error(`No BALANCE.division.byTier entry for tier "${tier}"`);

  const samePool = state.players
    .filter((p) => p.identity.gender === human.identity.gender)
    .map((p) => ({ id: p.identity.id, firPoints: p.firPoints, skill: combinedRating(p), nationality: p.identity.nationality }));
  const assignments = divisionAssignments(samePool, tierDivisions, {
    hostCountry: defs[0]!.country,
    count: BALANCE.tournament.hostWildcardsToTopDivision,
  });
  const ownDivision = divisionOf(assignments, human.identity.id);
  const ownIndex = tierDivisions.indexOf(ownDivision);

  // tierDivisions is ordered toughest (index 0, "A") to easiest (last) — the
  // human's own band and everything tougher, own division first
  const playableDivisions = tierDivisions.slice(0, ownIndex + 1).reverse();
  return playableDivisions.map((division) => {
    const def = defs.find((d) => d.division === division);
    if (!def) throw new Error(`No "${division}" division found for event ${defs[0]!.eventId} (content-authoring gap)`);
    return def;
  });
}

/**
 * The single `TournamentDef` for the human's own division — every
 * facade-facing function that doesn't offer a class choice funnels through
 * here so it keeps returning one def, exactly like before divisions (and
 * playing up) existed. See `humanEligibleDivisions` for the full choice set.
 */
export function humanDivisionDef(state: GameState, defs: TournamentDef[]): TournamentDef {
  return humanEligibleDivisions(state, defs)[0]!;
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
 * A player's relative likelihood of entering `def` based on how far their
 * home country is from the host city — closer players travel more often in
 * real amateur/semi-pro tour play, both because flights are cheaper (see
 * `systems/travel.ts`) and because regional players simply have more of
 * these events within reach. Rational decay (not exponential) so distant
 * countries stay possible, just less likely, rather than effectively
 * excluded — this is a bias, not a residency requirement. Domestic entrants
 * (distance 0) get the max weight of 1; falls back to neutral (1, i.e. no
 * bias either way) if either country is missing coordinates, matching
 * `travelCost`'s own "content gaps shouldn't crash or unfairly penalize"
 * convention.
 */
function entryWeight(content: ContentBundle, homeCountry: string, def: TournamentDef): number {
  const home = content.countries[homeCountry];
  if (!home) return 1;
  const km = distanceKm(home.lat, home.lon, def.lat, def.lon);
  return 1 / (1 + km / BALANCE.tournament.geoBiasScaleKm);
}

/**
 * Weighted sampling without replacement (Efraimidis-Spirakis): each item
 * draws a key `u^(1/weight)` from a fresh uniform `u`, and the `n` largest
 * keys win — equivalent to repeatedly drawing proportional to weight, but a
 * single deterministic pass over a seeded `Rng` instead of a stateful
 * repeated-draw loop.
 */
function weightedSampleWithoutReplacement<T>(
  rng: Rng,
  items: readonly T[],
  weight: (item: T) => number,
  n: number,
): T[] {
  const keyed = items.map((item) => ({ item, key: Math.pow(rng.next(), 1 / weight(item)) }));
  keyed.sort((a, b) => b.key - a.key);
  return keyed.slice(0, n).map((k) => k.item);
}

/**
 * Deterministically projects which tier-1 NPCs would fill a given week's
 * tournament field — independent of whether the human ultimately enters.
 * Lets the Tour screen show "who's entered" ahead of the tournament actually
 * happening, and is what `pickEntrants` uses once the human does enter, so
 * the preview and the real bracket are guaranteed to agree.
 *
 * Draws are gender- *and* division-separated — never mixed — so the pool is
 * filtered to the human's own gender and `def.division` before sampling.
 * Division bands are computed over the *whole* same-gender population
 * (human included), matching `humanDivisionDef`'s population scope exactly
 * — using a narrower population here would risk disagreeing with
 * `humanDivisionDef` on a borderline player's band. Men's and women's fields
 * are always the same size (`def.fieldSize`); only the human's own draw is
 * ever generated, since nothing in the game currently depends on the other one.
 *
 * Within the eligible pool, entrants are drawn with `entryWeight` — closer
 * players are more likely to show up, but the draw is still a weighted
 * *sample*, not a cutoff, so distant entrants remain possible.
 *
 * Also passes the host country through to `divisionAssignments`' host
 * wildcards, so a division's own top band ("A") can include a couple of
 * strong domestic players who'd otherwise have just missed the cut — see
 * that function's doc comment for the FIR Tournament Regs 3.8.5 basis.
 */
export function projectedField(
  state: GameState,
  def: TournamentDef,
  weekIndex: number,
  content: ContentBundle,
): Player[] {
  return sampleDivisionField(state, def, weekIndex, content, def.fieldSize - 1);
}

/**
 * Same eligible-pool and weighted draw as `projectedField`, but for a
 * division the human isn't in at all — used to build a fully-AI sibling
 * bracket for "watch division A's draw while you play B" (see
 * `startSiblingSession`). Draws the *entire* `def.fieldSize`, not
 * `fieldSize - 1`, since there's no human slot to leave open. Reuses the
 * exact same seed and pool ordering as `projectedField`, so this is always
 * a strict superset of what `projectedField`/`eligibleDivisions` already
 * previewed for the same def and week — just one name longer.
 */
export function fullDivisionField(
  state: GameState,
  def: TournamentDef,
  weekIndex: number,
  content: ContentBundle,
): Player[] {
  return sampleDivisionField(state, def, weekIndex, content, def.fieldSize);
}

function sampleDivisionField(
  state: GameState,
  def: TournamentDef,
  weekIndex: number,
  content: ContentBundle,
  needed: number,
): Player[] {
  const rng = new Rng(childSeed(state.seed, "tournament", weekIndex, def.id));
  const human = getPlayer(state, state.career.playerId);
  const tierDivisions = BALANCE.division.byTier[def.tier];
  if (!tierDivisions) throw new Error(`No BALANCE.division.byTier entry for tier "${def.tier}"`);
  const sameGender = state.players.filter((p) => p.identity.gender === human.identity.gender);
  const assignments = divisionAssignments(
    sameGender.map((p) => ({
      id: p.identity.id,
      firPoints: p.firPoints,
      skill: combinedRating(p),
      nationality: p.identity.nationality,
    })),
    tierDivisions,
    { hostCountry: def.country, count: BALANCE.tournament.hostWildcardsToTopDivision },
  );
  const pool = sameGender.filter((p) => p.simTier === 1 && divisionOf(assignments, p.identity.id) === def.division);
  if (pool.length < needed) {
    throw new Error(
      `Not enough tier-1 ${human.identity.gender} players in division ${def.division} ` +
        `(${pool.length}) for a ${needed}-player draw`,
    );
  }
  return weightedSampleWithoutReplacement(rng, pool, (p) => entryWeight(content, p.identity.nationality, def), needed);
}

function pickEntrants(state: GameState, def: TournamentDef, weekIndex: number, content: ContentBundle): Player[] {
  const human = getPlayer(state, state.career.playerId);
  return [human, ...projectedField(state, def, weekIndex, content)];
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

/**
 * Resolves every pair of the current round across every still-active group
 * (skipping any already-decided group — see {@link isDecided}), except the
 * human's own pair, which becomes the session's `pendingMatch` for the UI to
 * play interactively. Pair seeding uses a single round-global counter (not
 * per-group) so results stay identical to the pre-monrad pairing order for
 * round 0, and remain fully deterministic for a given seed thereafter.
 *
 * Only ever called when the human's own group is NOT already decided (the
 * caller — `startTournament` at round 0, or `advanceTournament` after a
 * split — guarantees this), so a `pendingMatch` is always produced.
 */
function resolveRound(state: GameState, session: TournamentSession): void {
  const round = session.currentRound;
  const ref = (player: Player) =>
    matchRefFromPlayer(player, ageOn(state.calendar.mondayISO, player.identity.birthDate));

  session.pendingMatch = null;
  session.pendingGroupIndex = null;
  session.pendingPairIndexInGroup = null;
  let globalIndex = 0;

  session.roundPairs = session.groups.map((group, groupIndex) => {
    if (isDecided(group)) return null;
    const pairs = roundPairs(group.participants);
    return pairs.map(([a, b], pairIndexInGroup): RoundPair => {
      const seed = childSeed(session.seed, "round", round, globalIndex++);
      if (a === session.humanId || b === session.humanId) {
        const human = getPlayer(state, session.humanId);
        const opponent = getPlayer(state, a === session.humanId ? b : a);
        const m = createMatch(ref(human), ref(opponent), seed);
        m.energy.a = session.humanEnergyCarry;
        session.pendingMatch = m;
        session.pendingGroupIndex = groupIndex;
        session.pendingPairIndexInGroup = pairIndexInGroup;
        return { a, b, winner: null };
      }
      const pa = getPlayer(state, a);
      const pb = getPlayer(state, b);
      const m = createMatch(ref(pa), ref(pb), seed);
      simulateMatchAuto(m);
      recordMatchResults(session.resultsBook, m);
      return { a, b, winner: m.winner === "a" ? a : b };
    });
  });

  session.history.push({ round, groups: session.groups, pairs: session.roundPairs });
}

/**
 * Auto-resolves one round for every still-active group, with AI tactics on
 * both sides for every match (used only by `finishAllRemainingGroups`, once
 * the human's own result is already known and nothing here needs to reach
 * the UI). Mirrors `resolveRound`'s pairing/seeding exactly, minus the
 * human's interactive branch.
 */
function resolveRoundAuto(state: GameState, session: TournamentSession, round: number): (RoundPair[] | null)[] {
  const ref = (player: Player) =>
    matchRefFromPlayer(player, ageOn(state.calendar.mondayISO, player.identity.birthDate));
  let globalIndex = 0;

  return session.groups.map((group) => {
    if (isDecided(group)) return null;
    const pairs = roundPairs(group.participants);
    return pairs.map(([a, b]): RoundPair => {
      const seed = childSeed(session.seed, "round", round, globalIndex++);
      const pa = getPlayer(state, a);
      const pb = getPlayer(state, b);
      const m = createMatch(ref(pa), ref(pb), seed);
      simulateMatchAuto(m);
      recordMatchResults(session.resultsBook, m);
      return { a, b, winner: m.winner === "a" ? a : b };
    });
  });
}

/**
 * Splits every group that played this round into a winners' sub-group (the
 * better half of its position range) and a losers' sub-group (the worse
 * half); a group that didn't play (already decided) carries forward
 * unchanged. `undefeated` propagates only to a winners' sub-group of an
 * already-undefeated group — the moment anyone loses, they (and, from then
 * on, their whole lineage) are capped at 3 total games. See the module doc
 * comment for why this produces a real final for 1st/2nd but ties deeper
 * losers together once continuing would need a 4th game.
 */
function buildNextGroups(groups: Group[], roundPairsByGroup: (RoundPair[] | null)[]): Group[] {
  return groups.flatMap((group, i): Group[] => {
    const pairs = roundPairsByGroup[i];
    if (!pairs) return [group];
    const gamesPlayed = group.gamesPlayed + 1;
    // The winners' subgroup only stays undefeated if its parent was — losing
    // even once ends that forever. Each subgroup's own `frozen` must use ITS
    // OWN `undefeated`, not the parent's: a winners' subgroup of an
    // undefeated group is never capped, but that SAME round's losers'
    // subgroup (freshly eliminated) always is, even though they share a
    // parent — computing `frozen` once from the parent's status and reusing
    // it for both children would wrongly let freshly-eliminated losers of an
    // undefeated group keep playing uncapped.
    const winners: Group = {
      participants: pairs.map((p) => p.winner!),
      undefeated: group.undefeated,
      gamesPlayed,
      frozen: !group.undefeated && gamesPlayed >= 3,
    };
    const losers: Group = {
      participants: pairs.map((p) => (p.winner === p.a ? p.b : p.a)),
      undefeated: false,
      gamesPlayed,
      frozen: gamesPlayed >= 3,
    };
    return [winners, losers];
  });
}

/** Index into `session.groups` of whichever group currently holds the human. */
function humanGroupIndex(session: TournamentSession): number {
  const idx = session.groups.findIndex((g) => g.participants.includes(session.humanId));
  if (idx === -1) throw new Error("Human not found in any tournament group");
  return idx;
}

/** The 1-indexed bracket position of the first (best) slot in the group at `index`. */
function groupStartPosition(groups: Group[], index: number): number {
  let offset = 0;
  for (let i = 0; i < index; i++) offset += groups[i]!.participants.length;
  return offset + 1;
}

/**
 * Silently plays out every group still active once the human's own result is
 * already decided — purely so the rest of the field's ratings stay realistic
 * (see the module doc comment). No UI interaction: every match, including
 * what would otherwise be the human's own, is impossible here by
 * construction (their group is already decided, so it's excluded from
 * `roundPairsByGroup`).
 */
function finishAllRemainingGroups(state: GameState, session: TournamentSession): void {
  let guard = 0;
  while (session.groups.some((g) => !isDecided(g)) && ++guard <= session.totalRounds + 1) {
    const roundPairsByGroup = resolveRoundAuto(state, session, session.currentRound);
    session.groups = buildNextGroups(session.groups, roundPairsByGroup);
    session.currentRound += 1;
  }
}

/**
 * Records this concluded tournament into every entrant's `recentResults` —
 * called exactly once, at the moment every group in `session` is decided
 * (the human's own session right after `finishAllRemainingGroups`; a sibling
 * session the instant `isSiblingConcluded` first turns true). Walks
 * `session.groups` in bracket-position order, same as `groupStartPosition`
 * uses for the human's own `finishingPosition` in `concludeTournament`, so
 * every entrant — not just the human — gets an accurate placement and a
 * `matchesPlayed` count (`Group.gamesPlayed`, final by construction once a
 * group is decided).
 */
function recordEntrantResults(state: GameState, session: TournamentSession): void {
  let offset = 0;
  for (const group of session.groups) {
    const finishingPosition = offset + 1;
    offset += group.participants.length;
    const tiedCount = group.participants.length;
    for (const id of group.participants) {
      const player = getPlayer(state, id);
      player.recentResults.push({
        weekIndex: session.weekIndex,
        tournamentId: session.def.id,
        name: session.def.name,
        tier: session.def.tier,
        division: session.def.division,
        finishingPosition,
        tiedCount,
        matchesPlayed: group.gamesPlayed,
      });
      if (player.recentResults.length > MAX_RECENT_RESULTS) player.recentResults.shift();
    }
  }
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
  const entrants = pickEntrants(state, def, week, content);
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
    groups: [{ participants: bracketBySeed, undefeated: true, gamesPlayed: 0, frozen: false }],
    roundPairs: null,
    pendingMatch: null,
    pendingGroupIndex: null,
    pendingPairIndexInGroup: null,
    humanEnergyCarry: 100,
    cumulativeEnergySpent: 0,
    roundsWon: 0,
    totalRounds,
    ratingsSnapshot: new Map(entrants.map((p) => [p.identity.id, cloneRatings(p.ratings)])),
    resultsBook: new Map(),
    rankingMatrix: content.rankingMatrix,
    history: [],
  };

  resolveRound(state, session);
  return session;
}

/** Sentinel `humanId` for a sibling (fully-AI) session — see
 * `startSiblingSession`. Never matches a real entrant id, so `resolveRound`'s
 * human branch never fires and every pair auto-resolves immediately, exactly
 * like any other AI-vs-AI pair in the human's own session. */
const NO_HUMAN_ID = "__no_human__";

/**
 * A fully-AI `TournamentSession` for a division the human isn't playing —
 * lets the Tour screen show another division's bracket advancing in
 * lockstep with the human's own tournament (see `advanceSiblingSession`).
 * Draws the entire `def.fieldSize` from `fullDivisionField` (no human slot
 * to leave open), then resolves round 0 immediately, same shape as
 * `startTournament` but with no economic side effects (no entry fee, no
 * prize money, no fatigue) — the session itself is a pure spectator view,
 * recomputed fresh each time and never persisted in `GameState` (see the
 * module doc comment's note on `TournamentSession` being ephemeral for the
 * same reason). It does still write one lasting thing to `GameState` once
 * concluded: every entrant's placement, via `recordEntrantResults` — see
 * `advanceSiblingSession`.
 */
export function startSiblingSession(
  state: GameState,
  def: TournamentDef,
  weekIndex: number,
  content: ContentBundle,
): TournamentSession {
  const entrants = fullDivisionField(state, def, weekIndex, content);
  const bracketBySeed = seedBracket(entrants, def.fieldSize);
  const totalRounds = Math.log2(def.fieldSize);
  const rngSeed = childSeed(state.seed, "tournament", weekIndex, def.id);

  const session: TournamentSession = {
    def,
    weekIndex,
    seed: rngSeed,
    humanId: NO_HUMAN_ID,
    bracketBySeed,
    currentRound: 0,
    groups: [{ participants: bracketBySeed, undefeated: true, gamesPlayed: 0, frozen: false }],
    roundPairs: null,
    pendingMatch: null,
    pendingGroupIndex: null,
    pendingPairIndexInGroup: null,
    humanEnergyCarry: 0,
    cumulativeEnergySpent: 0,
    roundsWon: 0,
    totalRounds,
    ratingsSnapshot: new Map(entrants.map((p) => [p.identity.id, cloneRatings(p.ratings)])),
    resultsBook: new Map(),
    rankingMatrix: content.rankingMatrix,
    history: [],
  };

  resolveRound(state, session);
  return session;
}

/** True once every group in a sibling session has a fully decided position
 * — the tournament is over, nothing left to advance. */
export function isSiblingConcluded(session: TournamentSession): boolean {
  return session.groups.every(isDecided);
}

/**
 * Advances a sibling session by exactly one round, paced to match the human's
 * own tournament advancing one round at a time (see facade.ts's
 * `resolveTournamentMatch`): the round already resolved (by
 * `startSiblingSession` or the previous call) is finalized via
 * `buildNextGroups`, then the next round (if the sibling isn't concluded
 * yet) resolves immediately with the same all-AI mechanics as round 0. A
 * no-op once `isSiblingConcluded`.
 */
export function advanceSiblingSession(state: GameState, session: TournamentSession): void {
  if (isSiblingConcluded(session)) return;
  session.groups = buildNextGroups(session.groups, session.roundPairs!);
  session.currentRound += 1;
  if (isSiblingConcluded(session)) {
    recordEntrantResults(state, session);
    return;
  }
  resolveRound(state, session);
}

/**
 * Fast-forwards a sibling session straight to conclusion — used once the
 * human's own tournament ends, so a sibling division that had more rounds
 * left (a bigger draw, or one simply behind on pacing) still reaches a real
 * final result instead of freezing mid-bracket.
 */
export function finishSiblingSession(state: GameState, session: TournamentSession): void {
  let guard = 0;
  while (!isSiblingConcluded(session) && ++guard <= session.totalRounds + 1) {
    advanceSiblingSession(state, session);
  }
}

/**
 * Concludes the tournament once the human's own group is decided. `prize`
 * still indexes off `roundsWon` (total matches won, not exact position) — a
 * deliberate simplification: two different placement paths can share a win
 * count (e.g. one tied band's winners and another band entirely can both
 * have 2 wins), and both draw the same `prizeByRoundsWon[2]`. Ranking points,
 * by contrast, use `finishingPosition` exactly (the tied band's *best*
 * position, per FIR convention), since that's what the Points Matrix is
 * keyed on.
 */
function concludeTournament(
  state: GameState,
  session: TournamentSession,
  log: EventLog,
  roundsWon: number,
  finishingPosition: number,
  tiedCount: number,
): TournamentAdvanceResult {
  const prize = session.def.prizeByRoundsWon[roundsWon] ?? 0;
  state.career.money += prize;
  const human = getPlayer(state, session.humanId);
  const fatigueGain = session.cumulativeEnergySpent * BALANCE.tournament.fatigueConversionFactor;
  human.condition.fatigue = Math.min(100, human.condition.fatigue + fatigueGain);

  const rankingPoints = rankingPointsFor(
    session.def.tier,
    session.def.division,
    finishingPosition,
    session.def.fieldSize,
    session.rankingMatrix,
  );
  state.career.firResults.push({
    weekIndex: session.weekIndex,
    tournamentId: session.def.id,
    tier: session.def.tier,
    points: rankingPoints,
  });

  const won = finishingPosition === 1;
  log.push({
    week: session.weekIndex,
    type: won ? "tournament.won" : "tournament.eliminated",
    subject: session.humanId,
    data: {
      name: session.def.name,
      tournamentId: session.def.id,
      roundsWon,
      totalRounds: session.totalRounds,
      prizeMoney: prize,
      finishingPosition,
      rankingPoints,
      tiedCount,
    },
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
    ? { status: "won", totalRounds: session.totalRounds, prizeMoney: prize, finishingPosition, rankingPoints, tiedCount }
    : {
        status: "eliminated",
        roundsWon,
        totalRounds: session.totalRounds,
        prizeMoney: prize,
        finishingPosition,
        rankingPoints,
        tiedCount,
      };
}

/**
 * Advances the bracket once the human's current match has concluded. Takes
 * the finished MatchState directly (rather than trusting the session's own
 * stored reference) so it works regardless of how the UI's reactive layer
 * wraps that object.
 *
 * A loss doesn't necessarily end the tournament: the human drops into that
 * round's losers' sub-group and keeps playing real matches as long as their
 * lineage isn't capped yet (see the module doc comment). The moment their
 * own group is decided — win the whole thing, lose a real placement match
 * with nobody left to play, or get frozen into a tied band by the 3-game cap
 * — their result is final, independent of how much longer the rest of the
 * field takes to resolve (which is fast-forwarded silently afterward).
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

  const pair = session.roundPairs![session.pendingGroupIndex!]![session.pendingPairIndexInGroup!]!;
  pair.winner = humanWon ? session.humanId : finishedMatch.players.b.id;
  session.pendingMatch = null;
  session.pendingGroupIndex = null;
  session.pendingPairIndexInGroup = null;

  if (humanWon) session.roundsWon += 1;
  const human = getPlayer(state, session.humanId);
  const recovery =
    BALANCE.tournament.energyRecoveryBetweenRounds * staminaRecoveryMult(human.attributes.stamina);
  session.humanEnergyCarry = Math.min(100, finishedMatch.energy.a + recovery);

  session.groups = buildNextGroups(session.groups, session.roundPairs!);
  session.currentRound += 1;

  const hgi = humanGroupIndex(session);
  const humanGroup = session.groups[hgi]!;

  if (isDecided(humanGroup)) {
    const finishingPosition = groupStartPosition(session.groups, hgi);
    const tiedCount = humanGroup.participants.length;
    finishAllRemainingGroups(state, session);
    recordEntrantResults(state, session);
    return concludeTournament(state, session, log, session.roundsWon, finishingPosition, tiedCount);
  }

  resolveRound(state, session);
  return {
    status: "nextRound",
    match: session.pendingMatch!,
    round: session.currentRound,
    totalRounds: session.totalRounds,
  };
}

export interface DrawPlayerView {
  id: string;
  name: string;
  nationality: string;
}

/** One pairing in a draw round. `winnerId` is null only for the human's own
 * not-yet-played match this round. */
export interface DrawMatchup {
  a: DrawPlayerView;
  b: DrawPlayerView;
  winnerId: string | null;
  isYouA: boolean;
  isYouB: boolean;
}

/**
 * One group's pairings within a round — a "section" since a single round can
 * hold several simultaneous groups once the field has split into main draw
 * + one or more plate lineages (see the module doc comment). `isMainDraw`
 * marks the single still-undefeated lineage; every other section is a plate
 * match, a materially different stake from a main-draw one at the same
 * position range.
 */
export interface DrawSection {
  isMainDraw: boolean;
  /** e.g. "Final", "Semifinal", "Quarterfinal", "Round of 16" for the main
   * draw; the same names prefixed "Plate " otherwise */
  roundName: string;
  /** 1-indexed bracket position range this section is contesting */
  positionFrom: number;
  positionTo: number;
  matchups: DrawMatchup[];
}

export interface DrawRound {
  round: number; // 0-indexed
  sections: DrawSection[];
}

function drawRoundName(groupSizeEnteringRound: number, isMainDraw: boolean): string {
  const base =
    groupSizeEnteringRound === 2
      ? "Final"
      : groupSizeEnteringRound === 4
        ? "Semifinal"
        : groupSizeEnteringRound === 8
          ? "Quarterfinal"
          : `Round of ${groupSizeEnteringRound}`;
  return isMainDraw ? base : `Plate ${base}`;
}

function drawPlayerView(state: GameState, playerId: string): DrawPlayerView {
  const p = getPlayer(state, playerId);
  return { id: playerId, name: fullName(p), nationality: p.identity.nationality };
}

/**
 * The bracket/draw the human has played through so far this tournament,
 * oldest round first — reconstructed from `TournamentSession.history`. This
 * is what lets the UI show an actual draw tree (which round, main draw or
 * plate, which position range) rather than just "your next match".
 */
export function drawRounds(state: GameState, session: TournamentSession): DrawRound[] {
  return session.history.map(({ round, groups, pairs }) => {
    const sections: DrawSection[] = [];
    let offset = 0;
    groups.forEach((group, groupIndex) => {
      const groupSize = group.participants.length;
      const positionFrom = offset + 1;
      const positionTo = offset + groupSize;
      offset += groupSize;
      const groupPairs = pairs[groupIndex];
      if (!groupPairs) return; // already decided before this round — nothing played
      sections.push({
        isMainDraw: group.undefeated,
        roundName: drawRoundName(groupSize, group.undefeated),
        positionFrom,
        positionTo,
        matchups: groupPairs.map((p) => ({
          a: drawPlayerView(state, p.a),
          b: drawPlayerView(state, p.b),
          winnerId: p.winner,
          isYouA: p.a === session.humanId,
          isYouB: p.b === session.humanId,
        })),
      });
    });
    return { round, sections };
  });
}
