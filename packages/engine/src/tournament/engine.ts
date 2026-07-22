import { BALANCE } from "../balance.js";
import type { ContentBundle, RankingMatrix } from "../content.js";
import { ageOn, weekIndexForDate } from "../core/date.js";
import type { EventLog } from "../core/events.js";
import { Rng, childSeed } from "../core/rng.js";
import type { GameState } from "../core/state.js";
import { getPlayer } from "../core/state.js";
import { clamp } from "../core/util.js";
import type { Player, Ratings } from "../model/player.js";
import { fullName } from "../model/player.js";
import type { Sport } from "../model/sport.js";
import { SPORTS } from "../model/sport.js";
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
import { enduranceRecoveryMult } from "../systems/effects.js";
import { pickInjuryDef, pickInjuryDuration, pickMatchInjurySeverity } from "../systems/injury.js";
import { firWorldRanking, rankingPointsFor } from "../systems/ranking-points.js";
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
 * however many rounds that takes (`log2(fieldSize)`). Likewise, the losers of
 * the true semifinal — the other podium spot — always play a genuine
 * bronze-medal match for 3rd/4th, regardless of the 3-game cap below; a
 * podium needs a real bronze match exactly as much as it needs a real final.
 * The moment any other player loses, they drop into a plate lineage and keep
 * getting real matches against fellow losers until they've played 3 games
 * total (or the plate lineage itself shrinks to a single player, whichever
 * comes first). If there's still room for one more real match when it's a
 * plate group's turn, it's played — a genuine decisive result. Only when the
 * *next* match would be a 4th game does that group stop instead, sharing a
 * tied position band (best position used for ranking points — see
 * `rankingPointsFor`). For an 8-player draw this never actually bites (3
 * rounds total == the cap), so every entrant still gets a fully distinct
 * place 1..8; bigger draws progressively band deeper losers together the
 * further they are from the final. See `buildNextGroups`
 * for the mechanics and `advanceTournament` for how a player's own result is
 * known the moment their lineage is decided, independent of the rest of the
 * field.
 *
 * AI-vs-AI matches auto-resolve instantly; the human's own match each round
 * is handed back to the UI to play interactively (reusing the regular Match
 * screen), with energy carrying over between rounds — a tournament day is a
 * endurance arc, not isolated matches. Once the human's own lineage is decided,
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

/** Cap on `Player.recentResults` — the newest several tournaments only, so
 * save size stays bounded across a long career (every division's field, not
 * just the human's, gains an entry each time a sibling session concludes).
 * 20 covers multiple seasons at the current content calendar's pace (~16
 * events/year) — generous enough for the opponent profile's tournament
 * history to feel like a real record, not a rolling window that visibly
 * forgets last year. Revisit if a much denser future calendar makes this a
 * real save-size concern. */
const MAX_RECENT_RESULTS = 20;

export type FieldSize = 8 | 16 | 32 | 64;

export type DivisionCode = "A" | "B" | "C" | "D" | "E";

export interface TournamentDef {
  /** per-division-unique, e.g. "hamburg-open-2026-a" */
  id: string;
  /** shared across every division of the same physical event, e.g.
   * "hamburg-open-2026" — see `tournamentCalendar`, `humanDivisionDef` */
  eventId: string;
  /** skill-tier bracket within the event — how many divisions a tier gets
   * (per gender) is BALANCE.division.byTier */
  division: DivisionCode;
  /** which gender's draw this def is — men's and women's brackets are always
   * seeded and played separately, and can now differ in both division count
   * and fieldSize per tier (see BALANCE.division.byTier) */
  gender: "m" | "f";
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
  /** named tournament director — flavor source for this event's draw email
   * (systems/inbox.ts's `addDrawEmails`). Not every event has a name on file
   * yet, so callers fall back to a generic "tournament director" role label
   * when absent. */
  director?: string;
}

/** this def's own division array (own tier, own gender) — the single lookup
 * point every division-aware function below shares. */
function tierDivisionsFor(tier: string, gender: "m" | "f"): readonly string[] {
  const byGender = BALANCE.division.byTier[tier];
  const tierDivisions = byGender?.[gender];
  if (!tierDivisions) throw new Error(`No BALANCE.division.byTier entry for tier "${tier}" gender "${gender}"`);
  return tierDivisions;
}

/** In-place Fisher–Yates shuffle, deterministic given `rng`. */
function shuffle<T>(items: readonly T[], rng: Rng): T[] {
  const arr = [...items];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = rng.int(i + 1);
    [arr[i], arr[j]] = [arr[j]!, arr[i]!];
  }
  return arr;
}

/** One pairing within a round's group. `winner` is null only for the human's
 * own pair, until their match concludes (see `advanceTournament`) — every
 * other pair auto-resolves immediately in `resolveRound`. */
