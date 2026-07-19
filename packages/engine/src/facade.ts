import { BALANCE } from "./balance.js";
import type { ContentBundle, TraitCategory, TraitTone } from "./content.js";
import type { Calendar } from "./core/date.js";
import { ageOn, dateForWeek, weekLabel, weekLabelAt, yearOfWeek } from "./core/date.js";
import type { EventLog, GameEvent } from "./core/events.js";
import { eventsForWeek } from "./core/events.js";
import type { CompletedDraw, GameState, InboxMessage, PersistedOtherDivisionDraw, TravelBlock } from "./core/state.js";
import { SAVE_VERSION, getPlayer, humanPlayer } from "./core/state.js";
import type { ActivityCounts, PlayerPlan } from "./model/plan.js";
import { countsFromSlots, slotIndex } from "./model/plan.js";
import type { Player } from "./model/player.js";
import { fullName } from "./model/player.js";
import type { WeekSummary } from "./model/summary.js";
import type { Sport } from "./model/sport.js";
import {
  SPORTS,
  SPORT_LABELS,
  levelForSkill,
  levelProgress,
  levelRangeForSkill,
  levelRangeWidthForFamiliarity,
} from "./model/sport.js";
import type { MatchState } from "./match/engine.js";
import { simulateTournamentPreparation, simulateWeek } from "./orchestrator.js";
import { recoveryAgeMultiplier } from "./systems/age.js";
import {
  expectedSessionGain,
  fatigueDeltaFromCounts,
  injuryLoad,
  injuryRiskBucket,
  moneyDeltaFromCounts,
  salaryMultiplier,
} from "./systems/effects.js";
import { publicHolidays } from "./systems/holidays.js";
import { combinedRating } from "./systems/ranking.js";
import { firRacePointsTotal, firWorldRanking } from "./systems/ranking-points.js";
import type { HumanSnapshot } from "./systems/types.js";
import type { TravelCost, TravelDays } from "./systems/travel.js";
import { travelCost, travelDays } from "./systems/travel.js";
import { annualAllowance, vacationDaysUsedBy } from "./systems/vacation.js";
import type {
  DivisionCode,
  DrawRound,
  DrawSection,
  TournamentAdvanceResult,
  TournamentDef,
  TournamentSession,
} from "./tournament/engine.js";
import {
  advanceSiblingSession,
  advanceTournament,
  drawRounds,
  finishSiblingSession,
  fullDivisionField,
  humanDivisionDef,
  humanEligibleDivisions,
  isSiblingConcluded,
  pickEntrants,
  previewFirstRoundDraw,
  projectedFieldAsOf,
  startSiblingSession,
  startTournament,
  tournamentCalendar,
  tournamentForWeek,
} from "./tournament/engine.js";
import type { CharacterDraft } from "./world/factory.js";
import { createPlaceholderWorld } from "./world/factory.js";

/**
 * The only API the UI touches. Exposes bucketed forecasts and view models —
 * exact simulation numbers never leak past this file, so the game can't
 * drift into feeling like a spreadsheet.
 */

/** 0 = no change, 1 = +, 2 = ++, 3 = +++ */
export type GainBucket = 0 | 1 | 2 | 3;
/** −2 = big drop … +2 = big rise */
export type FatigueBucket = -2 | -1 | 0 | 1 | 2;

export interface Forecast {
  sports: Record<Sport, GainBucket>;
  fatigue: FatigueBucket;
  /** expected cash change to the balance THIS week, rounded — spending and
   * living expenses only. Work income doesn't land here anymore; it banks
   * toward `salaryEarned` and pays out on the last week of the month (see
   * systems/economy.ts), so this is usually zero or negative. */
  money: number;
  /** expected addition to the pending salary pot this week, rounded — 0 for
   * an income-free week (e.g. a training camp). Scales with the Career
   * attribute — see `salaryMultiplier`. */
  salaryEarned: number;
  injuryRisk: "low" | "medium" | "high";
}

export interface SportView {
  level: number;
  /** progress toward the next level, 0..1 */
  progress: number;
}

/** Layer-2 view: the Glicko-2 rating estimate + its uncertainty, rounded. */
export interface RatingView {
  rating: number;
  /** rating deviation — how sure the estimate is (lower = more confident) */
  rd: number;
}

/** Layer-3 view: real FIR World Ranking standing — the official competitive
 * ladder (see systems/ranking-points.ts), shown ahead of Glicko since it's
 * what actually determines category placement and bragging rights. Null
 * until the player has a single counted result on file. `rank` is relative
 * to this world's own roster (`content.players` — every mappable player
 * from the scraper, world/factory.ts), which closely tracks the real FIR
 * field but isn't a byte-for-byte mirror of it (a handful of players are
 * skipped for missing country/rating data — see buildBundle.ts). There's no
 * "of N" shown alongside it: the exact roster size is a build-time
 * implementation detail, not something meaningful to surface as if it were
 * an official field count. */
export interface FirStandingView {
  points: number;
  rank: number;
}

export interface InjuryView {
  /** a Sport, or "overuse" when it wasn't attributable to one */
  type: string;
  severity: number;
  weeksRemaining: number;
}

/** The character-creation attributes, banded to the same 1–20 display
 * scale as sport levels — shown on the human's own Me screen, but never on
 * an `OpponentView` (docs/07's information-layer rule stays for opponents). */
export interface AttrsView {
  endurance: number;
  coreStrength: number;
  career: number;
  clutch: number;
  composure: number;
  fastHealer: number;
}

/** A rolled personality trait, resolved from `content.traits` for display —
 * flavor first, per docs/07; own-player only. */
export interface TraitView {
  id: string;
  name: string;
  category: TraitCategory;
  tone: TraitTone;
  description: string;
}

export interface HumanView {
  /** stable identity id — lets the UI tell "this is you" apart from an
   * `OpponentProfileView`'s id without guessing at a magic string */
  id: string;
  name: string;
  age: number;
  nationality: string;
  gender: "m" | "f";
  /** levels 1–20 per sport — the only true-skill-derived numbers a player sees */
  sports: Record<Sport, SportView>;
  /** per-sport Glicko-2 estimate + uncertainty, shown beside the levels */
  ratings: Record<Sport, RatingView>;
  /** combined Glicko-2 across the four sports, rounded */
  combinedRating: number;
  /** real FIR World Ranking standing — null until a counted result exists */
  firStanding: FirStandingView | null;
  /** the five character-creation attributes, banded 1–20 */
  attrs: AttrsView;
  /** rolled personality traits — identity/flavor, shown to the player themself */
  traits: TraitView[];
  fatigue: number;
  soreness: number;
  money: number;
  /** work income banked so far this month, paid out in one lump sum on the
   * last week of the month — see systems/economy.ts */
  pendingSalary: number;
  /** paid-leave days left this calendar year; may be negative (over-drawn) */
  remainingVacationDays: number;
  /** this year's full paid-leave allowance (nationality + age), for "18 / 25" */
  annualVacationDays: number;
  /** 0..20 per sport — see PlayerCondition.formBySport */
  formBySport: Record<Sport, number>;
  confidence: number;
  injury: InjuryView | null;
  /** milestone titles earned (e.g. "champion") */
  titles: string[];
  /** career-high combined Glicko-2 rating */
  bestRating: number;
}

/** One tournament the human has actually played, from the event log. */
export interface TournamentResultView {
  week: number;
  weekLabel: string;
  year: number;
  name: string;
  /** class played, e.g. "A" — most classes carry no prize money (FIR
   * Tournament Regs 3.2 restricts compulsory prize money to the Elite/A
   * class of IWT and up), just medals/trophies at the podium ceremony
   * (3.12.2) — see `Game.trophyCabinet`. */
  division: string;
  roundsWon: number;
  totalRounds: number;
  won: boolean;
  prizeMoney: number;
  /** best position of the tied band this result landed in (1 = champion) */
  finishingPosition: number;
  /** how many entrants share `finishingPosition` — 1 means untied */
  tiedCount: number;
  rankingPoints: number;
}

/** One podium finish (top 3) worth a medal — a `TrophyCabinet` entry. FIR
 * requires a medal/trophy ceremony for the top 3 in every class, regardless
 * of whether that class carries prize money (Tournament Regs 3.12.2), so
 * this exists alongside `TournamentResultView`/`prizeMoney` rather than
 * instead of it: a career can rack up medals in classes that never paid a
 * cent. Derived from the same event log as `careerStats`, filtered to
 * `finishingPosition <= 3`. */
export interface TrophyView {
  week: number;
  weekLabel: string;
  name: string;
  division: string;
  /** 1 = gold, 2 = silver, 3 = bronze */
  medal: 1 | 2 | 3;
  tiedCount: number;
}

/** Aggregated tournament tallies — used for both lifetime and per-year rows. */
export interface StatTotals {
  tournamentsPlayed: number;
  tournamentsWon: number;
  /** reached the final (won or lost it) */
  finalsReached: number;
  prizeMoney: number;
}

export interface YearStats extends StatTotals {
  year: number;
}

/** The statistics hub behind the "Me" screen — everything reconstructed from
 * `Career` state and the append-only event log, so no save format change. */
export interface CareerStatsView {
  weeksPlayed: number;
  lifetime: StatTotals;
  /** best career finish, by finishingPosition (lowest = best); null if none
   * played yet — see {@link TournamentResultView} */
  bestFinish: { finishingPosition: number; tiedCount: number } | null;
  /** per-year breakdown, most recent year first */
  byYear: YearStats[];
  /** every tournament played, most recent first */
  results: TournamentResultView[];
}

/** One set's score within a {@link RecentMatchView} — `sport` names which of
 * the 4 sports it was (fixed order tt/bd/sq/tn, same as `SPORTS`). */
export interface RecentMatchSetView {
  sport: Sport;
  a: number;
  b: number;
  /** false when an early finish (an uncatchable aggregate lead) cut this set
   * short mid-play — see match/engine.ts's `playPoint`. Its a/b score is a
   * real snapshot but not a completed contest, so per-sport win/loss records
   * (`Game.records`) skip sets where this is false. */
  done: boolean;
}

/** One individual match the human has played, newest first — finer-grained
 * than {@link TournamentResultView} (a whole tournament's placement): this
 * is per-opponent, per-round, with the full per-sport set score. Mined from
 * the event log's `match.played` entries (tournament/engine.ts's
 * `advanceTournament`), a human-only, display-only view — not persisted
 * separately, so no save format change. See `Game.recentMatches`. */
export interface RecentMatchView {
  week: number;
  weekLabel: string;
  tournamentName: string;
  /** tour tier badge, e.g. "CHA", "IWT" — see `TournamentDef.tier`. Empty
   * string for matches logged before this field existed. */
  tournamentTier: string;
  round: number;
  totalRounds: number;
  /** the stage this match was actually played for, e.g. "Quarterfinal" or
   * "5th Place Match" — same text as `DrawSection.roundName`. */
  roundName: string;
  opponentId: string;
  opponentName: string;
  /** the opponent's real FIR World Ranking rank at the moment this match was
   * played (a snapshot — their standing keeps moving afterward); null if they
   * had no counted result yet. Backs the "highest ranked player beaten"
   * record — see `Game.records`. */
  opponentRank: number | null;
  /** the opponent's per-sport Glicko-2 rating at the moment this match was
   * played — same snapshot rationale as `opponentRank`. Backs the "best
   * player ever faced" per-sport record. */
  opponentRatings: Record<Sport, number>;
  won: boolean;
  /** total points across all 4 sports — racketlon's real match winner
   * (aggregate points, not sets won); see match/engine.ts's module doc. */
  totalA: number;
  totalB: number;
  sets: RecentMatchSetView[];
  /** true if the match total was tied after all 4 sets and a single
   * sudden-death gummiarm point decided it — see match/engine.ts's module
   * doc. Backs the Me screen's gummiarm tally. */
  gummiarm: boolean;
}

