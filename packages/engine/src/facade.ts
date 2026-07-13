import { BALANCE } from "./balance.js";
import type { ContentBundle, TraitCategory, TraitTone } from "./content.js";
import { ageOn, dateForWeek, weekLabel, weekLabelAt, yearOfWeek } from "./core/date.js";
import type { EventLog, GameEvent } from "./core/events.js";
import { eventsForWeek } from "./core/events.js";
import type { GameState, InboxMessage } from "./core/state.js";
import { SAVE_VERSION, getPlayer, humanPlayer } from "./core/state.js";
import type { ActivityCounts, PlayerPlan } from "./model/plan.js";
import { countsFromSlots } from "./model/plan.js";
import type { Player } from "./model/player.js";
import { fullName } from "./model/player.js";
import type { WeekSummary } from "./model/summary.js";
import type { Sport } from "./model/sport.js";
import { SPORTS, levelForSkill, levelProgress, levelRangeForSkill } from "./model/sport.js";
import type { MatchState } from "./match/engine.js";
import { simulateWeek } from "./orchestrator.js";
import { recoveryAgeMultiplier } from "./systems/age.js";
import {
  expectedSessionGain,
  fatigueDeltaFromCounts,
  injuryLoad,
  injuryRiskBucket,
  moneyDeltaFromCounts,
} from "./systems/effects.js";
import { combinedRating } from "./systems/ranking.js";
import { firRacePointsTotal, firWorldRanking } from "./systems/ranking-points.js";
import type { HumanSnapshot } from "./systems/types.js";
import type { TravelCost } from "./systems/travel.js";
import { travelCost } from "./systems/travel.js";
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
  humanDivisionDef,
  humanEligibleDivisions,
  isSiblingConcluded,
  projectedField,
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
  /** expected net EUR, rounded — the one number shown as-is */
  money: number;
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
  stamina: number;
  coreStrength: number;
  intelligence: number;
  clutch: number;
  composure: number;
  resilience: number;
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
  round: number;
  totalRounds: number;
  opponentId: string;
  opponentName: string;
  won: boolean;
  /** total points across all 4 sports — racketlon's real match winner
   * (aggregate points, not sets won); see match/engine.ts's module doc. */
  totalA: number;
  totalB: number;
  sets: RecentMatchSetView[];
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
  weekLabel: string;
  name: string;
  division: string;
  finishingPosition: number;
  tiedCount: number;
  matchesPlayed: number;
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
 * (every entrant of a simulated tournament earns points, not just the
 * human — see tournament/engine.ts's `recordEntrantResults`). Points earned
 * outside any tournament the human's own session actually simulates (their
 * own division, or a sibling division running alongside it) still don't
 * exist — there's no full-world background simulation yet, so an NPC's Race
 * points stay 0 until they've actually shared a session with the human.
 * `rating` is the combined Glicko-2 estimate, explicitly a companion stat,
 * never the ranking itself.
 */