interface RoundPair {
  a: string;
  b: string;
  winner: string | null;
  /** the four set scores (TT→BD→SQ→TN order), captured from the resolved
   * match — undefined only for the human's own pair until they've played it */
  sets?: { a: number; b: number }[];
  /** true when this pairing was resolved as a walkover — either a fresh
   * mid-match injury retirement, or one side already carrying a
   * match-blocking injury/illness (from training, or an earlier round of
   * this same tournament) before the match ever started. No competitive
   * result to show; `winner` is still set, just not earned on court. */
  walkover?: boolean;
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
  /** snapshotted at session start so internal helpers (retirement injury
   * catalog picks) don't need `content` threaded through every call site —
   * TournamentSession is ephemeral, never persisted, so this is safe. */
  content: ContentBundle;
  /** entrant ids who have withdrawn mid-tournament due to a match-time
   * injury/illness retirement — every future pairing involving them
   * auto-resolves as a walkover for the opponent (see `resolveRound`), no
   * simulation, no re-rolled injury risk. Never removes them from
   * `groups`/`bracketBySeed`; they still occupy their bracket slot and
   * accrue a loss for placement/FIR purposes exactly like a normal
   * elimination (see `recordEntrantResults`, unchanged). */
  withdrawnEntrants: Set<string>;
  /** entrant ids in fixed bracket-position order, seeded once at entry */
  bracketBySeed: string[];
  /** each entrant's seed rank (1 = top-rated), computed once at entry from the
   * same Glicko sort as `bracketBySeed` — lets the draw view badge seeds */
  seedByPlayerId: ReadonlyMap<string, number>;
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
  /** every other still-active entrant's own between-round energy carry,
   * mirroring `humanEnergyCarry` but for the whole field — see
   * `carryEnergy`. Without this, every opponent the human faces would start
   * fresh at 100 regardless of how tough that opponent's own earlier
   * rounds were (`createMatch`'s default), which reads as an unfair
   * asymmetry once the human is visibly carrying fatigue of their own.
   * Initialized to 100 for every entrant at session start (`startTournament`
   * / `startSiblingSession`); updated for both sides of every match
   * `resolveRound` simulates, and for the human's own
   * opponent in `advanceTournament`. Never read or written for the human
   * themself — that's `humanEnergyCarry`. */
  entrantEnergyCarry: Map<string, number>;
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
  /** every round of the tournament, oldest first — see {@link RoundRecord}.
   * `resolveRound` appends every round, including `finishAllRemainingGroups`'
   * mop-up of groups the human isn't in, so a completed session's `history`
   * covers the whole bracket, not just the human's own path. */
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
  // defs holds every division of the event for BOTH genders — narrow to the
  // human's own gender's defs before doing anything division-shaped with them
  const genderDefs = defs.filter((d) => d.gender === human.identity.gender);
  if (genderDefs.length === 0) {
    throw new Error(`No "${human.identity.gender}" division found for event ${defs[0]?.eventId} (content-authoring gap)`);
  }
  const tierDivisions = tierDivisionsFor(genderDefs[0]!.tier, human.identity.gender);

  const samePool = state.players
    .filter((p) => p.identity.gender === human.identity.gender)
    .map((p) => ({ id: p.identity.id, firPoints: p.firPoints, skill: combinedRating(p), nationality: p.identity.nationality }));
  const assignments = divisionAssignments(samePool, tierDivisions, {
    hostCountry: genderDefs[0]!.country,
    count: BALANCE.tournament.hostWildcardsToTopDivision,
  });
  const ownDivision = divisionOf(assignments, human.identity.id);
  const ownIndex = tierDivisions.indexOf(ownDivision);