/** One opponent's tally of matches played against the human, most-played
 * first — the Me screen's "Most played opponents" card. Mined from the same
 * `match.played` log entries as `RecentMatchView`; distinct from
 * `state.career.headToHeadSets` (which counts completed sets per sport, for
 * opponent-scouting familiarity, not a match count). See
 * `Game.mostPlayedOpponents`. */
export interface OpponentMatchCountView {
  opponentId: string;
  opponentName: string;
  matches: number;
  wins: number;
}

/** A single "biggest win"/"biggest loss" record match — the point margin is
 * always positive (the gap between the two totals), so the UI never has to
 * re-derive which side "won" the record. */
export interface MatchRecordView {
  opponentId: string;
  opponentName: string;
  week: number;
  weekLabel: string;
  year: number;
  tournamentName: string;
  /** tour tier badge, e.g. "CHA", "IWT" — see `TournamentDef.tier`. Empty
   * string for matches logged before this field existed. */
  tournamentTier: string;
  margin: number;
  totalA: number;
  totalB: number;
}

/** A per-sport biggest win/loss record — the same shape as
 * {@link MatchRecordView} plus which sport and that sport's own set score
 * (not the whole match's point totals). */
export interface SportRecordView extends MatchRecordView {
  sport: Sport;
  a: number;
  b: number;
}

/** A "greatest comeback" record — the biggest aggregate-point hole the human
 * dug out of and still won the match. `deficit` is the largest gap by which
 * the opponent led at any set boundary (running point totals after each of
 * the 4 sets, in play order); `margin` (inherited from {@link MatchRecordView})
 * is the match's final winning margin, which can be smaller than `deficit`
 * once the comeback overshoots. Only set-boundary totals are checked, not
 * point-by-point — the point trajectory itself is a presentation-only trace
 * for the live match screen (see MatchScreen.svelte's `pointHistory`) and
 * isn't persisted to the event log this is mined from. */
export interface ComebackRecordView extends MatchRecordView {
  deficit: number;
}

/** The strongest opponent (by Glicko-2 rating, at the time) the human has
 * ever faced in one sport — win or lose. See `Game.records`. */
export interface BestOpponentView {
  opponentId: string;
  opponentName: string;
  rating: number;
  /** how that specific sport's set went against them, e.g. "won 21-15" —
   * the set score as played, whatever the outcome. */
  a: number;
  b: number;
  won: boolean;
  week: number;
  weekLabel: string;
  year: number;
  tournamentName: string;
  tournamentTier: string;
}

/** The best-ranked opponent (by real FIR World Ranking rank at the time) the
 * human has ever beaten. See `Game.records`. */
export interface RankedWinView {
  opponentId: string;
  opponentName: string;
  rank: number;
  week: number;
  weekLabel: string;
  year: number;
  tournamentName: string;
  tournamentTier: string;
  /** the full match result, all 4 sets — see {@link RecentMatchSetView}. */
  totalA: number;
  totalB: number;
  sets: RecentMatchSetView[];
}

export interface GummiarmStatsView {
  played: number;
  won: number;
}

/** The "Records" hub behind the Me screen's Records tab — personal bests
 * mined from the same `match.played` event log as `RecentMatchView`, so
 * there's nothing to persist separately. Null fields mean "hasn't happened
 * yet" (e.g. no ranked opponent beaten), not zero. */
export interface RecordsView {
  biggestWin: MatchRecordView | null;
  biggestLoss: MatchRecordView | null;
  biggestWinBySport: Partial<Record<Sport, SportRecordView>>;
  biggestLossBySport: Partial<Record<Sport, SportRecordView>>;
  bestOpponentBySport: Partial<Record<Sport, BestOpponentView>>;
  highestRankedWin: RankedWinView | null;
  biggestComeback: ComebackRecordView | null;
  gummiarms: GummiarmStatsView;
}

/** A real date span for the human's current injury — see
 * `Game.currentInjurySpan`. */
export interface InjurySpanView {
  startDate: string;
  endDate: string;
  type: string;
}

/** One week the human trained, resolved to a real calendar date — see
 * `Game.trainedWeekDates`. */
export interface TrainedWeekView {
  date: string;
  sports: Sport[];
}

/** "open" — can still register. "registered" — human has committed.
 * "closed" — the entryDeadlineWeeks window passed without registering. */
export type TourEntryStatus = "open" | "registered" | "closed";

export interface TourEntry {
  weekIndex: number;
  weekLabel: string;
  /** the class actually registered for, once `status === "registered"` —
   * otherwise the human's own (easiest) eligible class, same as
   * `eligibleDivisions[0].def` */
  tournament: TournamentDef;
  isThisWeek: boolean;
  status: TourEntryStatus;
  /** the projected tier-1 NPC field — "who else has entered" */
  entrants: OpponentView[];
  /** flights + hotel/food forecast for this trip from home — see
   * systems/travel.ts. Identical across every division of one event (they
   * share a host city), so it doesn't vary per `eligibleDivisions` entry. */
  travelCost: TravelCost;
  /** forced travel days on each side of the trip: 0 for a car drive, 1 within a continent, 2 intercontinental. */
  travelDays: TravelDays;
  /** every class the human may register for — their own division first,
   * then progressively tougher ones ("playing up"). Always at least one
   * entry. See `humanEligibleDivisions`. */
  eligibleDivisions: DivisionChoice[];
}

/** One selectable class for a tournament entry — everything the Tour
 * screen's class chooser needs to render an option without a second
 * facade round-trip. */
export interface DivisionChoice {
  def: TournamentDef;
  /** this class's own projected tier-1 NPC field (differs from the default
   * division's field once the player considers playing up) */
  entrants: OpponentView[];
}

/** "played" — the human actually contested it (see `result`). "registered" —
 * committed, still upcoming. "open"/"closed" — same meaning as
 * `TourEntryStatus`. "skipped" — the week has passed and the human never
 * registered (or withdrew) — informational only, nothing to show. */
export type SeasonTournamentStatus = "played" | "registered" | "open" | "closed" | "skipped";

/** One event on the human's season list — the Tour screen's full-year
 * "every tournament this year" view, past and future, so a played event
 * stays reachable long after the week it happened (unlike the ephemeral
 * `TournamentSession`, which only lives for the duration of the event). */
export interface SeasonTournamentEntry {
  weekIndex: number;
  weekLabel: string;
  /** the human's own division for that week's event */
  tournament: TournamentDef;
  status: SeasonTournamentStatus;
  /** populated only when `status === "played"` */
  result: TournamentResultView | null;
}

/** One other division of the current week's event, fully AI-simulated
 * alongside the human's own — see `Game.otherDivisionDraws`. */
export interface OtherDivisionDraw {
  division: DivisionCode;
  tournament: TournamentDef;
  /** oldest round first, same shape as `Game.tournamentDraw` — no `isYouA`/
   * `isYouB` matchup will ever be true here, since the human isn't in it */
  rounds: DrawRound[];
  /** true once this division has a champion — no more rounds coming */
  concluded: boolean;
}

export interface OpponentView {
  id: string;
  name: string;
  nationality: string;
  /** real FIR world ranking — the "official" ladder (docs/07's "three
   * information layers"), same standing shown on the human's own Me screen.
   * Null if this player has no counted result yet (unranked). Field lists
   * sort by this first. */
  firStanding: FirStandingView | null;
  /** combined Glicko-2 rating, rounded — shown alongside `firStanding` as a
   * secondary read, since a large share of the roster has no FIR result yet
   * (see systems/division.ts) and would otherwise show nothing at all. */
  rating: number;
}

/** An opponent's level, fuzzed to a range rather than the exact value — see
 * `levelRangeForSkill`. Deliberately not `SportView`: that type's `level` +
 * `progress` are precise enough to back out the true skill, which is fine
 * for the human's own view but not for anyone else's. `level`/`progress` are
 * only populated when this profile is the human's own (see
 * `OpponentProfileView.isYou`) — `levelMin`/`levelMax` still collapse to that
 * same exact level in that case, so callers that ignore `isYou` still render
 * something sane. */
export interface OpponentSportView {
  levelMin: number;
  levelMax: number;
  level?: number;
  progress?: number;
}

/**
 * A public "Me, but for someone else" profile — everything about another
 * player that's fair to show (identity, a fuzzy per-sport level band,
 * Glicko, real FIR standing), and nothing that isn't (no traits, hidden
 * attributes, form, condition, or exact level — docs/07's
 * three-information-layers rule applies to opponents same as `OpponentView`,
 * just with more Layer 2/3 detail than a field-list row needs). Opened by
 * tapping a player's name in a draw or tournament field.
 */
/** One tournament this player has entered *in this career* — from
 * `Player.recentResults`, populated going forward only as tournaments are
 * actually simulated (see tournament/engine.ts's `recordEntrantResults`); no
 * backfill from real-world history, so this starts empty for every player at
 * career start and fills in over time. Newest first. */
export interface OpponentResultView {
  week: number;
  weekLabel: string;
  year: number;
  name: string;
  division: string;
  finishingPosition: number;
  tiedCount: number;
  matchesPlayed: number;
}

/** One individual match any player (human or NPC) was in, mined from
 * `career.completedDraws` rather than the event log — see
 * `Game.matchesForPlayer`. Unlike `RecentMatchView` (the human-only,
 * event-log-derived equivalent) this has no `opponentRank`/`opponentRatings`
 * snapshot or `gummiarm`/set `done` flag, since the draw snapshot a
 * completed tournament leaves behind doesn't carry those — it exists purely
 * to answer "who did this player actually play, and what was the score",
 * for anyone in the field, not just the human's own history. */
export interface PlayerMatchView {
  week: number;
  weekLabel: string;
  year: number;
  tournamentName: string;
  tournamentTier: string;
  division: string;
  roundName: string;
  opponentId: string;
  opponentName: string;
  won: boolean;
  totalA: number;
  totalB: number;
  sets: { sport: Sport; a: number; b: number }[];
}

export interface OpponentProfileView {
  id: string;
  name: string;
  age: number;
  nationality: string;
  gender: "m" | "f";
  sports: Record<Sport, OpponentSportView>;
  ratings: Record<Sport, RatingView>;
  combinedRating: number;
  firStanding: FirStandingView | null;
  /** newest first — see {@link OpponentResultView} */
  recentResults: OpponentResultView[];
  /** true iff this is the human's own profile — reached mid-match or
   * mid-draw by tapping your own name (see store.svelte.ts's `viewOpponent`
   * doc comment). It's the same person as the Me tab, not actually an
   * opponent, so nothing here should be fuzzed — the UI uses this to render
   * `sports[sport].level`/`progress` exactly instead of the min/max band. */
  isYou: boolean;
}

/** An inbox message with its arrival week resolved to a dated label. */
export interface InboxView extends InboxMessage {
  weekLabel: string;
}