export interface RankingRowView {
  rank: number;
  playerId: string;
  name: string;
  nationality: string;
  points: number;
  racePoints: number;
  rating: number;
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

export class Game {
  /** ephemeral session/orchestration state — never part of GameState or SaveGame */
  private tournamentSession: TournamentSession | null = null;
  /** every other division of this week's event, fully AI-simulated in
   * lockstep with `tournamentSession` — see `otherDivisionDraws`. Empty
   * whenever no tournament is active. */
  private siblingSessions: Map<DivisionCode, TournamentSession> = new Map();
  private weekSnapshot: HumanSnapshot | null = null;

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
        stamina: levelFromUnit(human.attributes.stamina),
        coreStrength: levelFromUnit(human.attributes.coreStrength),
        intelligence: levelFromUnit(human.attributes.intelligence),
        clutch: levelFromUnit(human.attributes.clutch),
        composure: levelFromUnit(human.attributes.composure),
        resilience: levelFromUnit(human.attributes.durability),
      },
      traits: human.attributes.traits
        .map((id) => traitView(this.content, id))
        .filter((t): t is TraitView => t !== null),
      fatigue: Math.round(human.condition.fatigue),
      soreness: Math.round(human.condition.soreness),
      money: this.state.career.money,
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
   * The human's individual match history, newest first, capped at `limit` —
   * one row per match played (not per tournament placement), mined from the
   * event log's `match.played` entries (tournament/engine.ts's
   * `advanceTournament`). See `RecentMatchView`.
   */
  recentMatches(limit = 15): RecentMatchView[] {
    const humanId = this.state.career.playerId;
    const matches: RecentMatchView[] = [];
    for (const e of this.log) {
      if (e.subject !== humanId || e.type !== "match.played") continue;
      const d = e.data ?? {};
      const sets = (d.sets as { a: number; b: number }[] | undefined ?? []).map((s, i) => ({
        sport: SPORTS[i]!,
        a: s.a,
        b: s.b,
      }));
      matches.push({
        week: e.week,
        weekLabel: weekLabelAt(this.state.calendar, e.week),
        tournamentName: String(d.tournamentName ?? "Tournament"),
        round: Number(d.round ?? 0),
        totalRounds: Number(d.totalRounds ?? 0),
        opponentId: String(d.opponentId ?? ""),
        opponentName: String(d.opponentName ?? ""),
        won: Boolean(d.won),
        totalA: sets.reduce((sum, s) => sum + s.a, 0),
        totalB: sets.reduce((sum, s) => sum + s.b, 0),
        sets,
      });
    }
    matches.reverse(); // log is chronological; show most recent first
    return matches.slice(0, limit);
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
        const range = levelRangeForSkill(skill, BALANCE.opponentInfo.levelRangeWidth);
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
        weekLabel: weekLabelAt(this.state.calendar, r.weekIndex),
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
        racePoints: firRacePointsTotal(player.firResults, this.state.calendar),
        rating: Math.round(combinedRating(player)),
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
      fatigueDeltaFromCounts(counts, this.content) - BALANCE.recovery.weeklyBase * recoveryAgeMultiplier(age);
    const { earned, spent } = moneyDeltaFromCounts(counts, this.content);
    const net = earned - spent - BALANCE.economy.weeklyExpenses;
    const rounding = BALANCE.forecast.moneyRounding;

    return {
      sports,
      fatigue: fatigueBucket(fatigueDelta),
      money: Math.round(net / rounding) * rounding,
      injuryRisk: injuryRiskBucket(injuryLoad(counts, this.content, fatigue)),
    };
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
        entrants: rankedEntrants(projectedField(this.state, def, weekIndex, this.content), standings),
        travelCost: travelCost(homeCountry, def, this.content),
        eligibleDivisions: eligible.map((eligibleDef) => ({
          def: eligibleDef,
          entrants: rankedEntrants(safeProjectedField(this.state, eligibleDef, weekIndex, this.content), standings),
        })),
      };
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
  enterTournament(): MatchState {
    const def = this.registeredTournamentThisWeek();
    if (!def) throw new Error("Not registered for a tournament this week");
    this.ensureWeekSnapshot();
    this.tournamentSession = startTournament(this.state, def, this.content, this.log);
    const match = this.tournamentSession.pendingMatch;
    if (!match) throw new Error("Tournament started with no pending match");

    const weekIndex = this.state.calendar.weekIndex;
    const siblingDefs = (tournamentForWeek(this.content, weekIndex) ?? []).filter(
      (d) => d.eventId === def.eventId && d.division !== def.division,
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
   * fatigue, closing out the session. Every other division's sibling
   * session (see `otherDivisionDraws`) advances one round in lockstep; once
   * the human's own tournament concludes, any siblings still going are
   * fast-forwarded straight to their own final result rather than left
   * mid-bracket.
   */
  resolveTournamentMatch(finishedMatch: MatchState): TournamentAdvanceResult {
    if (!this.tournamentSession) throw new Error("No active tournament to advance");
    const result = advanceTournament(this.state, this.tournamentSession, finishedMatch, this.log);
    for (const sibling of this.siblingSessions.values()) advanceSiblingSession(this.state, sibling);
    if (result.status !== "nextRound") {
      for (const sibling of this.siblingSessions.values()) finishSiblingSession(this.state, sibling);
      this.tournamentSession = null;
    }
    return result;
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
          stamina: human.attributes.stamina,
          coreStrength: human.attributes.coreStrength,
        },
      };
    }
    return this.weekSnapshot;
  }

  submitWeek(plan: PlayerPlan): WeekSummary {
    const snapshot = this.ensureWeekSnapshot();
    const outcome = simulateWeek(this.state, plan, this.content, this.log, snapshot);
    this.weekSnapshot = null;
    return outcome.summary;
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
 * `projectedField`, but tolerant of a tougher played-up class not having
 * enough tier-1 NPCs to fill its draw right now — the same shape a
 * genuinely under-subscribed real class would present, rather than a crash.
 * Only used for `eligibleDivisions`' non-default choices; the primary
 * (registered or own-division) field is never expected to hit this.
 */
function safeProjectedField(state: GameState, def: TournamentDef, weekIndex: number, content: ContentBundle): Player[] {
  try {
    return projectedField(state, def, weekIndex, content);
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