  // tierDivisions is ordered toughest (index 0, "A") to easiest (last) — the
  // human's own band and everything tougher, own division first
  const playableDivisions = tierDivisions.slice(0, ownIndex + 1).reverse();
  return playableDivisions.map((division) => {
    const def = genderDefs.find((d) => d.division === division);
    if (!def) throw new Error(`No "${division}" division found for event ${genderDefs[0]!.eventId} (content-authoring gap)`);
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

/**
 * The four registration waves a division's field fills in over, oldest
 * first: the week the tournament-director invite email actually goes out
 * (`systems/inbox.ts`'s `addInvitations` computes the identical week), one
 * week later, the human's own entry deadline (`entryDeadlineWeeks` before
 * the event — real racketlon players often don't commit until close to
 * their own deadline either), and finally the tournament's own week itself
 * — the late rush that fills in only after the human's own entry window has
 * already closed. Roughly a quarter of the field lands in each wave (see
 * `projectedFieldAsOf`); before the first checkpoint, nobody's registered
 * yet.
 */
function registrationCheckpoints(weekIndex: number): [number, number, number, number] {
  const deadlineWeek = weekIndex - BALANCE.tournament.entryDeadlineWeeks;
  const inviteWeek = deadlineWeek - BALANCE.inbox.inviteLeadWeeks;
  return [inviteWeek, inviteWeek + 1, deadlineWeek, weekIndex];
}

/**
 * `projectedField`, narrowed to only the entrants who'd realistically have
 * registered by `asOfWeek` — the Tour screen's "who's in so far" view for a
 * tournament that hasn't happened yet. The *eventual* field (who actually
 * shows up once the event is played) is always `projectedField`'s full,
 * unfiltered result — this only controls how much of it is visible ahead of
 * time, so a tournament months away doesn't misleadingly look fully booked
 * the moment its invite lands.
 *
 * Each entrant is assigned to one of `registrationCheckpoints`' four waves
 * by a dedicated shuffle (a separate RNG stream from the field draw itself,
 * so "who registers early" doesn't correlate with "who got sampled from a
 * nearby country") — quartering a shuffled order rather than rolling each
 * entrant independently, so a small field still reads as a real quarter-by
 * quarter fill-in instead of a lumpy, possibly-empty first wave.
 */
export function projectedFieldAsOf(
  state: GameState,
  def: TournamentDef,
  weekIndex: number,
  content: ContentBundle,
  asOfWeek: number,
): Player[] {
  const field = projectedField(state, def, weekIndex, content);
  const checkpoints = registrationCheckpoints(weekIndex);
  const rng = new Rng(childSeed(state.seed, "tournament", weekIndex, def.id, "registration"));
  const shuffled = shuffle(field, rng);
  const waveOf = new Map<string, number>();
  shuffled.forEach((p, i) => {
    const wave = Math.min(3, Math.floor((i * 4) / shuffled.length));
    waveOf.set(p.identity.id, checkpoints[wave]!);
  });
  return field.filter((p) => waveOf.get(p.identity.id)! <= asOfWeek);
}

/**
 * The full `def.fieldSize`-length weighted sample for a division, computed
 * once and locked into `state.career.lockedFields` the first time it's
 * needed. Every later call for the same `(weekIndex, def.id)` — a spectator
 * preview browsed earlier, a registration-wave check, or the tournament
 * actually starting, in whatever order they happen to occur — reuses that
 * same locked list instead of re-deriving the pool from `state.players`'
 * live, still-drifting ratings. See `lockedFields`' doc comment on `Career`
 * for the bug this fixes.
 */
function lockDivisionField(
  state: GameState,
  def: TournamentDef,
  weekIndex: number,
  content: ContentBundle,
): string[] {
  const alreadyLocked = state.career.lockedFields[weekIndex]?.[def.id];
  if (alreadyLocked) return alreadyLocked;

  const rng = new Rng(childSeed(state.seed, "tournament", weekIndex, def.id));
  const tierDivisions = tierDivisionsFor(def.tier, def.gender);
  const sameGender = state.players.filter((p) => p.identity.gender === def.gender);
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
  if (pool.length < def.fieldSize) {
    throw new Error(
      `Not enough tier-1 ${def.gender} players in division ${def.division} ` +
        `(${pool.length}) for a ${def.fieldSize}-player draw`,
    );
  }
  const sampled = weightedSampleWithoutReplacement(
    rng,
    pool,
    (p) => entryWeight(content, p.identity.nationality, def),
    def.fieldSize,
  );
  const ids = sampled.map((p) => p.identity.id);
  (state.career.lockedFields[weekIndex] ??= {})[def.id] = ids;
  return ids;
}

function sampleDivisionField(
  state: GameState,
  def: TournamentDef,
  weekIndex: number,
  content: ContentBundle,
  needed: number,
): Player[] {
  const ids = lockDivisionField(state, def, weekIndex, content);
  return ids.slice(0, needed).map((id) => getPlayer(state, id));
}

export function pickEntrants(state: GameState, def: TournamentDef, weekIndex: number, content: ContentBundle): Player[] {
  const human = getPlayer(state, state.career.playerId);
  return [human, ...projectedField(state, def, weekIndex, content)];
}

/**
 * Seeds entrants by Glicko rating (what a real seeding committee would see,
 * not hidden true skill) into fixed bracket positions, using the real-world
 * draw convention: only the top 4 rated entrants get a structurally
 * protected slot — seed 1 anchors position 0 (top), seed 2 the last position
 * (bottom), so they can only meet in the final. Seeds 3 and 4 anchor the two
 * central positions (so each can only meet 1 or 2 in the semifinal), with a
 * coin flip deciding which of the pair lands on which side — same as a real
 * draw ceremony, where the specific slot isn't rating-determined. Every
 * other entrant (rank 5 and below) is shuffled blind into whatever slots are
 * left, exactly like an unseeded real-world draw: no further protection.
 */
export function seedBracket(entrants: Player[], fieldSize: FieldSize, rngSeed: string): string[] {
  const rng = new Rng(rngSeed);
  const sorted = [...entrants].sort((a, b) => combinedRating(b) - combinedRating(a));
  const positions = new Array<Player | undefined>(fieldSize);

  positions[0] = sorted[0];
  positions[fieldSize - 1] = sorted[1];

  const mid = fieldSize / 2;
  const [thirdSeed, fourthSeed] = [sorted[2], sorted[3]];
  const [upper, lower] = rng.chance(0.5) ? [thirdSeed, fourthSeed] : [fourthSeed, thirdSeed];
  positions[mid - 1] = upper;
  positions[mid] = lower;

  const rest = shuffle(sorted.slice(4), rng);
  let next = 0;
  for (let pos = 0; pos < fieldSize; pos++) {
    if (positions[pos] === undefined) positions[pos] = rest[next++];
  }

  return positions.map((p) => p!.identity.id);
}

/** Each entrant's seed rank (1 = top-rated), by the same Glicko sort as
 * `seedBracket` — the number a seeding committee would print next to a name. */
function seedRanks(entrants: Player[]): Map<string, number> {
  const sorted = [...entrants].sort((a, b) => combinedRating(b) - combinedRating(a));
  return new Map(sorted.map((p, i) => [p.identity.id, i + 1]));
}

/** The real seeded bracket for an event that hasn't been played yet — the
 * top seeds and the human's actual round-1 opponent, computed the exact same
 * way `startTournament` will (same `pickEntrants`/`seedBracket` call chain,
 * same seed formula) so the two can never disagree. Only ever writes
 * `state.career.lockedFields` (via `pickEntrants`/`sampleDivisionField`,
 * locking the entrant pool in place the first time it's needed — see
 * `lockedFields`' doc comment on `Career` — so a draw browsed ahead of time
 * can't show different entrants than the one actually played), never any
 * gameplay-affecting state (money, ratings, entries). Used by the inbox's
 * draw-announcement email (systems/inbox.ts) so it can name real seeds and a
 * real opponent instead of hedging with "possible" ones. */
export interface DrawPreview {
  seeds: DrawPlayerView[];
  /** null only if the human isn't actually in this field (shouldn't happen
   * for a def the human is entered in) */
  humanOpponent: DrawPlayerView | null;
}

export function previewDraw(
  state: GameState,
  def: TournamentDef,
  weekIndex: number,
  content: ContentBundle,
): DrawPreview {
  const rngSeed = childSeed(state.seed, "tournament", weekIndex, def.id);
  const entrants = pickEntrants(state, def, weekIndex, content);
  const bracketBySeed = seedBracket(entrants, def.fieldSize, childSeed(rngSeed, "seedBracket"));
  const seedByPlayerId = seedRanks(entrants);
  const maxSeed = seededCount(def.fieldSize);

  const seeds = [...seedByPlayerId.entries()]
    .filter(([, rank]) => rank <= maxSeed)
    .sort((a, b) => a[1] - b[1])
    .map(([id, rank]) => drawPlayerView(state, id, rank));

  const humanIdx = bracketBySeed.indexOf(state.career.playerId);
  const opponentIdx = humanIdx === -1 ? -1 : humanIdx % 2 === 0 ? humanIdx + 1 : humanIdx - 1;
  const opponentId = opponentIdx === -1 ? undefined : bracketBySeed[opponentIdx];
  const humanOpponent = opponentId ? drawPlayerView(state, opponentId, seedByPlayerId.get(opponentId)) : null;

  return { seeds, humanOpponent };
}

/**
 * A "the draw is out" bracket-shaped preview of round 1 only, for a
 * tournament that hasn't started yet — same seeding pipeline as
 * `previewDraw`/`startTournament` (`seedBracket`), so it can never disagree
 * with the real bracket once entered. Deliberately never calls
 * `resolveRound`/`simulateMatchAuto`: every `winnerId` here is null and every
 * `sets` is undefined, even for AI-vs-AI pairs that could technically be
 * simulated already — revealing a result before the event has actually
 * started would spoil "the draw" as a real preview. Later rounds aren't
 * included at all: who plays round 2 depends on round-1 results (including
 * the human's) that don't exist yet. Only ever writes `state.career.lockedFields`,
 * same as `previewDraw` — never any gameplay-affecting state.
 *
 * `entrants` is supplied by the caller rather than resolved here — pass
 * `pickEntrants`'s result when the human genuinely belongs in this bracket
 * (registered, or still eligible to register), or `fullDivisionField`'s when
 * they don't, so a tournament the human never entered never shows them as a
 * participant (see `Game.previewTournamentDraw`).
 */
export function previewFirstRoundDraw(
  state: GameState,
  def: TournamentDef,
  weekIndex: number,
  entrants: Player[],
): DrawRound[] {
  const rngSeed = childSeed(state.seed, "tournament", weekIndex, def.id);
  const bracketBySeed = seedBracket(entrants, def.fieldSize, childSeed(rngSeed, "seedBracket"));
  const seedByPlayerId = seedRanks(entrants);
  const maxSeed = seededCount(def.fieldSize);
  const seedOf = (id: string): number | undefined => {
    const rank = seedByPlayerId.get(id);
    return rank !== undefined && rank <= maxSeed ? rank : undefined;
  };

  const matchups: DrawMatchup[] = roundPairs(bracketBySeed).map(([a, b]) => ({
    a: drawPlayerView(state, a, seedOf(a)),
    b: drawPlayerView(state, b, seedOf(b)),
    winnerId: null,
    isYouA: a === state.career.playerId,
    isYouB: b === state.career.playerId,
  }));

  return [
    {
      round: 0,
      sections: [
        {
          isMainDraw: true,
          roundName: drawRoundName(def.fieldSize, true, 1, def.fieldSize),
          positionFrom: 1,
          positionTo: def.fieldSize,
          matchups,
        },
      ],
    },
  ];
}

function roundPairs(participants: string[]): Array<[string, string]> {
  const pairs: Array<[string, string]> = [];
  for (let i = 0; i < participants.length; i += 2) {
    pairs.push([participants[i]!, participants[i + 1]!]);
  }
  return pairs;
}

/**
 * One entrant's between-round energy carry: whatever they had left at the
 * end of their last match, plus a flat recovery scaled by their own
 * Endurance (`BALANCE.tournament.energyRecoveryBetweenRounds` ×
 * `enduranceRecoveryMult`), capped at 100 — a partial top-up, never a full
 * reset. The single source of truth for both `session.humanEnergyCarry` and
 * `session.entrantEnergyCarry`, so every entrant recovers by the same rule.
 */
function carryEnergy(leftover: number, endurance: number): number {
  return Math.min(100, leftover + BALANCE.tournament.energyRecoveryBetweenRounds * enduranceRecoveryMult(endurance));
}

/**
 * Resolves every pair of the current round across every still-active group
 * (skipping any already-decided group — see {@link isDecided}), except the
 * human's own pair, which becomes the session's `pendingMatch` for the UI to
 * play interactively. Pair seeding uses a single round-global counter (not
 * per-group) so results stay identical to the pre-monrad pairing order for
 * round 0, and remain fully deterministic for a given seed thereafter.
 *
 * Called by `startTournament` at round 0 and `advanceTournament` after a
 * split, always with the human's own group NOT yet decided, so a
 * `pendingMatch` is always produced there. Also called by
 * `finishAllRemainingGroups` to mop up every other group once the human's
 * own result IS already decided (and thus excluded from `session.groups`)
 * — there, the human branch below simply never fires and `pendingMatch`
 * stays whatever it already was.
 */
/** True if `player` can't take the court this pairing — already withdrawn
 * from this tournament (an earlier retirement), or carrying a match-blocking
 * injury/illness from training or an even earlier week. Checked before every
 * pairing is resolved so a walkover cascades through every remaining round,
 * not just the one it first happened in. */
function isUnavailable(session: TournamentSession, player: Player): boolean {
  return session.withdrawnEntrants.has(player.identity.id) || player.condition.injury !== null;
}

/**
 * Turns a fresh match-time retirement into a real `Injury` on the retired
 * player — a no-op if they're already carrying one (a pre-existing-injury
 * walkover, not a new retirement: `sport` is null in that case too, since
 * `rollMatchInjuryRiskAtBreak` never ran). Weighted-picks the catalog entry
 * by the sport just played, the same way the weekly training-load roll
 * picks by the week's dominant sport (see systems/injury.ts's
 * `pickInjuryDef`) — deterministic off the match's own seed, so a replay
 * produces the same injury.
 */
function applyMatchRetirementInjury(
  state: GameState,
  session: TournamentSession,
  playerId: string,
  sport: Sport | null,
  matchSeed: string,
): void {
  const player = getPlayer(state, playerId);
  if (player.condition.injury !== null || sport === null) return;
  const rng = new Rng(childSeed(matchSeed, "injuryPick"));
  const def = pickInjuryDef(session.content, rng, sport);
  if (!def) return; // content gap: no injuries defined
  const severity = pickMatchInjurySeverity(rng, def);
  const weeksRemaining = pickInjuryDuration(rng, def, severity);
  player.condition.injury = {
    catalogId: def.id,
    kind: "injury",
    cause: sport,
    severity,
    weeksRemaining,
    startWeek: session.weekIndex,
  };
}

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
        m.energy.b = session.entrantEnergyCarry.get(opponent.identity.id) ?? 100;
        // the human's own entry is blocked while injured (see facade.ts's
        // enterTournament), so only the opponent needs checking here — an
        // opponent who withdrew earlier this same tournament, or who
        // carries an injury from training/an earlier week.
        if (isUnavailable(session, opponent)) {
          m.phase = "finished";
          m.retiredSide = "b";
          m.winner = "a";
        }
        session.pendingMatch = m;
        session.pendingGroupIndex = groupIndex;
        session.pendingPairIndexInGroup = pairIndexInGroup;
        return { a, b, winner: null };
      }
      const pa = getPlayer(state, a);
      const pb = getPlayer(state, b);
      const m = createMatch(ref(pa), ref(pb), seed);
      m.energy.a = session.entrantEnergyCarry.get(a) ?? 100;
      m.energy.b = session.entrantEnergyCarry.get(b) ?? 100;
      if (isUnavailable(session, pa)) {
        m.phase = "finished";
        m.retiredSide = "a";
        m.winner = "b";
      } else if (isUnavailable(session, pb)) {
        m.phase = "finished";
        m.retiredSide = "b";
        m.winner = "a";
      }
      simulateMatchAuto(m); // a no-op if already pre-finished above
      if (m.retiredSide) {
        const retiredId = m.retiredSide === "a" ? a : b;
        const winnerId = m.retiredSide === "a" ? b : a;
        applyMatchRetirementInjury(state, session, retiredId, m.retiredSport, seed);
        session.withdrawnEntrants.add(retiredId);
        session.entrantEnergyCarry.set(a, carryEnergy(m.energy.a, pa.attributes.endurance));
        session.entrantEnergyCarry.set(b, carryEnergy(m.energy.b, pb.attributes.endurance));
        return { a, b, winner: winnerId, sets: m.sets.map((s) => ({ a: s.a, b: s.b })), walkover: true };
      }
      recordMatchResults(session.resultsBook, m);
      session.entrantEnergyCarry.set(a, carryEnergy(m.energy.a, pa.attributes.endurance));
      session.entrantEnergyCarry.set(b, carryEnergy(m.energy.b, pb.attributes.endurance));
      return { a, b, winner: m.winner === "a" ? a : b, sets: m.sets.map((s) => ({ a: s.a, b: s.b })) };
    });
  });

  session.history.push({ round, groups: session.groups, pairs: session.roundPairs });
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
 *
 * One exemption from that cap: the losers of the true semifinal (the size-4
 * group split off an undefeated lineage) are always the bronze-medal
 * contenders for 3rd/4th place, and always get that match regardless of how
 * many games it costs them — a podium needs a real bronze match, the same
 * way it needs a real final, not a tied 3rd/4th band. For an 8-field draw
 * this happens to fall within the ordinary 3-game cap anyway; for 16+ it
 * would not, without this exemption. It never cascades: this group has only
 * 2 participants (one pair), so once it plays, both resulting sub-groups are
 * single players and already decided regardless of `frozen`.
 */