/**
 * One row of the Rankings screen (docs/07): the same gender-separated ladder
 * as `firWorldRanking` (rank + points, the "official" ordering), with two
 * companion columns alongside — never merged into one number, per the
 * three-information-layers rule. `racePoints` is the current calendar
 * year's FIR points only (an Order-of-Merit view, from each player's own
 * `firResults` ledger — see `Player.firResults`) — genuinely 0 for everyone
 * at the start of a career (or of any new year) and climbs only as counted
 * results are actually earned that season, for NPCs and the human alike
 * (every entrant of every scheduled tournament earns points, not just the
 * human's own division/siblings — see tournament/engine.ts's
 * `recordEntrantResults` and `Game.submitWeek`'s headless world-tournament
 * simulation for the divisions the human's own session doesn't cover). Stays
 * 0 only for a player who hasn't been drawn into a tournament field yet this
 * season (a `simTier !== 1` player, or simply unlucky in the weighted draw —
 * see `sampleDivisionField`). `rating` is the combined Glicko-2 estimate,
 * explicitly a companion stat, never the ranking itself.
 */
export interface RankingRowView {
  rank: number;
  playerId: string;
  name: string;
  age: number;
  nationality: string;
  points: number;
  racePoints: number;
  rating: number;
  sportRatings: Record<Sport, number>;
  sportRatingRds: Record<Sport, number>;
}

export interface SaveGame {
  saveVersion: number;
  state: GameState;
  log: EventLog;
}

export interface NewGameOptions {
  content: ContentBundle;
  seed?: string;
  playerName?: { first: string; last: string };
  character?: CharacterDraft;
}

const DAY_MS = 86_400_000;

function tournamentStartDay(cal: Calendar, def: TournamentDef): number {
  const weekStart = new Date(`${cal.mondayISO}T00:00:00Z`).getTime();
  const eventStart = new Date(`${def.date}T00:00:00Z`).getTime();
  return Math.floor((eventStart - weekStart) / DAY_MS);
}

/**
 * Outbound travel occupies the N days immediately before the tournament's
 * actual start day (derived from `def.date`, like `tournamentDaySlots`) —
 * not a fixed weekday, since real events start anywhere from Wednesday to
 * Saturday. Days that would fall before this week's Monday (a start day too
 * early in the week for the full lead time to fit) are simply dropped rather
 * than spilling into the already-submitted previous week.
 */
function outboundTravelSlots(days: TravelDays, startDay: number): number[] {
  const offsets = days === 2 ? [2, 1] : days === 1 ? [1] : [];
  const travelDayIndices = offsets.map((n) => startDay - n).filter((day) => day >= 0 && day < 7);
  return travelDayIndices.flatMap((day) => [0, 1, 2].map((period) => slotIndex(day, period)));
}

function returnTravelSlots(days: TravelDays): number[] {
  const travelDays = days === 2 ? [0, 1] : days === 1 ? [0] : [];
  return travelDays.flatMap((day) => [0, 1, 2].map((period) => slotIndex(day, period)));
}

function tournamentDaySlots(cal: Calendar, def: TournamentDef): number[] {
  const startDay = tournamentStartDay(cal, def);
  const slots: number[] = [];
  for (let offset = 0; offset <= def.nights; offset++) {
    const day = startDay + offset;
    if (day >= 0 && day < 7) {
      slots.push(...[0, 1, 2].map((period) => slotIndex(day, period)));
    }
  }
  return slots;
}

function applyUnavailableBlocks(
  plan: PlayerPlan,
  travelBlocks: readonly TravelBlock[],
  tournamentBlocks: readonly TravelBlock[],
): PlayerPlan {
  if (travelBlocks.length === 0 && tournamentBlocks.length === 0) return plan;
  const slots = [...plan.slots];
  for (const block of travelBlocks) {
    for (const index of block.slotIndices) slots[index] = "travel";
  }
  for (const block of tournamentBlocks) {
    for (const index of block.slotIndices) slots[index] = "rest";
  }
  return { slots };
}

export class Game {
  /** ephemeral session/orchestration state — never part of GameState or SaveGame */
  private tournamentSession: TournamentSession | null = null;
  /** every other division of this week's event, fully AI-simulated in
   * lockstep with `tournamentSession` — see `otherDivisionDraws`. Empty
   * whenever no tournament is active. */
  private siblingSessions: Map<DivisionCode, TournamentSession> = new Map();
  private weekSnapshot: HumanSnapshot | null = null;
  private tournamentPreparationDone = false;

  private constructor(
    private readonly state: GameState,
    private readonly content: ContentBundle,
    private readonly log: EventLog,
  ) {}

  static newGame(options: NewGameOptions): Game {
    const seed = options.seed ?? `world-${Date.now()}`;
    const state = createPlaceholderWorld({
      seed,
      content: options.content,
      playerName: options.playerName,
      character: options.character,
    });
    return new Game(state, options.content, []);
  }

  static fromSave(save: SaveGame, content: ContentBundle): Game {
    // save migrations dispatch on saveVersion here; v1 is the only version so far
    if (save.saveVersion !== SAVE_VERSION) {
      throw new Error(`Unsupported save version: ${save.saveVersion}`);
    }
    return new Game(save.state, content, save.log);
  }

  serialize(): SaveGame {
    // GameState/EventLog are plain JSON data by design — a JSON round-trip is
    // a full deep clone and keeps the engine free of platform globals.
    return JSON.parse(
      JSON.stringify({ saveVersion: SAVE_VERSION, state: this.state, log: this.log }),
    ) as SaveGame;
  }

  get weekIndex(): number {
    return this.state.calendar.weekIndex;
  }

  get weekLabel(): string {
    return weekLabel(this.state.calendar);
  }

  get year(): number {
    return yearOfWeek(this.state.calendar, this.state.calendar.weekIndex);
  }

  get seed(): string {
    return this.state.seed;
  }

  get you(): HumanView {
    const human = humanPlayer(this.state);
    const sports = {} as Record<Sport, SportView>;
    const ratings = {} as Record<Sport, RatingView>;
    for (const sport of SPORTS) {
      const skill = human.attributes.skills[sport];
      sports[sport] = { level: levelForSkill(skill), progress: levelProgress(skill) };
      const g = human.ratings[sport];
      ratings[sport] = { rating: Math.round(g.rating), rd: Math.round(g.rd) };
    }
    return {
      id: human.identity.id,
      name: fullName(human),
      age: ageOn(this.state.calendar.mondayISO, human.identity.birthDate),
      nationality: human.identity.nationality,
      gender: human.identity.gender,
      sports,
      ratings,
      combinedRating: Math.round(combinedRating(human)),
      firStanding: firStandingFor(this.state, human.identity.id, human.identity.gender),
      attrs: {
        endurance: levelFromUnit(human.attributes.endurance),
        coreStrength: levelFromUnit(human.attributes.coreStrength),
        career: levelFromUnit(human.attributes.career),
        clutch: levelFromUnit(human.attributes.clutch),
        composure: levelFromUnit(human.attributes.composure),
        fastHealer: levelFromUnit(human.attributes.durability),
      },
      traits: human.attributes.traits
        .map((id) => traitView(this.content, id))
        .filter((t): t is TraitView => t !== null),
      fatigue: Math.round(human.condition.fatigue),
      soreness: Math.round(human.condition.soreness),
      money: this.state.career.money,
      pendingSalary: this.state.career.pendingSalary,
      remainingVacationDays: this.state.career.vacationDaysRemaining,
      annualVacationDays: annualAllowance(
        human.identity.nationality,
        ageOn(this.state.calendar.mondayISO, human.identity.birthDate),
        this.content,
      ),
      formBySport: { ...human.condition.formBySport },
      confidence: human.condition.confidence,
      injury: human.condition.injury,
      titles: [...this.state.career.titles],
      bestRating: this.state.career.bestRating,
    };
  }

  /**
   * The statistics hub: every tournament the human has played, mined from the
   * event log (`tournament.won` / `tournament.eliminated`), rolled up into
   * lifetime and per-year totals. Read-only over existing state — no dedicated
   * stats tracking is persisted, so this stays correct across save/load.
   */
  careerStats(): CareerStatsView {
    const humanId = this.state.career.playerId;
    const results: TournamentResultView[] = [];
    for (const e of this.log) {
      if (e.subject !== humanId) continue;
      if (e.type !== "tournament.won" && e.type !== "tournament.eliminated") continue;
      const d = e.data ?? {};
      results.push({
        week: e.week,
        weekLabel: weekLabelAt(this.state.calendar, e.week),
        year: yearOfWeek(this.state.calendar, e.week),
        name: String(d.name ?? "Tournament"),
        division: String(d.division ?? ""),
        roundsWon: Number(d.roundsWon ?? 0),
        totalRounds: Number(d.totalRounds ?? 0),
        won: e.type === "tournament.won",
        prizeMoney: Number(d.prizeMoney ?? 0),
        finishingPosition: Number(d.finishingPosition ?? 0),
        tiedCount: Number(d.tiedCount ?? 1),
        rankingPoints: Number(d.rankingPoints ?? 0),
      });
    }
    results.reverse(); // log is chronological; show most recent first

    const tally = (rs: TournamentResultView[]): StatTotals => ({
      tournamentsPlayed: rs.length,
      tournamentsWon: rs.filter((r) => r.won).length,
      // an untied top-2 finish — a real final was played, not just a plate
      // run that happened to end on a couple of wins (roundsWon alone can't
      // tell those apart under the monrad plate cap; see summary.ts)
      finalsReached: rs.filter((r) => r.finishingPosition <= 2 && r.tiedCount === 1).length,
      prizeMoney: rs.reduce((sum, r) => sum + r.prizeMoney, 0),
    });

    const years = [...new Set(results.map((r) => r.year))].sort((a, b) => b - a);
    const byYear: YearStats[] = years.map((year) => ({
      year,
      ...tally(results.filter((r) => r.year === year)),
    }));

    const bestFinish = results.reduce<{ finishingPosition: number; tiedCount: number } | null>(
      (best, r) =>
        !best || r.finishingPosition < best.finishingPosition
          ? { finishingPosition: r.finishingPosition, tiedCount: r.tiedCount }
          : best,
      null,
    );

    return {
      weeksPlayed: this.state.calendar.weekIndex + 1,
      lifetime: tally(results),
      bestFinish,
      byYear,
      results,
    };
  }

  /**
   * The human's whole individual match history, newest first, no cap — one
   * row per match played (not per tournament placement), mined from the
   * event log's `match.played` entries (tournament/engine.ts's
   * `advanceTournament`). The log is append-only and never pruned, so this
   * is always the human's complete match history. See `RecentMatchView`,
   * and `recentMatches`/`matchesForYear`/`matchesForWeek` for the capped/
   * filtered views built on top of this.
   */
  private matchViews(): RecentMatchView[] {
    const humanId = this.state.career.playerId;
    const matches: RecentMatchView[] = [];
    for (const e of this.log) {
      if (e.subject !== humanId || e.type !== "match.played") continue;
      const d = e.data ?? {};
      const sets = (d.sets as { a: number; b: number; done?: boolean }[] | undefined ?? []).map((s, i) => ({
        sport: SPORTS[i]!,
        a: s.a,
        b: s.b,
        // old logged events (before `done` existed) fall back to the same
        // "reached 21, won by 2" shape check a genuinely completed set
        // always satisfies — a set an early finish cut short essentially
        // never does, so this reconstructs the right answer for old saves
        // too (see match/engine.ts's `playPoint`).
        done: s.done ?? ((s.a >= 21 || s.b >= 21) && Math.abs(s.a - s.b) >= 2),
      }));
      const round = Number(d.round ?? 0);
      const totalRounds = Number(d.totalRounds ?? 0);
      matches.push({
        week: e.week,
        weekLabel: weekLabelAt(this.state.calendar, e.week),
        tournamentName: String(d.tournamentName ?? "Tournament"),
        tournamentTier: String(d.tier ?? ""),
        round,
        totalRounds,
        // old logged events (before roundName existed) fall back to the bare
        // round numbers rather than showing nothing
        roundName: String(d.roundName ?? `Round ${round}/${totalRounds}`),
        opponentId: String(d.opponentId ?? ""),
        opponentName: String(d.opponentName ?? ""),
        // old logged events (before these existed) fall back to "unknown"
        // rather than a misleading zero/false
        opponentRank: d.opponentRank == null ? null : Number(d.opponentRank),
        opponentRatings: (d.opponentRatings as Record<Sport, number> | undefined) ?? { tt: 0, bd: 0, sq: 0, tn: 0 },
        won: Boolean(d.won),
        totalA: sets.reduce((sum, s) => sum + s.a, 0),
        totalB: sets.reduce((sum, s) => sum + s.b, 0),
        sets,
        gummiarm: Boolean(d.gummiarm),
      });
    }
    matches.reverse(); // log is chronological; show most recent first
    return matches;
  }

  /** The human's individual match history, newest first, capped at `limit`.
   * See `matchViews`. */
  recentMatches(limit = 15): RecentMatchView[] {
    return this.matchViews().slice(0, limit);
  }

  /** Every match the human played in one calendar year, newest first, no cap
   * — the Me screen's year-scoped "Recent matches" list. */
  matchesForYear(year: number): RecentMatchView[] {
    return this.matchViews().filter((m) => yearOfWeek(this.state.calendar, m.week) === year);
  }

  /** Every match the human played in one specific tournament week, no cap —
   * the Tour season list's "expand a played event" detail. */
  matchesForWeek(weekIndex: number): RecentMatchView[] {
    return this.matchViews().filter((m) => m.week === weekIndex);
  }

  /** Every match the human has played against one specific opponent, newest
   * first, no cap — the opponent profile screen's "Head-to-head" card. Same
   * source as `matchesForYear`, just filtered by `opponentId` instead of
   * year; naturally bounded by how many times the two have actually met, so
   * unlike `Player.recentResults` this needs no retention cap of its own. */
  matchesAgainst(opponentId: string): RecentMatchView[] {
    return this.matchViews().filter((m) => m.opponentId === opponentId);
  }

  /**
   * Every match `playerId` has been in — human or NPC — newest first, no
   * cap. Two sources, both walked by `matchesFromBrackets`: `career.completedDraws`
   * (every tournament bracket fully resolved for a past week, whether that
   * was the human's own session, its siblings, or the headless world
   * simulation `submitWeek` runs for every division the human's own session
   * didn't touch — see `Game.submitWeek`'s `simulateUnplayedWorldTournaments`)
   * *and* the currently in-progress session, if any (`this.tournamentSession`
   * plus `this.siblingSessions`) — so a match shows up here the moment its
   * round resolves, not only once the whole event concludes and
   * `clearConcludedTournament` commits it to `completedDraws`. AI-vs-AI pairs
   * resolve instantly each round, so this can genuinely be ahead of the
   * human's own still-unfinished match. Complete for every tier-1 player
   * from the week they were first drawn into a field onward, not just
   * players who happened to share a tournament with the human. Stays empty
   * only for a player who's never been sampled into any division's field yet
   * (a `simTier !== 1` player, or simply unlucky so far — see
   * `sampleDivisionField`'s weighted draw), or for weeks played before this
   * simulation existed on an old save — the opponent profile screen's
   * "Match history" card.
   */
  matchesForPlayer(playerId: string): PlayerMatchView[] {
    const matches: PlayerMatchView[] = [];
    for (const [weekStr, draw] of Object.entries(this.state.career.completedDraws)) {
      const week = Number(weekStr);
      const brackets = [
        { tournamentId: draw.tournamentId, rounds: draw.rounds },
        ...draw.otherDivisions.map((o) => ({ tournamentId: o.tournamentId, rounds: o.rounds })),
      ];
      matches.push(...this.matchesFromBrackets(playerId, week, brackets));
    }
    // Every already-decided round of the *live* tournament in progress, if
    // any — AI-vs-AI pairs resolve instantly (see tournament/engine.ts's
    // `resolveRound`), so a round the human hasn't finished yet can still
    // hold plenty of real results for everyone else in it. Without this, a
    // player's match history stayed empty for the whole event until the
    // human finished browsing the final bracket and called
    // `clearConcludedTournament` — a real lag, not just "the week isn't
    // simulated yet" (this session's own week is never in `completedDraws`
    // while it's still active, so there's no risk of double-counting here).
    if (this.tournamentSession) {
      const week = this.tournamentSession.weekIndex;
      const brackets = [
        { tournamentId: this.tournamentSession.def.id, rounds: drawRounds(this.state, this.tournamentSession) },
        ...[...this.siblingSessions.values()].map((sibling) => ({
          tournamentId: sibling.def.id,
          rounds: drawRounds(this.state, sibling),
        })),
      ];
      matches.push(...this.matchesFromBrackets(playerId, week, brackets));
    }
    matches.sort((a, b) => b.week - a.week);
    return matches;
  }

  /** Shared by `matchesForPlayer`'s persisted (`completedDraws`) and live
   * (in-progress session) sources — walks a week's brackets and pulls out
   * every already-decided matchup `playerId` was in. */
  private matchesFromBrackets(
    playerId: string,
    week: number,
    brackets: { tournamentId: string; rounds: DrawRound[] }[],
  ): PlayerMatchView[] {
    const matches: PlayerMatchView[] = [];
    for (const bracket of brackets) {
      const def = this.content.tournaments[bracket.tournamentId];
      if (!def) continue;
      for (const round of bracket.rounds) {
        for (const section of round.sections) {
          for (const m of section.matchups) {
            if (m.winnerId === null) continue; // not actually played (bye or unresolved)
            const isA = m.a.id === playerId;
            if (!isA && m.b.id !== playerId) continue;
            const opponent = isA ? m.b : m.a;
            const sets = (m.sets ?? []).map((s, i) => ({
              sport: SPORTS[i]!,
              a: isA ? s.a : s.b,
              b: isA ? s.b : s.a,
            }));
            matches.push({
              week,
              weekLabel: weekLabelAt(this.state.calendar, week),
              year: yearOfWeek(this.state.calendar, week),
              tournamentName: def.name,
              tournamentTier: def.tier,
              division: def.division,
              roundName: section.roundName,
              opponentId: opponent.id,
              opponentName: opponent.name,
              won: m.winnerId === playerId,
              totalA: sets.reduce((sum, s) => sum + s.a, 0),
              totalB: sets.reduce((sum, s) => sum + s.b, 0),
              sets,
            });
          }
        }
      }
    }
    return matches;
  }

  /** Every opponent the human has faced, tallied by how many matches were
   * played against them, most-played first — the Me screen's "Most played
   * opponents" card. See `OpponentMatchCountView`. */
  mostPlayedOpponents(limit = 10): OpponentMatchCountView[] {
    const tally = new Map<string, OpponentMatchCountView>();
    for (const m of this.matchViews()) {
      const entry = tally.get(m.opponentId) ?? { opponentId: m.opponentId, opponentName: m.opponentName, matches: 0, wins: 0 };
      entry.matches += 1;
      if (m.won) entry.wins += 1;
      tally.set(m.opponentId, entry);
    }
    return [...tally.values()]
      .sort((a, b) => b.matches - a.matches || b.wins - a.wins || a.opponentName.localeCompare(b.opponentName))
      .slice(0, limit);
  }

  /**
   * Personal-best records mined from the same match history as
   * `matchViews`, for the Me screen's Records tab: biggest win/loss overall
   * and per sport, the best-ranked opponent ever beaten, the strongest
   * opponent ever faced in each sport, and a gummiarm tally. All "biggest"/
   * "best" picks break ties by recency: `matchViews()` is newest-first and
   * `better` only replaces its running pick on a strict improvement, so of
   * two equal records the more recent one (encountered first) wins.
   */
  records(): RecordsView {
    const matches = this.matchViews();

    const better = <T>(records: T[], marginOf: (r: T) => number): T | null =>
      records.reduce<T | null>((best, r) => (!best || marginOf(r) > marginOf(best) ? r : best), null);

    const toMatchRecord = (m: RecentMatchView, margin: number): MatchRecordView => ({
      opponentId: m.opponentId,
      opponentName: m.opponentName,
      week: m.week,
      weekLabel: m.weekLabel,
      year: yearOfWeek(this.state.calendar, m.week),
      tournamentName: m.tournamentName,
      tournamentTier: m.tournamentTier,
      margin,
      totalA: m.totalA,
      totalB: m.totalB,
    });

    const wins = matches.filter((m) => m.won);
    const losses = matches.filter((m) => !m.won);
    const biggestWinMatch = better(wins, (m) => m.totalA - m.totalB);
    const biggestLossMatch = better(losses, (m) => m.totalB - m.totalA);
    const biggestWin = biggestWinMatch ? toMatchRecord(biggestWinMatch, biggestWinMatch.totalA - biggestWinMatch.totalB) : null;
    const biggestLoss = biggestLossMatch ? toMatchRecord(biggestLossMatch, biggestLossMatch.totalB - biggestLossMatch.totalA) : null;

    const biggestWinBySport: Partial<Record<Sport, SportRecordView>> = {};
    const biggestLossBySport: Partial<Record<Sport, SportRecordView>> = {};
    const bestOpponentBySport: Partial<Record<Sport, BestOpponentView>> = {};

    for (const sport of SPORTS) {
      type SetHit = { m: RecentMatchView; a: number; b: number };
      const sportSets: SetHit[] = [];
      for (const m of matches) {
        const set = m.sets.find((s) => s.sport === sport);
        // a set an early finish cut short (`!done`) is a real snapshot but
        // not a decided contest — skip it so it can't masquerade as a
        // per-sport win or loss (see `RecentMatchSetView.done`'s doc comment)
        if (set && set.done) sportSets.push({ m, a: set.a, b: set.b });
      }
      const setWins = sportSets.filter((s) => s.a > s.b);
      const setLosses = sportSets.filter((s) => s.b > s.a);
      const bestWin = better(setWins, (s) => s.a - s.b);
      const bestLoss = better(setLosses, (s) => s.b - s.a);
      if (bestWin) biggestWinBySport[sport] = { ...toMatchRecord(bestWin.m, bestWin.a - bestWin.b), sport, a: bestWin.a, b: bestWin.b };
      if (bestLoss) biggestLossBySport[sport] = { ...toMatchRecord(bestLoss.m, bestLoss.b - bestLoss.a), sport, a: bestLoss.a, b: bestLoss.b };

      const strongest = better(matches, (m) => m.opponentRatings[sport]);
      if (strongest) {
        const set = strongest.sets.find((s) => s.sport === sport);
        bestOpponentBySport[sport] = {
          opponentId: strongest.opponentId,
          opponentName: strongest.opponentName,
          rating: strongest.opponentRatings[sport],
          a: set?.a ?? 0,
          b: set?.b ?? 0,
          won: (set?.a ?? 0) > (set?.b ?? 0),
          week: strongest.week,
          weekLabel: strongest.weekLabel,
          year: yearOfWeek(this.state.calendar, strongest.week),
          tournamentName: strongest.tournamentName,
          tournamentTier: strongest.tournamentTier,
        };
      }
    }

    const rankedWins = wins.filter((m) => m.opponentRank != null);
    // lower rank number is the better standing — "highest ranked" beaten
    const bestRankedWin = rankedWins.reduce<RecentMatchView | null>(
      (best, m) => (!best || m.opponentRank! < best.opponentRank! ? m : best),
      null,
    );
    const highestRankedWin: RankedWinView | null = bestRankedWin
      ? {
          opponentId: bestRankedWin.opponentId,
          opponentName: bestRankedWin.opponentName,
          rank: bestRankedWin.opponentRank!,
          week: bestRankedWin.week,
          weekLabel: bestRankedWin.weekLabel,
          year: yearOfWeek(this.state.calendar, bestRankedWin.week),
          tournamentName: bestRankedWin.tournamentName,
          tournamentTier: bestRankedWin.tournamentTier,
          totalA: bestRankedWin.totalA,
          totalB: bestRankedWin.totalB,
          sets: bestRankedWin.sets,
        }
      : null;

    // greatest comeback: among match wins, the biggest hole the human was in
    // at any set boundary (running point totals after each of the 4 sets, in
    // play order) before still winning the match overall.
    type ComebackHit = { m: RecentMatchView; deficit: number };
    const comebackHits: ComebackHit[] = [];
    for (const m of wins) {
      let a = 0;
      let b = 0;
      let maxDeficit = 0;
      for (const s of m.sets) {
        a += s.a;
        b += s.b;
        maxDeficit = Math.max(maxDeficit, b - a);
      }
      if (maxDeficit > 0) comebackHits.push({ m, deficit: maxDeficit });
    }
    const bestComeback = better(comebackHits, (h) => h.deficit);
    const biggestComeback: ComebackRecordView | null = bestComeback
      ? { ...toMatchRecord(bestComeback.m, bestComeback.m.totalA - bestComeback.m.totalB), deficit: bestComeback.deficit }
      : null;

    const gummiarmMatches = matches.filter((m) => m.gummiarm);
    const gummiarms: GummiarmStatsView = {
      played: gummiarmMatches.length,
      won: gummiarmMatches.filter((m) => m.won).length,
    };

    return {
      biggestWin,
      biggestLoss,
      biggestWinBySport,
      biggestLossBySport,
      bestOpponentBySport,
      highestRankedWin,
      biggestComeback,
      gummiarms,
    };
  }