function buildNextGroups(groups: Group[], roundPairsByGroup: (RoundPair[] | null)[]): Group[] {
  return groups.flatMap((group, i): Group[] => {
    const pairs = roundPairsByGroup[i];
    if (!pairs) return [group];
    const gamesPlayed = group.gamesPlayed + 1;
    const isTrueSemifinal = group.undefeated && group.participants.length === 4;
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
      frozen: isTrueSemifinal ? false : gamesPlayed >= 3,
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
 * (see the module doc comment), and so `session.history` ends up with a
 * complete bracket (through the real Final) even though the human's own
 * tournament ended earlier. Reuses `resolveRound` itself (not a separate
 * "auto" variant) — its human branch simply never fires here, since the
 * human's own group is already decided and thus excluded from the active
 * groups it resolves.
 */
function finishAllRemainingGroups(state: GameState, session: TournamentSession): void {
  let guard = 0;
  while (session.groups.some((g) => !isDecided(g)) && ++guard <= session.totalRounds + 1) {
    resolveRound(state, session);
    session.groups = buildNextGroups(session.groups, session.roundPairs!);
    session.currentRound += 1;
  }
}

/**
 * Records this concluded tournament into every entrant's `recentResults`
 * *and* `pendingFirResults`, and applies the session's Glicko-2 rating
 * period — called exactly once, at the moment every group in `session` is
 * decided (the human's own session right after `finishAllRemainingGroups`;
 * a sibling or fully-AI world session the instant `isSiblingConcluded` first
 * turns true). Walks `session.groups` in bracket-position order, same as
 * `groupStartPosition` uses for the human's own `finishingPosition` in
 * `concludeTournament`, so every entrant — not just the human — gets an
 * accurate placement, a `matchesPlayed` count (`Group.gamesPlayed`, final by
 * construction once a group is decided), and FIR ranking points via
 * `rankingPointsFor` (the same Points Matrix lookup `concludeTournament` uses
 * for the human, generalized to the whole field — NPCs previously never
 * earned any in-game points at all, only carrying their frozen real-world
 * `firPoints` snapshot).
 *
 * FIR ranking points land in `pendingFirResults`, not `firResults` — real
 * federations batch a month's results and publish them together on the 1st
 * of the next month, they don't update live the instant a tournament ends.
 * `systems/ranking-points.ts`'s `publishPendingFirResults` moves them into
 * the real ledger on the next calendar-month crossing (see
 * `orchestrator.ts`'s `simulateWeek`). `recentResults` (the human-visible
 * "you played this, here's how it went" placement history) is unaffected —
 * that lands immediately, same as always.
 *
 * `applyTournamentRatings` is called here too, not just for the human's own
 * session — every entrant's Glicko rating is updated from the sets they
 * actually played this event, same as the human's, and *immediately* (a
 * seeding-relevant strength estimate has no reason to wait the way official
 * ranking points do). Before this, a sibling or world-only session's NPCs
 * earned FIR points but their ratings stayed frozen at whatever they were
 * before the event started, since nothing ever applied their `resultsBook`.
 * Only logs a `ranking.moved` event for `state.career.playerId` (see
 * `applyTournamentRatings`), so this is a no-op for the log on any session
 * the human isn't actually in.
 */
function recordEntrantResults(state: GameState, session: TournamentSession, log: EventLog): void {
  let offset = 0;
  for (const group of session.groups) {
    const finishingPosition = offset + 1;
    offset += group.participants.length;
    const tiedCount = group.participants.length;
    const rankingPoints = rankingPointsFor(
      session.def.tier,
      session.def.division,
      finishingPosition,
      session.def.fieldSize,
      session.rankingMatrix,
    );
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
      player.pendingFirResults.push({
        weekIndex: session.weekIndex,
        tournamentId: session.def.id,
        tier: session.def.tier,
        points: rankingPoints,
      });
    }
  }
  applyTournamentRatings(state, session.resultsBook, session.ratingsSnapshot, state.career.playerId, session.weekIndex, log);
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
  const bracketBySeed = seedBracket(entrants, def.fieldSize, childSeed(rngSeed, "seedBracket"));
  const seedByPlayerId = seedRanks(entrants);
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
    content,
    withdrawnEntrants: new Set(),
    bracketBySeed,
    seedByPlayerId,
    currentRound: 0,
    groups: [{ participants: bracketBySeed, undefeated: true, gamesPlayed: 0, frozen: false }],
    roundPairs: null,
    pendingMatch: null,
    pendingGroupIndex: null,
    pendingPairIndexInGroup: null,
    humanEnergyCarry: 100,
    entrantEnergyCarry: new Map(bracketBySeed.map((id) => [id, 100])),
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
 * same reason). It does still write lasting things to `GameState` once
 * concluded — every entrant's placement and Glicko rating update, via
 * `recordEntrantResults` — see `advanceSiblingSession`. Also the entry point
 * for a fully-AI "world" division with no human entrant at all (see
 * `facade.ts`'s weekly world-tournament simulation) — `def`'s gender doesn't
 * need to match the human's own, since `fullDivisionField` samples strictly
 * off `def.gender`.
 */
export function startSiblingSession(
  state: GameState,
  def: TournamentDef,
  weekIndex: number,
  content: ContentBundle,
): TournamentSession {
  const entrants = fullDivisionField(state, def, weekIndex, content);
  const rngSeed = childSeed(state.seed, "tournament", weekIndex, def.id);
  const bracketBySeed = seedBracket(entrants, def.fieldSize, childSeed(rngSeed, "seedBracket"));
  const seedByPlayerId = seedRanks(entrants);
  const totalRounds = Math.log2(def.fieldSize);

  const session: TournamentSession = {
    def,
    weekIndex,
    seed: rngSeed,
    humanId: NO_HUMAN_ID,
    content,
    withdrawnEntrants: new Set(),
    bracketBySeed,
    seedByPlayerId,
    currentRound: 0,
    groups: [{ participants: bracketBySeed, undefeated: true, gamesPlayed: 0, frozen: false }],
    roundPairs: null,
    pendingMatch: null,
    pendingGroupIndex: null,
    pendingPairIndexInGroup: null,
    humanEnergyCarry: 0,
    entrantEnergyCarry: new Map(bracketBySeed.map((id) => [id, 100])),
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
export function advanceSiblingSession(state: GameState, session: TournamentSession, log: EventLog): void {
  if (isSiblingConcluded(session)) return;
  session.groups = buildNextGroups(session.groups, session.roundPairs!);
  session.currentRound += 1;
  if (isSiblingConcluded(session)) {
    recordEntrantResults(state, session, log);
    return;
  }
  resolveRound(state, session);
}

/**
 * Fast-forwards a sibling session straight to conclusion — used once the
 * human's own tournament ends, so a sibling division that had more rounds
 * left (a bigger draw, or one simply behind on pacing) still reaches a real
 * final result instead of freezing mid-bracket. Also the way a fully-AI
 * "world" division (no human entrant at all) is played out headlessly in one
 * call — see `facade.ts`'s weekly world-tournament simulation.
 */
export function finishSiblingSession(state: GameState, session: TournamentSession, log: EventLog): void {
  let guard = 0;
  while (!isSiblingConcluded(session) && ++guard <= session.totalRounds + 1) {
    advanceSiblingSession(state, session, log);
  }
}


function sorenessGainForMatch(player: Player, age: number, energySpent: number): number {
  const b = BALANCE.tournament;
  const ageBonus = age <= b.sorenessAgeFrom ? 0 : Math.min(b.sorenessAgeCap, (age - b.sorenessAgeFrom) * b.sorenessAgePerYear);
  const coreProtection = 1 - player.attributes.coreStrength * b.coreStrengthSorenessProtection;
  const durabilityProtection = 1 - player.attributes.durability * b.durabilitySorenessProtection;
  return (b.sorenessPerMatch + Math.max(0, energySpent) * b.sorenessPerEnergySpent) * (1 + ageBonus) * coreProtection * durabilityProtection;
}

/**
 * Concludes the tournament once the human's own group is decided. `prize`
 * still indexes off `roundsWon` (total matches won, not exact position) — a
 * deliberate simplification: two different placement paths can share a win
 * count (e.g. one tied band's winners and another band entirely can both
 * have 2 wins), and both draw the same `prizeByRoundsWon[2]`. Ranking points,
 * by contrast, use `finishingPosition` exactly (the tied band's *best*
 * position, per FIR convention), since that's what the Points Matrix is
 * keyed on. The ledger entry — and the whole session's Glicko rating
 * update — is written by `recordEntrantResults` (called just before this,
 * for every entrant including the human); `rankingPoints` is only
 * recomputed here for the return value and log event.
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

  // Real match play sharpens tournament readiness in every sport — a match
  // is always all four sports (see match/engine.ts) — better than a single
  // training session, since it's the real thing. `session.currentRound` has
  // already been incremented once per human match played this session (see
  // `advanceTournament`), so at conclusion it's exactly the match count.
  // Also clears the neglect streak so this week's later `TrainingSystem`
  // pass doesn't immediately start re-accruing decay on top of the boost.
  const matchesPlayed = session.currentRound;
  const formGain = matchesPlayed * BALANCE.form.matchPlayGainPerRound;
  for (const sport of SPORTS) {
    human.condition.formBySport[sport] = clamp(human.condition.formBySport[sport] + formGain, 0, BALANCE.form.max);
    human.condition.neglectWeeks[sport] = 0;
  }

  const rankingPoints = rankingPointsFor(
    session.def.tier,
    session.def.division,
    finishingPosition,
    session.def.fieldSize,
    session.rankingMatrix,
  );

  const won = finishingPosition === 1;
  log.push({
    week: session.weekIndex,
    type: won ? "tournament.won" : "tournament.eliminated",
    subject: session.humanId,
    data: {
      name: session.def.name,
      tournamentId: session.def.id,
      division: session.def.division,
      tier: session.def.tier,
      roundsWon,
      totalRounds: session.totalRounds,
      prizeMoney: prize,
      finishingPosition,
      rankingPoints,
      tiedCount,
    },
  });

  // Ratings are already applied by `recordEntrantResults`, called just
  // before this (see `advanceTournament`) — not repeated here.

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
  const energySpent = Math.max(0, spent);
  session.cumulativeEnergySpent += energySpent;
  const human = getPlayer(state, session.humanId);
  const age = ageOn(state.calendar.mondayISO, human.identity.birthDate);
  human.condition.soreness = clamp(human.condition.soreness + sorenessGainForMatch(human, age, energySpent), 0, 100);
  human.condition.sorenessStartedWeek = session.weekIndex;
  // A walkover (either side already unavailable, or a fresh mid-match
  // retirement) isn't a competitive result — real sports exclude retirements
  // from rating calculations, so skip feeding it into this tournament's
  // Glicko-2 rating period.
  if (finishedMatch.retiredSide === null) recordMatchResults(session.resultsBook, finishedMatch);

  // Every completed set is a scouting look at this specific opponent in this
  // specific sport — see model/sport.ts's `levelRangeWidthForFamiliarity`,
  // which reads this count to tighten their fuzzed level band on the
  // opponent profile screen. A set the match ended early without reaching
  // (`!done`) teaches nothing, so it doesn't count.
  const opponentId = finishedMatch.players.b.id;
  const opponent = getPlayer(state, opponentId);

  if (finishedMatch.retiredSide !== null) {
    const retiredId = finishedMatch.retiredSide === "a" ? session.humanId : opponentId;
    applyMatchRetirementInjury(state, session, retiredId, finishedMatch.retiredSport, finishedMatch.seed);
    session.withdrawnEntrants.add(retiredId);
  }

  const h2h = (state.career.headToHeadSets[opponentId] ??= {});
  finishedMatch.sets.forEach((set, i) => {
    if (!set.done) return;
    const sport = SPORTS[i]!;
    h2h[sport] = (h2h[sport] ?? 0) + 1;
  });

  // The stage name (e.g. "Quarterfinal", "5th Place Match") for the round the
  // human just played — `session.groups` is still the pre-split "entering
  // this round" snapshot here (`buildNextGroups`/`currentRound += 1` haven't
  // run yet), the exact same shape `drawRounds` reconstructs stage names
  // from, so this can never disagree with the draw view.
  const hgiBeforeSplit = humanGroupIndex(session);
  const humanGroupBeforeSplit = session.groups[hgiBeforeSplit]!;
  const groupSize = humanGroupBeforeSplit.participants.length;
  const positionFrom = groupStartPosition(session.groups, hgiBeforeSplit);
  const positionTo = positionFrom + groupSize - 1;
  const roundName = drawRoundName(groupSize, humanGroupBeforeSplit.undefeated, positionFrom, positionTo);

  // the opponent's real FIR World Ranking rank at the moment this match was
  // played (null if they had no counted result yet) — a snapshot, since the
  // opponent's own standing keeps moving after this; backs the Me screen's
  // "highest ranked player beaten" record (see facade.ts's `records`).
  const opponentRank =
    firWorldRanking(state, opponent.identity.gender).find((r) => r.playerId === opponentId)?.rank ?? null;
  // the opponent's per-sport Glicko-2 rating at the moment this match was
  // played — same snapshot rationale as `opponentRank`, backs the "best
  // player ever faced" per-sport record.
  const opponentRatings: Record<Sport, number> = {
    tt: Math.round(opponent.ratings.tt.rating),
    bd: Math.round(opponent.ratings.bd.rating),
    sq: Math.round(opponent.ratings.sq.rating),
    tn: Math.round(opponent.ratings.tn.rating),
  };

  // one entry per individual match the human plays (not just the eventual
  // tournament placement) — the Me screen's "recent matches" list (see
  // facade.ts's `recentMatches`) mines these out of the log rather than a
  // persisted per-player ledger, since it's a human-only, display-only view.
  log.push({
    week: session.weekIndex,
    type: "match.played",
    subject: session.humanId,
    data: {
      tournamentId: session.def.id,
      tournamentName: session.def.name,
      // tour tier badge (e.g. "CHA", "IWT") — the Me screen's Records tab
      // uses this alongside tournamentName/week for a compact tournament label
      tier: session.def.tier,
      round: session.currentRound + 1,
      totalRounds: session.totalRounds,
      roundName,
      opponentId: finishedMatch.players.b.id,
      opponentName: finishedMatch.players.b.name,
      opponentRank,
      opponentRatings,
      won: humanWon,
      // `done` is false for a set an early finish cut short mid-play (see
      // match/engine.ts's `playPoint`) — its a/b score is a real snapshot but
      // not a completed contest, so consumers of this must not treat it as a
      // decisive per-sport result (see facade.ts's `records`).
      sets: finishedMatch.sets.map((s) => ({ a: s.a, b: s.b, done: s.done })),
      gummiarm: finishedMatch.gummiarm,
      walkover: finishedMatch.retiredSide !== null,
    },
  });

  const pair = session.roundPairs![session.pendingGroupIndex!]![session.pendingPairIndexInGroup!]!;
  pair.winner = humanWon ? session.humanId : finishedMatch.players.b.id;
  pair.walkover = finishedMatch.retiredSide !== null;
  // The human always plays as match side "a", but `pair` keeps its players in
  // bracket order — so flip the set scores into pair.a/pair.b orientation when
  // the human is actually the second-listed bracket participant.
  const humanIsPairA = pair.a === finishedMatch.players.a.id;
  pair.sets = finishedMatch.sets.map((s) =>
    humanIsPairA ? { a: s.a, b: s.b } : { a: s.b, b: s.a },
  );
  session.pendingMatch = null;
  session.pendingGroupIndex = null;
  session.pendingPairIndexInGroup = null;

  if (humanWon) session.roundsWon += 1;
  session.humanEnergyCarry = carryEnergy(finishedMatch.energy.a, human.attributes.endurance);
  session.entrantEnergyCarry.set(
    opponent.identity.id,
    carryEnergy(finishedMatch.energy.b, opponent.attributes.endurance),
  );

  session.groups = buildNextGroups(session.groups, session.roundPairs!);
  session.currentRound += 1;

  const hgi = humanGroupIndex(session);
  const humanGroup = session.groups[hgi]!;

  if (isDecided(humanGroup)) {
    const finishingPosition = groupStartPosition(session.groups, hgi);
    const tiedCount = humanGroup.participants.length;
    finishAllRemainingGroups(state, session);
    recordEntrantResults(state, session, log);
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
  /** seed rank (1 = top seed), present only for players high enough to be
   * seeded in this field (roughly the top quarter) — undefined otherwise */
  seed?: number;
}

/** One pairing in a draw round. `winnerId` is null only for the human's own
 * not-yet-played match this round. */
export interface DrawMatchup {
  a: DrawPlayerView;
  b: DrawPlayerView;
  winnerId: string | null;
  isYouA: boolean;
  isYouB: boolean;
  /** the four set scores (TT→BD→SQ→TN order) — undefined for the human's own
   * match until they've played it */
  sets?: { a: number; b: number }[];
  /** true when this pairing was a walkover — a match-blocking injury/illness
   * ended it early or meant it was never really contested — see
   * `RoundPair.walkover` */
  walkover?: boolean;
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

/** "1st"/"2nd"/"3rd"/"4th"/… — English ordinal suffix, with the 11-13 teens
 * exception (11th, 12th, 13th, not "11st" etc). */
function ordinal(n: number): string {
  const teens = n % 100;
  if (teens >= 11 && teens <= 13) return `${n}th`;
  switch (n % 10) {
    case 1:
      return `${n}st`;
    case 2:
      return `${n}nd`;
    case 3:
      return `${n}rd`;
    default:
      return `${n}th`;
  }
}

/**
 * A draw section's display name. The main draw always plays for real places
 * 1st/2nd, so it keeps the classic stage names (Final/Semifinal/…) regardless
 * of the overall field size. A plate section instead names itself after the
 * positions it's actually contesting: once it's down to a single decisive
 * pair (`groupSizeEnteringRound === 2`) that's "{Nth} Place Match" (3rd is the
 * Bronze Medal Match); while it's still multiple pairs away from that, it's a
 * "Playoff for {from}th–{to}th" — the position range already shown alongside
 * it as a badge, spelled out as a name.
 */
function drawRoundName(groupSizeEnteringRound: number, isMainDraw: boolean, positionFrom: number, positionTo: number): string {
  if (isMainDraw) {
    return groupSizeEnteringRound === 2
      ? "Final"
      : groupSizeEnteringRound === 4
        ? "Semifinal"
        : groupSizeEnteringRound === 8
          ? "Quarterfinal"
          : `Round of ${groupSizeEnteringRound}`;
  }
  if (groupSizeEnteringRound === 2) {
    return positionFrom === 3 ? "Bronze Medal Match" : `${ordinal(positionFrom)} Place Match`;
  }
  return `Playoff for ${ordinal(positionFrom)}–${ordinal(positionTo)}`;
}

function drawPlayerView(state: GameState, playerId: string, seed: number | undefined): DrawPlayerView {
  const p = getPlayer(state, playerId);
  return { id: playerId, name: fullName(p), nationality: p.identity.nationality, seed };
}

/** How many top entrants carry a printed seed badge — exactly the ranks
 * `seedBracket` structurally protects (1 anchors the top, 2 the bottom, 3/4
 * the two middle slots); everyone past that is genuinely unseeded, not just
 * unlabeled, so there's nothing meaningful to badge. */
function seededCount(fieldSize: FieldSize): number {
  return Math.min(4, fieldSize);
}

/**
 * The bracket/draw the human has played through so far this tournament,
 * oldest round first — reconstructed from `TournamentSession.history`. This
 * is what lets the UI show an actual draw tree (which round, main draw or
 * plate, which position range) rather than just "your next match".
 */
export function drawRounds(state: GameState, session: TournamentSession): DrawRound[] {
  const maxSeed = seededCount(session.def.fieldSize);
  const seedOf = (id: string): number | undefined => {
    const rank = session.seedByPlayerId.get(id);
    return rank !== undefined && rank <= maxSeed ? rank : undefined;
  };
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
        roundName: drawRoundName(groupSize, group.undefeated, positionFrom, positionTo),
        positionFrom,
        positionTo,
        matchups: groupPairs.map((p) => ({
          a: drawPlayerView(state, p.a, seedOf(p.a)),
          b: drawPlayerView(state, p.b, seedOf(p.b)),
          winnerId: p.winner,
          isYouA: p.a === session.humanId,
          isYouB: p.b === session.humanId,
          sets: p.sets,
          walkover: p.walkover,
        })),
      });
    });
    return { round, sections };
  });
}