  /**
   * Every podium finish (top 3) of the human's career, newest first — the
   * "Me" screen's trophy cabinet. Reuses `careerStats().results` rather than
   * re-scanning the log, since a medal is just a top-3 filter over the same
   * mined tournament history (see `TrophyView`'s doc comment for why this
   * exists as a separate view from the money-focused `results` list).
   */
  trophyCabinet(): TrophyView[] {
    return this.careerStats()
      .results.filter((r) => r.finishingPosition <= 3)
      .map((r) => ({
        week: r.week,
        weekLabel: r.weekLabel,
        name: r.name,
        division: r.division,
        medal: r.finishingPosition as 1 | 2 | 3,
        tiedCount: r.tiedCount,
      }));
  }

  /**
   * The human's current injury as a real date span, for the season
   * calendar — null whenever uninjured. `startDate` comes from the injury's
   * own `startWeek` (set once, when it occurred); `endDate` is derived from
   * the *current* `weeksRemaining`, so it always reflects today's live
   * countdown rather than a stale snapshot taken when the injury began.
   */
  currentInjurySpan(): InjurySpanView | null {
    const injury = humanPlayer(this.state).condition.injury;
    if (!injury) return null;
    const endWeek = this.state.calendar.weekIndex + injury.weeksRemaining;
    return {
      startDate: dateForWeek(this.state.calendar, injury.startWeek),
      endDate: dateForWeek(this.state.calendar, endWeek),
      type: injury.type,
    };
  }

  /**
   * Every week (so far) the human actually trained, as a real calendar date
   * — the season calendar's training history. Always-recorded (unlike the
   * threshold-gated `training.progress` narrative event), so this never
   * silently misses a week that had real sessions but too small a gain to
   * narrate.
   */
  trainedWeekDates(): TrainedWeekView[] {
    return this.state.career.trainedWeeks.map((w) => ({
      date: dateForWeek(this.state.calendar, w.weekIndex),
      sports: w.sports,
    }));
  }

  /**
   * The human's national public holidays for a calendar year, as real dates
   * — the season calendar marks these red. Derived from the player's
   * nationality (see systems/holidays.ts); empty for a country with no
   * modelled holidays.
   */
  humanPublicHolidays(year: number): { date: string; name: string }[] {
    return publicHolidays(humanPlayer(this.state).identity.nationality, year, this.content);
  }

  /**
   * Vacation days a drafted week would consume against this week's dates —
   * live "this week uses X days" feedback in the planner, before it's
   * committed. Mirrors the draw-down `simulateWeek` applies (see
   * systems/vacation.ts).
   */
  vacationCostThisWeek(plan: PlayerPlan): number {
    return vacationDaysUsedBy(
      plan,
      this.state.calendar.mondayISO,
      humanPlayer(this.state).identity.nationality,
      this.content,
    );
  }

  /**
   * A public profile for any other player, by id — everything fair to show
   * (identity, a fuzzy per-sport level band, Glicko, FIR standing), nothing
   * hidden and no exact level. Null if the id doesn't resolve to a player in
   * this world (e.g. a stale reference). See `OpponentProfileView`.
   */
  opponentProfile(id: string): OpponentProfileView | null {
    const p = this.state.players.find((pl) => pl.identity.id === id);
    if (!p) return null;
    const isYou = p.identity.id === this.state.career.playerId;
    const sports = {} as Record<Sport, OpponentSportView>;
    const ratings = {} as Record<Sport, RatingView>;
    for (const sport of SPORTS) {
      const skill = p.attributes.skills[sport];
      if (isYou) {
        const level = levelForSkill(skill);
        sports[sport] = { levelMin: level, levelMax: level, level, progress: levelProgress(skill) };
      } else {
        const setsPlayed = this.state.career.headToHeadSets[id]?.[sport] ?? 0;
        const bandWidth = levelRangeWidthForFamiliarity(
          setsPlayed,
          BALANCE.opponentInfo.levelRangeStartWidth,
          BALANCE.opponentInfo.levelRangeMinWidth,
        );
        const range = levelRangeForSkill(skill, bandWidth);
        sports[sport] = { levelMin: range.min, levelMax: range.max };
      }
      const g = p.ratings[sport];
      ratings[sport] = { rating: Math.round(g.rating), rd: Math.round(g.rd) };
    }
    return {
      id: p.identity.id,
      name: fullName(p),
      age: ageOn(this.state.calendar.mondayISO, p.identity.birthDate),
      nationality: p.identity.nationality,
      gender: p.identity.gender,
      sports,
      ratings,
      combinedRating: Math.round(combinedRating(p)),
      firStanding: firStandingFor(this.state, p.identity.id, p.identity.gender),
      recentResults: [...p.recentResults].reverse().map((r) => ({
        week: r.weekIndex,
        weekLabel: weekLabelAt(this.state.calendar, r.weekIndex),
        year: yearOfWeek(this.state.calendar, r.weekIndex),
        name: r.name,
        division: r.division,
        finishingPosition: r.finishingPosition,
        tiedCount: r.tiedCount,
        matchesPlayed: r.matchesPlayed,
      })),
      isYou,
    };
  }

  /**
   * The Rankings screen (docs/07): the gender-separated FIR World Ranking
   * ladder — same rows and order as `firWorldRanking` — enriched with the
   * Tour Race (season-to-date points, from every player's own `firResults`
   * ledger — see `Player.firResults`) and combined Glicko-2 rating as
   * companion columns.
   */
  rankings(gender: "m" | "f"): RankingRowView[] {
    return firWorldRanking(this.state, gender).map((row) => {
      const player = getPlayer(this.state, row.playerId);
      return {
        ...row,
        age: ageOn(this.state.calendar.mondayISO, player.identity.birthDate),
        racePoints: firRacePointsTotal(player.firResults, this.state.calendar),
        rating: Math.round(combinedRating(player)),
        sportRatings: {
          tt: Math.round(player.ratings.tt.rating),
          bd: Math.round(player.ratings.bd.rating),
          sq: Math.round(player.ratings.sq.rating),
          tn: Math.round(player.ratings.tn.rating),
        },
        sportRatingRds: {
          tt: Math.round(player.ratings.tt.rd),
          bd: Math.round(player.ratings.bd.rd),
          sq: Math.round(player.ratings.sq.rd),
          tn: Math.round(player.ratings.tn.rd),
        },
      };
    });
  }

  /** The diegetic message feed, newest first, with dated labels. */
  get inbox(): InboxView[] {
    return this.state.career.inbox
      .map((m) => ({ ...m, weekLabel: weekLabelAt(this.state.calendar, m.week) }))
      .reverse();
  }

  get unreadCount(): number {
    return this.state.career.inbox.reduce((n, m) => n + (m.read ? 0 : 1), 0);
  }

  /** Marks one message read (idempotent). */
  markInboxRead(id: string): void {
    const msg = this.state.career.inbox.find((m) => m.id === id);
    if (msg) msg.read = true;
  }

  markAllInboxRead(): void {
    for (const m of this.state.career.inbox) m.read = true;
  }

  /**
   * Approximate consequences of a plan, evaluated in expectation with the
   * same effect functions the systems use — then bucketed.
   */
  previewPlan(plan: PlayerPlan): Forecast {
    const human = humanPlayer(this.state);
    const counts = countsFromSlots(plan);
    const { fatigue } = human.condition;
    const age = ageOn(this.state.calendar.mondayISO, human.identity.birthDate);

    const sports = {} as Record<Sport, GainBucket>;
    for (const sport of SPORTS) {
      const potential = human.attributes.potential[sport];
      const expected = expectedWeeklyGain(counts, sport, human.attributes.skills[sport], potential, fatigue, this.content, age);
      sports[sport] = gainBucket(expected);
    }

    const fatigueDelta =
      fatigueDeltaFromCounts(counts, this.content, human.attributes.coreStrength) - BALANCE.recovery.weeklyBase * recoveryAgeMultiplier(age);
    const { earned, spent } = moneyDeltaFromCounts(counts, this.content, salaryMultiplier(human.attributes.career));
    const expenses = spent + BALANCE.economy.weeklyExpenses;
    const rounding = BALANCE.forecast.moneyRounding;

    return {
      sports,
      fatigue: fatigueBucket(fatigueDelta),
      money: -Math.round(expenses / rounding) * rounding,
      salaryEarned: Math.round(earned / rounding) * rounding,
      injuryRisk: injuryRiskBucket(injuryLoad(counts, this.content, fatigue)),
    };
  }

  tournamentBlocksThisWeek(): TravelBlock[] {
    const week = this.state.calendar.weekIndex;
    const entry = this.state.career.tournamentEntries.find((e) => e.weekIndex === week);
    const def = entry ? this.content.tournaments[entry.tournamentId] : null;
    if (!def) return [];
    const slotIndices = tournamentDaySlots(this.state.calendar, def);
    return slotIndices.length > 0 ? [{ weekIndex: week, slotIndices }] : [];
  }

  travelBlocksThisWeek(): TravelBlock[] {
    const week = this.state.calendar.weekIndex;
    const blocks = this.state.career.travelBlocks.filter((block) => block.weekIndex === week);
    const entry = this.state.career.tournamentEntries.find((e) => e.weekIndex === week);
    if (entry) {
      const def = this.content.tournaments[entry.tournamentId];
      if (def) {
        const days = travelDays(humanPlayer(this.state).identity.nationality, def, this.content);
        const startDay = tournamentStartDay(this.state.calendar, def);
        const slotIndices = outboundTravelSlots(days, startDay);
        if (slotIndices.length > 0) blocks.push({ weekIndex: week, slotIndices });
      }
    }
    return blocks;
  }

  /**
   * The real-calendar tournament landing this week, if any — regardless of
   * whether the human registered for it. Informational only; whether it can
   * actually be *played* is `registeredTournamentThisWeek`. Resolved to the
   * human's own division (see `humanDivisionDef`) — an event may run
   * several simultaneous division brackets, but the human only ever sees
   * their own.
   */
  tournamentThisWeek(): TournamentDef | null {
    const defs = tournamentForWeek(this.content, this.state.calendar.weekIndex);
    return defs ? humanDivisionDef(this.state, defs) : null;
  }

  /**
   * This week's tournament, but only if the human registered for it at
   * least `entryDeadlineWeeks` in advance — the gate `enterTournament`
   * actually checks. There is no same-week fallback: miss the deadline and
   * this stays null even though `tournamentThisWeek` still reports the event.
   *
   * Looks up the *actual* registered entry's def, not `humanDivisionDef`'s
   * own-division default — the human may have registered for a tougher,
   * played-up class (see `registerForTournament`), and this must return
   * whichever one they actually committed to.
   */
  registeredTournamentThisWeek(): TournamentDef | null {
    if (this.tournamentSession) return null;
    const week = this.state.calendar.weekIndex;
    const entry = this.state.career.tournamentEntries.find((e) => e.weekIndex === week);
    return entry ? (this.content.tournaments[entry.tournamentId] ?? null) : null;
  }

  /**
   * The next `count` upcoming tournaments on the real calendar, current week
   * included if applicable — the Tour screen's calendar. Purely a read over
   * `tournamentCalendar`; doesn't touch GameState. Each entry can reference a
   * different `TournamentDef` now that the season is a real, non-recurring
   * schedule (docs/07's Tour tab).
   */
  tournamentSchedule(count = 6): TourEntry[] {
    const calendar = tournamentCalendar(this.content);
    const thisWeekIndex = this.state.calendar.weekIndex;
    const deadline = BALANCE.tournament.entryDeadlineWeeks;
    const human = humanPlayer(this.state);
    const homeCountry = human.identity.nationality;
    // batched once per call (not per entrant) — see `firStandingsMap`
    const standings = firStandingsMap(this.state, human.identity.gender);
    const upcomingWeeks = [...calendar.keys()]
      .filter((w) => w >= thisWeekIndex)
      .sort((a, b) => a - b)
      .slice(0, count);

    return upcomingWeeks.map((weekIndex) => {
      const defs = calendar.get(weekIndex)!;
      const eligible = humanEligibleDivisions(this.state, defs);
      const registeredEntry = this.state.career.tournamentEntries.find((e) => e.weekIndex === weekIndex);
      // the actual registered class if there is one (may be a played-up
      // class not first in `eligible`), else the default (own) class
      const def = registeredEntry ? (this.content.tournaments[registeredEntry.tournamentId] ?? eligible[0]!) : eligible[0]!;
      const withinWindow = weekIndex - thisWeekIndex >= deadline;
      const status: TourEntryStatus = registeredEntry ? "registered" : withinWindow ? "open" : "closed";
      return {
        weekIndex,
        weekLabel: weekLabelAt(this.state.calendar, weekIndex),
        tournament: def,
        isThisWeek: weekIndex === thisWeekIndex,
        status,
        entrants: rankedEntrants(projectedFieldAsOf(this.state, def, weekIndex, this.content, thisWeekIndex), standings),
        travelCost: travelCost(homeCountry, def, this.content),
        travelDays: travelDays(homeCountry, def, this.content),
        eligibleDivisions: eligible.map((eligibleDef) => ({
          def: eligibleDef,
          entrants: rankedEntrants(
            safeProjectedField(this.state, eligibleDef, weekIndex, this.content, thisWeekIndex),
            standings,
          ),
        })),
      };
    });
  }

  /**
   * Every tournament of the given real-calendar year that lands on the
   * human's own division, oldest first — the Tour screen's season list, so a
   * result stays reachable long after `tournamentSchedule`'s upcoming-only
   * window (and the live `TournamentSession`) have moved on. "Played" status
   * comes from `careerStats().results` (the durable event-log record), not
   * the ephemeral session, so this works for any past week this career has
   * already lived through.
   */
  seasonTournaments(year: number): SeasonTournamentEntry[] {
    const calendar = tournamentCalendar(this.content);
    const thisWeekIndex = this.state.calendar.weekIndex;
    const deadline = BALANCE.tournament.entryDeadlineWeeks;
    const resultsByWeek = new Map(this.careerStats().results.map((r) => [r.week, r]));

    const weeks = [...calendar.keys()]
      .filter((w) => yearOfWeek(this.state.calendar, w) === year)
      .sort((a, b) => a - b);

    return weeks.map((weekIndex) => {
      const defs = calendar.get(weekIndex)!;
      const tournament = humanDivisionDef(this.state, defs);
      const result = resultsByWeek.get(weekIndex) ?? null;
      const registeredEntry = this.state.career.tournamentEntries.find((e) => e.weekIndex === weekIndex);
      let status: SeasonTournamentStatus;
      if (result) status = "played";
      else if (registeredEntry) status = "registered";
      else if (weekIndex < thisWeekIndex) status = "skipped";
      else status = weekIndex - thisWeekIndex >= deadline ? "open" : "closed";
      return { weekIndex, weekLabel: weekLabelAt(this.state.calendar, weekIndex), tournament, status, result };
    });
  }

  /**
   * Registers for a future tournament — commits to playing it, but the
   * entry fee isn't charged until that week actually arrives and
   * `enterTournament` is called. Must be at least `entryDeadlineWeeks`
   * ahead of the tournament's own week; no same-week or late entry.
   *
   * Defaults to the human's own division; pass `division` to play up into a
   * tougher one instead (see `humanEligibleDivisions` — playing down is
   * never offered). Calling this again before the deadline switches an
   * existing registration to a different eligible class rather than
   * erroring — changing your mind about which class to enter is a normal
   * planning action, not a bug.
   */
  registerForTournament(weekIndex: number, division?: DivisionCode): void {
    const defs = tournamentForWeek(this.content, weekIndex);
    if (!defs) {
      throw new Error(`Week ${weekIndex} has no tournament to register for`);
    }
    const eligible = humanEligibleDivisions(this.state, defs);
    const def = division ? eligible.find((d) => d.division === division) : eligible[0];
    if (!def) {
      throw new Error(`Division "${division}" is not open to you for the tournament in week ${weekIndex}`);
    }
    const deadline = BALANCE.tournament.entryDeadlineWeeks;
    if (weekIndex - this.state.calendar.weekIndex < deadline) {
      throw new Error(`Entry deadline has passed for the tournament in week ${weekIndex}`);
    }
    const existing = this.state.career.tournamentEntries.find((e) => e.weekIndex === weekIndex);
    if (existing) {
      if (existing.tournamentId === def.id) return; // idempotent
      existing.tournamentId = def.id; // switching to a different eligible class
      this.log.push({
        week: this.state.calendar.weekIndex,
        type: "tournament.registered",
        subject: this.state.career.playerId,
        data: { name: def.name, forWeek: weekIndex, division: def.division },
      });
      return;
    }
    this.state.career.tournamentEntries.push({ weekIndex, tournamentId: def.id });
    this.log.push({
      week: this.state.calendar.weekIndex,
      type: "tournament.registered",
      subject: this.state.career.playerId,
      data: { name: def.name, forWeek: weekIndex, division: def.division },
    });
  }

  /**
   * Backs out of a future (or this week's, before playing it) registration.
   * Looks up only by `weekIndex` (not `tournamentId`) — safe because
   * `registerForTournament` guarantees at most one entry per week.
   *
   * FIR Tournament Regs 3.14.1 / Players & Draws 3.13: a player who withdraws
   * after the regular entry deadline still owes the entry fee. That deadline
   * is `entryDeadlineWeeks` before the tournament's own week (the same
   * window `registerForTournament` enforces for new entries) — so a
   * withdrawal inside that window is charged; anything earlier stays free.
   */
  withdrawRegistration(weekIndex: number): void {
    const idx = this.state.career.tournamentEntries.findIndex((e) => e.weekIndex === weekIndex);
    if (idx === -1) return;
    const entry = this.state.career.tournamentEntries[idx]!;
    const pastDeadline = weekIndex - this.state.calendar.weekIndex < BALANCE.tournament.entryDeadlineWeeks;
    this.state.career.tournamentEntries.splice(idx, 1);

    if (pastDeadline) {
      const def = this.content.tournaments[entry.tournamentId];
      if (def) {
        this.state.career.money -= def.entryFee;
        this.log.push({
          week: this.state.calendar.weekIndex,
          type: "tournament.withdrawalFee",
          subject: this.state.career.playerId,
          data: { name: def.name, forWeek: weekIndex, fee: def.entryFee },
        });
      }
    }
    this.log.push({
      week: this.state.calendar.weekIndex,
      type: "tournament.withdrew",
      subject: this.state.career.playerId,
      data: { forWeek: weekIndex, feeCharged: pastDeadline },
    });
  }

  /**
   * Enters the tournament: deducts the entry fee, seeds a bracket from the
   * human plus tier-1 NPCs, auto-resolves every AI-vs-AI pair, and returns
   * the human's first-round MatchState for the UI to play interactively.
   * Only callable once registered — see `registeredTournamentThisWeek`.
   */
  prepareAndEnterTournament(plan: PlayerPlan): MatchState {
    const def = this.registeredTournamentThisWeek();
    if (!def) throw new Error("Not registered for a tournament this week");
    if (!this.tournamentPreparationDone) {
      const snapshot = this.ensureWeekSnapshot();
      simulateTournamentPreparation(
        this.state,
        applyUnavailableBlocks(plan, this.travelBlocksThisWeek(), this.tournamentBlocksThisWeek()),
        this.content,
        this.log,
        snapshot,
      );
      this.tournamentPreparationDone = true;
    }
    return this.enterTournament();
  }

  enterTournament(): MatchState {
    const def = this.registeredTournamentThisWeek();
    if (!def) throw new Error("Not registered for a tournament this week");
    const travel = travelCost(humanPlayer(this.state).identity.nationality, def, this.content);
    if (this.state.career.money < def.entryFee + travel.total) {
      throw new Error("Insufficient funds for this trip");
    }
    this.ensureWeekSnapshot();
    const returnSlots = returnTravelSlots(travelDays(humanPlayer(this.state).identity.nationality, def, this.content));
    if (returnSlots.length > 0 && !this.state.career.travelBlocks.some((b) => b.weekIndex === this.state.calendar.weekIndex + 1)) {
      this.state.career.travelBlocks.push({ weekIndex: this.state.calendar.weekIndex + 1, slotIndices: returnSlots });
    }
    this.tournamentSession = startTournament(this.state, def, this.content, this.log);
    const match = this.tournamentSession.pendingMatch;
    if (!match) throw new Error("Tournament started with no pending match");

    const weekIndex = this.state.calendar.weekIndex;
    const siblingDefs = (tournamentForWeek(this.content, weekIndex) ?? []).filter(
      (d) => d.eventId === def.eventId && d.gender === def.gender && d.division !== def.division,
    );
    this.siblingSessions = new Map(
      siblingDefs.map((d) => [d.division, startSiblingSession(this.state, d, weekIndex, this.content)]),
    );

    return match;
  }

  /** The human's current round match, if a tournament is in progress. */
  pendingTournamentMatch(): MatchState | null {
    return this.tournamentSession?.pendingMatch ?? null;
  }

  /**
   * The bracket/draw the human has played through so far this tournament,
   * oldest round first — null if no tournament is in progress. Lets the UI
   * show an actual draw tree: which round, main draw or plate, which
   * position range — see `tournament/engine.ts`'s `drawRounds`.
   */
  tournamentDraw(): DrawRound[] | null {
    if (!this.tournamentSession) return null;
    return drawRounds(this.state, this.tournamentSession);
  }

  /**
   * The section (main draw or plate, with its round name and position
   * range) the human's current pending match belongs to — for the match
   * screen's header. Null if no match is pending.
   */
  currentDrawSection(): DrawSection | null {
    if (!this.tournamentSession?.pendingMatch) return null;
    const rounds = drawRounds(this.state, this.tournamentSession);
    const latest = rounds[rounds.length - 1];
    return latest?.sections.find((s) => s.matchups.some((m) => m.winnerId === null)) ?? null;
  }

  /**
   * Advances the bracket once the human's match has finished: records the
   * result, carries energy into the next round, or — on elimination or the
   * final win — awards prize money and converts the day's exertion into
   * fatigue. Every other division's sibling session (see
   * `otherDivisionDraws`) advances one round in lockstep; once the human's
   * own tournament concludes, any siblings still going are fast-forwarded
   * straight to their own final result rather than left mid-bracket.
   *
   * On conclusion, the session is deliberately *not* cleared here — its
   * permanent effects (prize money, fatigue, ranking points, event log) are
   * already applied by this point, but the draw itself stays live so the UI
   * can let the human browse the finished bracket (own + siblings) before
   * moving on. Call `clearConcludedTournament` once they're done.
   */
  resolveTournamentMatch(finishedMatch: MatchState): TournamentAdvanceResult {
    if (!this.tournamentSession) throw new Error("No active tournament to advance");
    const before = this.records();
    // Snapshotted before `advanceTournament` logs *this* result, so a title
    // won right now doesn't count as its own prior history — see
    // `emitBrokenRecordEmails` and `emitMilestoneEmails`.
    const humanId = this.state.career.playerId;
    const priorConclusions = this.log.filter(
      (e) => e.subject === humanId && (e.type === "tournament.won" || e.type === "tournament.eliminated"),
    );
    const isFirstTournament = priorConclusions.length === 0;
    const hadPodiumBefore = priorConclusions.some(
      (e) => Number((e.data as { finishingPosition?: number } | undefined)?.finishingPosition ?? Infinity) <= 3,
    );
    const hadGoldBefore = priorConclusions.some((e) => e.type === "tournament.won");
    const result = advanceTournament(this.state, this.tournamentSession, finishedMatch, this.log);
    for (const sibling of this.siblingSessions.values()) advanceSiblingSession(this.state, sibling, this.log);
    if (result.status !== "nextRound") {
      for (const sibling of this.siblingSessions.values()) finishSiblingSession(this.state, sibling, this.log);
    }
    // Skip: the human's very first tournament ever has no real baseline —
    // every placement trivially "breaks" a null record, which would flood
    // the inbox with meaningless firsts. See `emitBrokenRecordEmails`.
    if (!isFirstTournament) this.emitBrokenRecordEmails(before, this.records());
    this.emitMilestoneEmails(result, hadPodiumBefore, hadGoldBefore);
    return result;
  }

  /**
   * "FIR Stats Bot" inbox emails for personal bests broken by the match that
   * just resolved — a diff between `records()` taken right before and right
   * after this one match. Deliberately skips a category the first time it's
   * ever set (`before`'s value is null): there's no previous record for a
   * career's very first win/loss/etc. to "break", so nothing gets emailed
   * until a later match genuinely improves on it.
   */
  private emitBrokenRecordEmails(before: RecordsView, after: RecordsView): void {
    const notes: string[] = [];

    if (before.biggestWin && after.biggestWin && after.biggestWin.margin > before.biggestWin.margin) {
      notes.push(
        `New biggest win: +${after.biggestWin.margin} vs ${after.biggestWin.opponentName} at ${after.biggestWin.tournamentName} (previous best +${before.biggestWin.margin}).`,
      );
    }
    if (before.biggestLoss && after.biggestLoss && after.biggestLoss.margin > before.biggestLoss.margin) {
      notes.push(
        `New heaviest defeat: −${after.biggestLoss.margin} vs ${after.biggestLoss.opponentName} at ${after.biggestLoss.tournamentName} (previous worst −${before.biggestLoss.margin}).`,
      );
    }
    for (const sport of SPORTS) {
      const bw = before.biggestWinBySport[sport];
      const aw = after.biggestWinBySport[sport];
      if (bw && aw && aw.margin > bw.margin) {
        notes.push(`New best ${SPORT_LABELS[sport]} set: ${aw.a}-${aw.b} vs ${aw.opponentName}.`);
      }
      const bl = before.biggestLossBySport[sport];
      const al = after.biggestLossBySport[sport];
      if (bl && al && al.margin > bl.margin) {
        notes.push(`Heaviest ${SPORT_LABELS[sport]} set defeat: ${al.a}-${al.b} vs ${al.opponentName}.`);
      }
      const bo = before.bestOpponentBySport[sport];
      const ao = after.bestOpponentBySport[sport];
      if (bo && ao && ao.rating > bo.rating) {
        notes.push(`Toughest ${SPORT_LABELS[sport]} opponent yet: ${ao.opponentName} (${ao.rating} rating).`);
      }
    }
    if (
      before.highestRankedWin &&
      after.highestRankedWin &&
      after.highestRankedWin.rank < before.highestRankedWin.rank
    ) {
      notes.push(
        `Best win by ranking yet: beat World No. ${after.highestRankedWin.rank} ${after.highestRankedWin.opponentName}.`,
      );
    }
    if (before.biggestComeback && after.biggestComeback && after.biggestComeback.deficit > before.biggestComeback.deficit) {
      notes.push(
        `Greatest comeback yet: clawed back from ${after.biggestComeback.deficit} down to beat ${after.biggestComeback.opponentName} (previous best ${before.biggestComeback.deficit} down).`,
      );
    }

    if (notes.length === 0) return;
    const week = this.state.calendar.weekIndex;
    const seq = this.state.career.inbox.filter((m) => m.category === "record" && m.week === week).length;
    this.state.career.inbox.push({
      id: `record:${week}:${seq}`,
      week,
      category: "record",
      from: "FIR Stats Bot",
      subject: notes.length === 1 ? "📈 New personal record" : "📈 New personal records",
      body: notes.join(" "),
      read: false,
    });
  }

  /**
   * Two one-time congratulation emails for the human's own career-defining
   * firsts, fired the moment a tournament concludes — the weeks between
   * tournaments otherwise feel like pure transit, so these land as a bit of
   * living-world texture rather than another stats readout. `hadPodiumBefore`
   * / `hadGoldBefore` are snapshotted by `resolveTournamentMatch` *before*
   * this conclusion was logged, so the tournament that actually earns the
   * milestone still counts as "first".
   */
  private emitMilestoneEmails(result: TournamentAdvanceResult, hadPodiumBefore: boolean, hadGoldBefore: boolean): void {
    if (result.status === "nextRound" || !this.tournamentSession) return;
    const def = this.tournamentSession.def;
    const human = humanPlayer(this.state);
    const week = this.state.calendar.weekIndex;

    if (!hadPodiumBefore && result.finishingPosition <= 3) {
      this.state.career.inbox.push({
        id: `family-podium:${week}`,
        week,
        category: "family",
        from: "Mom",
        subject: "So proud of you!",
        body:
          `I just saw the results from ${def.name} — a podium finish! I always knew you had it in you. ` +
          `Call me tonight, I want to hear everything. Love, Mom.`,
        read: false,
      });
    }

    if (!hadGoldBefore && result.status === "won") {
      const country = this.content.countries[human.identity.nationality];
      const presidentName = country?.president ?? "the federation president";
      this.state.career.inbox.push({
        id: `official-gold:${week}`,
        week,
        category: "official",
        from: `${country?.name ?? human.identity.nationality} Federation President, ${presidentName}`,
        subject: "Congratulations on your first title",
        body:
          `On behalf of the entire federation, congratulations on winning the ${def.name} — a fantastic ` +
          `achievement, and I'm sure the first of many. We're proud to have you flying our flag.`,
        read: false,
      });
    }
  }

  /** Releases the concluded tournament's session (own + siblings) once the
   * human is done browsing its final draw — see `resolveTournamentMatch`.
   * Snapshots the full bracket (own division + every sibling) into
   * `career.completedDraws` first, since the session itself is about to be
   * discarded and is otherwise the only place that data ever lived — see
   * `completedDraw`. */
  clearConcludedTournament(): void {
    if (this.tournamentSession) {
      const session = this.tournamentSession;
      this.state.career.completedDraws[session.weekIndex] = {
        tournamentId: session.def.id,
        rounds: drawRounds(this.state, session),
        otherDivisions: [...this.siblingSessions.values()].map((sibling) => ({
          tournamentId: sibling.def.id,
          rounds: drawRounds(this.state, sibling),
        })),
      };
    }
    this.tournamentSession = null;
    this.siblingSessions = new Map();
  }

  /**
   * Whether the human genuinely belongs in `weekIndex`'s bracket for preview
   * purposes — either they've actually registered for it, or the entry
   * deadline for it hasn't passed yet and they simply haven't decided (the
   * same "still eligible" window `registerForTournament` enforces). False
   * for any other week: one they registered a *different* tournament for
   * instead, a skipped week already in the past, or a future week whose
   * deadline has lapsed unregistered. Without this check, browsing an
   * unrelated tournament from the season calendar would wrongly show the
   * human competing in it — see `previewTournamentDraw`.
   */
  private canPreviewAsHuman(weekIndex: number): boolean {
    if (this.state.career.tournamentEntries.some((e) => e.weekIndex === weekIndex)) return true;
    return weekIndex - this.state.calendar.weekIndex >= BALANCE.tournament.entryDeadlineWeeks;
  }

  /** The def a preview's "primary" bracket is built from — the human's
   * actual registered (possibly played-up) division if they registered for
   * this exact week, else their default division, so a played-up preview
   * never shows the wrong class. Doesn't imply the human is actually in that
   * bracket — see `canPreviewAsHuman`. */
  private previewPrimaryDef(weekIndex: number, defs: TournamentDef[]): TournamentDef {
    const registeredEntry = this.state.career.tournamentEntries.find((e) => e.weekIndex === weekIndex);
    return registeredEntry
      ? (this.content.tournaments[registeredEntry.tournamentId] ?? humanDivisionDef(this.state, defs))
      : humanDivisionDef(this.state, defs);
  }

  /**
   * A bracket-shaped preview of round 1 for a tournament that hasn't started
   * yet — null once it's actually begun (use `tournamentDraw`/
   * `completedDraw` instead) or if the week has no tournament. See
   * `tournament/engine.ts`'s `previewFirstRoundDraw`.
   */
  previewTournamentDraw(weekIndex: number): DrawRound[] | null {
    const defs = tournamentForWeek(this.content, weekIndex);
    if (!defs) return null;
    const def = this.previewPrimaryDef(weekIndex, defs);
    const entrants = this.canPreviewAsHuman(weekIndex)
      ? pickEntrants(this.state, def, weekIndex, this.content)
      : fullDivisionField(this.state, def, weekIndex, this.content);
    return previewFirstRoundDraw(this.state, def, weekIndex, entrants);
  }

  /** The def behind `previewTournamentDraw`'s bracket — lets callers tell
   * `Draw.svelte` which division is "primary" even when the human isn't
   * actually in it (see `canPreviewAsHuman`), same as `completedDraw`'s
   * `tournament` field. Null if the week has no tournament. */
  previewTournamentDef(weekIndex: number): TournamentDef | null {
    const defs = tournamentForWeek(this.content, weekIndex);
    return defs ? this.previewPrimaryDef(weekIndex, defs) : null;
  }

  /**
   * Every other division of `weekIndex`'s event besides the "primary" one
   * `previewTournamentDraw` shows — always the full field, never the human
   * (mirrors the live `otherDivisionDraws`' siblings), so the schedule's
   * draw preview can offer the same "Class B"/"Women A" browsing before a
   * tournament has even started. Empty if the week has no tournament.
   */
  previewOtherDivisionDraws(weekIndex: number): OtherDivisionDraw[] {
    const defs = tournamentForWeek(this.content, weekIndex);
    if (!defs) return [];
    const primaryDef = this.previewPrimaryDef(weekIndex, defs);
    return defs
      .filter((def) => def.id !== primaryDef.id)
      .map((def) => ({
        division: def.division,
        tournament: def,
        rounds: previewFirstRoundDraw(this.state, def, weekIndex, fullDivisionField(this.state, def, weekIndex, this.content)),
        concluded: false,
      }));
  }

  /**
   * A concluded tournament's full bracket (own division + every sibling),
   * snapshotted at the moment it ended — see `clearConcludedTournament`.
   * Null if this week was never played, or if the content that produced it
   * has since changed underneath an old save.
   */
  completedDraw(weekIndex: number): { tournament: TournamentDef; rounds: DrawRound[]; otherDivisions: OtherDivisionDraw[] } | null {
    const persisted = this.state.career.completedDraws[weekIndex];
    if (!persisted) return null;
    const tournament = this.content.tournaments[persisted.tournamentId];
    if (!tournament) return null;
    const otherDivisions = persisted.otherDivisions
      .map((other): OtherDivisionDraw | null => {
        const def = this.content.tournaments[other.tournamentId];
        return def ? { division: def.division, tournament: def, rounds: other.rounds, concluded: true } : null;
      })
      .filter((d): d is OtherDivisionDraw => d !== null);
    return { tournament, rounds: persisted.rounds, otherDivisions };
  }

  /**
   * Every other division of this week's event besides the human's own —
   * each fully AI-simulated (see `startSiblingSession`), advancing one
   * round every time `resolveTournamentMatch` does, so the human can follow
   * another class's bracket alongside their own (e.g. checking on class A
   * while playing class B). Empty whenever no tournament is active.
   */
  otherDivisionDraws(): OtherDivisionDraw[] {
    return [...this.siblingSessions.entries()].map(([division, session]) => ({
      division,
      tournament: session.def,
      rounds: drawRounds(this.state, session),
      concluded: isSiblingConcluded(session),
    }));
  }

  private ensureWeekSnapshot(): HumanSnapshot {
    if (!this.weekSnapshot) {
      const human = humanPlayer(this.state);
      this.weekSnapshot = {
        skills: { ...human.attributes.skills },
        fatigue: human.condition.fatigue,
        money: this.state.career.money,
        formBySport: { ...human.condition.formBySport },
        trainableAttributes: {
          endurance: human.attributes.endurance,
          coreStrength: human.attributes.coreStrength,
        },
      };
    }
    return this.weekSnapshot;
  }

  submitWeek(plan: PlayerPlan): WeekSummary {
    this.simulateUnplayedWorldTournaments();
    const snapshot = this.ensureWeekSnapshot();
    const outcome = simulateWeek(this.state, plan, this.content, this.log, snapshot);
    this.weekSnapshot = null;
    this.tournamentPreparationDone = false;
    return outcome.summary;
  }

  /**
   * The "living world" fix: any tournament division scheduled for this week
   * that the human's own session never touched — because they weren't
   * entered at all, no-showed, or aren't eligible for that gender/division —
   * still needs to happen. Real racketlon doesn't pause for one amateur
   * skipping a week: every other entrant plays their bracket out regardless,
   * and their ratings/FIR points/`recentResults` need to keep moving for the
   * world to feel alive (and for `Game.matchesForPlayer`'s opponent-profile
   * match history to ever show anything for a player the human hasn't shared
   * a tournament with yet).
   *
   * Reuses `startSiblingSession`/`finishSiblingSession` — the exact same
   * fully-AI mechanism already used to simulate another division alongside
   * the human's own live tournament — just run to completion headlessly for
   * every division `completedDraws[week]` doesn't already cover, gender
   * included (the human's own live session only ever covers their own
   * gender's siblings — see `enterTournament`). Called from `submitWeek`
   * *before* `simulateWeek` advances the calendar, so `weekIndex` here is
   * still the week actually concluding.
   */
  private simulateUnplayedWorldTournaments(): void {
    const week = this.state.calendar.weekIndex;
    if (this.tournamentSession && this.tournamentSession.weekIndex === week) return;
    const defs = tournamentForWeek(this.content, week);
    if (!defs) return;

    const existing = this.state.career.completedDraws[week];
    const covered = new Set<string>(
      existing ? [existing.tournamentId, ...existing.otherDivisions.map((o) => o.tournamentId)] : [],
    );
    const remaining = defs.filter((d) => !covered.has(d.id));
    if (remaining.length === 0) return;

    // For a fully-skipped week (no `existing` entry yet), whichever def ends
    // up "primary" is the one the UI's `tournamentDetail`/`Draw.svelte` shows
    // under the hardcoded "Your draw" tab — so pick the human's own division
    // (same resolution `tournamentThisWeek()` uses) rather than an arbitrary
    // first def, which could just as easily be the opposite gender's class.
    // The human still never played it, but "your draw" should at least mean
    // "the class you'd have been in," not a random bracket.
    const preferredId = existing ? null : humanDivisionDef(this.state, defs).id;
    const orderedRemaining = preferredId
      ? [...remaining].sort((a, b) => (a.id === preferredId ? -1 : b.id === preferredId ? 1 : 0))
      : remaining;

    const newDraws: PersistedOtherDivisionDraw[] = orderedRemaining.map((def) => {
      const session = startSiblingSession(this.state, def, week, this.content);
      finishSiblingSession(this.state, session, this.log);
      return { tournamentId: session.def.id, rounds: drawRounds(this.state, session) };
    });

    if (existing) {
      existing.otherDivisions.push(...newDraws);
    } else {
      const [primary, ...rest] = newDraws;
      if (!primary) return;
      this.state.career.completedDraws[week] = {
        tournamentId: primary.tournamentId,
        rounds: primary.rounds,
        otherDivisions: rest,
      } satisfies CompletedDraw;
    }
  }

  eventsForWeek(week: number): GameEvent[] {
    return eventsForWeek(this.log, week);
  }
}

function expectedWeeklyGain(
  counts: ActivityCounts,
  sport: Sport,
  startSkill: number,
  potential: number,
  fatigue: number,
  content: ContentBundle,
  age: number,
): number {
  const def = Object.values(content.activities).find((a) => a.sport === sport);
  if (!def || def.trainingBase === undefined) return 0;
  const sessions = counts[def.id] ?? 0;
  let skill = startSkill;
  let total = 0;
  for (let i = 0; i < sessions; i++) {
    const gain = expectedSessionGain(def.trainingBase, skill, potential, fatigue, age);
    total += gain;
    skill += gain;
  }
  return total;
}

/** 0..1 attribute → 1–20 display band, same convention as `unitFromLevel`. */
function levelFromUnit(u: number): number {
  return Math.max(1, Math.min(20, Math.round(u * 20)));
}

function traitView(content: ContentBundle, id: string): TraitView | null {
  const def = content.traits[id];
  if (!def) return null;
  return { id: def.id, name: def.name, category: def.category, tone: def.tone, description: def.description };
}

/**
 * `projectedFieldAsOf`, but tolerant of a tougher played-up class not having
 * enough tier-1 NPCs to fill its draw right now — the same shape a
 * genuinely under-subscribed real class would present, rather than a crash.
 * Only used for `eligibleDivisions`' non-default choices; the primary
 * (registered or own-division) field is never expected to hit this.
 */
function safeProjectedField(
  state: GameState,
  def: TournamentDef,
  weekIndex: number,
  content: ContentBundle,
  asOfWeek: number,
): Player[] {
  try {
    return projectedFieldAsOf(state, def, weekIndex, content, asOfWeek);
  } catch {
    return [];
  }
}

/** This player's real FIR World Ranking standing (points, rank), or null if
 * they have no counted result yet — shared by `get you()` and
 * `opponentProfile()` so both read the exact same ladder. */
function firStandingFor(state: GameState, playerId: string, gender: "m" | "f"): FirStandingView | null {
  const standings = firWorldRanking(state, gender);
  const row = standings.find((s) => s.playerId === playerId);
  return row ? { points: row.points, rank: row.rank } : null;
}

/** The whole gender's FIR standings, batched into a lookup — for building a
 * *list* of `OpponentView`s (a tournament field) without recomputing
 * `firWorldRanking` (an O(n log n) sort over the whole roster) once per
 * entrant. `firStandingFor` above stays the single-player version, used
 * where only one lookup is needed. */
function firStandingsMap(state: GameState, gender: "m" | "f"): Map<string, FirStandingView> {
  const standings = firWorldRanking(state, gender);
  return new Map(standings.map((s) => [s.playerId, { points: s.points, rank: s.rank }]));
}

function opponentView(p: Player, standings: Map<string, FirStandingView>): OpponentView {
  return {
    id: p.identity.id,
    name: fullName(p),
    nationality: p.identity.nationality,
    firStanding: standings.get(p.identity.id) ?? null,
    rating: Math.round(combinedRating(p)),
  };
}

/** Entrants for display, ranked players first (best FIR rank first),
 * unranked players after — the "official ladder" ordering the Tour
 * screen's field list uses, matching how `firWorldRanking` itself sorts. */
function rankedEntrants(players: Player[], standings: Map<string, FirStandingView>): OpponentView[] {
  return players
    .map((p) => opponentView(p, standings))
    .sort((a, b) => (a.firStanding?.rank ?? Infinity) - (b.firStanding?.rank ?? Infinity));
}

function gainBucket(expected: number): GainBucket {
  const f = BALANCE.forecast;
  if (expected >= f.sportPlusPlusPlus) return 3;
  if (expected >= f.sportPlusPlus) return 2;
  if (expected > 0.5) return 1;
  return 0;
}

function fatigueBucket(delta: number): FatigueBucket {
  const b = BALANCE.forecast.fatigueBuckets;
  if (delta <= b.bigDrop) return -2;
  if (delta < b.drop) return -1;
  if (delta <= b.flat) return 0;
  if (delta <= b.rise) return 1;
  return 2;
}
