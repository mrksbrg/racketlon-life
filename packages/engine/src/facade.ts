import { BALANCE } from "./balance.js";
import type { ContentBundle, TraitCategory, TraitTone } from "./content.js";
import { ageOn, weekLabel, weekLabelAt, yearOfWeek } from "./core/date.js";
import type { EventLog, GameEvent } from "./core/events.js";
import { eventsForWeek } from "./core/events.js";
import type { GameState, InboxMessage } from "./core/state.js";
import { SAVE_VERSION, humanPlayer } from "./core/state.js";
import type { ActivityCounts, PlayerPlan } from "./model/plan.js";
import { countsFromSlots } from "./model/plan.js";
import type { Player } from "./model/player.js";
import { fullName } from "./model/player.js";
import type { WeekSummary } from "./model/summary.js";
import type { Sport } from "./model/sport.js";
import { SPORTS, levelForSkill, levelProgress } from "./model/sport.js";
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
import type { HumanSnapshot } from "./systems/types.js";
import type { TravelCost } from "./systems/travel.js";
import { travelCost } from "./systems/travel.js";
import type { TournamentAdvanceResult, TournamentDef, TournamentSession } from "./tournament/engine.js";
import {
  advanceTournament,
  projectedField,
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

export interface InjuryView {
  /** a Sport, or "overuse" when it wasn't attributable to one */
  type: string;
  severity: number;
  weeksRemaining: number;
}

/** The five character-creation attributes, banded to the same 1–20 display
 * scale as sport levels — shown on the human's own Me screen, but never on
 * an `OpponentView` (docs/07's information-layer rule stays for opponents). */
export interface AttrsView {
  stamina: number;
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
  /** the five character-creation attributes, banded 1–20 */
  attrs: AttrsView;
  /** rolled personality traits — identity/flavor, shown to the player themself */
  traits: TraitView[];
  fatigue: number;
  money: number;
  form: number;
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
  roundsWon: number;
  totalRounds: number;
  won: boolean;
  prizeMoney: number;
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
  /** best career finish as roundsWon/totalRounds; null if none played yet */
  bestFinish: { roundsWon: number; totalRounds: number } | null;
  /** per-year breakdown, most recent year first */
  byYear: YearStats[];
  /** every tournament played, most recent first */
  results: TournamentResultView[];
}

/** "open" — can still register. "registered" — human has committed.
 * "closed" — the entryDeadlineWeeks window passed without registering. */
export type TourEntryStatus = "open" | "registered" | "closed";

export interface TourEntry {
  weekIndex: number;
  weekLabel: string;
  tournament: TournamentDef;
  isThisWeek: boolean;
  status: TourEntryStatus;
  /** the projected tier-1 NPC field — "who else has entered" */
  entrants: OpponentView[];
  /** flights + hotel/food forecast for this trip from home — see systems/travel.ts */
  travelCost: TravelCost;
}

export interface OpponentView {
  id: string;
  name: string;
  nationality: string;
  /** combined Glicko-2 rating, rounded — the layer other players are shown
   * through (docs/07's "three information layers"), never their true skill */
  rating: number;
  sports: Record<Sport, SportView>;
}

/** An inbox message with its arrival week resolved to a dated label. */
export interface InboxView extends InboxMessage {
  weekLabel: string;
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
      name: fullName(human),
      age: ageOn(this.state.calendar.mondayISO, human.identity.birthDate),
      nationality: human.identity.nationality,
      gender: human.identity.gender,
      sports,
      ratings,
      combinedRating: Math.round(combinedRating(human)),
      attrs: {
        stamina: levelFromUnit(human.attributes.stamina),
        intelligence: levelFromUnit(human.attributes.intelligence),
        clutch: levelFromUnit(human.attributes.clutch),
        composure: levelFromUnit(human.attributes.composure),
        resilience: levelFromUnit(human.attributes.durability),
      },
      traits: human.attributes.traits
        .map((id) => traitView(this.content, id))
        .filter((t): t is TraitView => t !== null),
      fatigue: Math.round(human.condition.fatigue),
      money: this.state.career.money,
      form: human.condition.form,
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
        roundsWon: Number(d.roundsWon ?? 0),
        totalRounds: Number(d.totalRounds ?? 0),
        won: e.type === "tournament.won",
        prizeMoney: Number(d.prizeMoney ?? 0),
      });
    }
    results.reverse(); // log is chronological; show most recent first

    const tally = (rs: TournamentResultView[]): StatTotals => ({
      tournamentsPlayed: rs.length,
      tournamentsWon: rs.filter((r) => r.won).length,
      finalsReached: rs.filter((r) => r.totalRounds > 0 && r.roundsWon >= r.totalRounds - 1).length,
      prizeMoney: rs.reduce((sum, r) => sum + r.prizeMoney, 0),
    });

    const years = [...new Set(results.map((r) => r.year))].sort((a, b) => b - a);
    const byYear: YearStats[] = years.map((year) => ({
      year,
      ...tally(results.filter((r) => r.year === year)),
    }));

    const bestFinish = results.reduce<{ roundsWon: number; totalRounds: number } | null>(
      (best, r) =>
        !best || r.roundsWon > best.roundsWon ? { roundsWon: r.roundsWon, totalRounds: r.totalRounds } : best,
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
    const { talent } = human.attributes;
    const { fatigue } = human.condition;
    const age = ageOn(this.state.calendar.mondayISO, human.identity.birthDate);

    const sports = {} as Record<Sport, GainBucket>;
    for (const sport of SPORTS) {
      let expected = expectedWeeklyGain(counts, sport, human.attributes.skills[sport], talent, fatigue, this.content, age);
      expected += BALANCE.training.physicalAllSportGain * (counts.physical ?? 0);
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
   * actually be *played* is `registeredTournamentThisWeek`.
   */
  tournamentThisWeek(): TournamentDef | null {
    return tournamentForWeek(this.content, this.state.calendar.weekIndex);
  }

  /**
   * This week's tournament, but only if the human registered for it at
   * least `entryDeadlineWeeks` in advance — the gate `enterTournament`
   * actually checks. There is no same-week fallback: miss the deadline and
   * this stays null even though `tournamentThisWeek` still reports the event.
   */
  registeredTournamentThisWeek(): TournamentDef | null {
    if (this.tournamentSession) return null;
    const def = this.tournamentThisWeek();
    if (!def) return null;
    const week = this.state.calendar.weekIndex;
    const registered = this.state.career.tournamentEntries.some(
      (e) => e.weekIndex === week && e.tournamentId === def.id,
    );
    return registered ? def : null;
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
    const homeCountry = humanPlayer(this.state).identity.nationality;
    const upcomingWeeks = [...calendar.keys()]
      .filter((w) => w >= thisWeekIndex)
      .sort((a, b) => a - b)
      .slice(0, count);

    return upcomingWeeks.map((weekIndex) => {
      const def = calendar.get(weekIndex)!;
      const registered = this.state.career.tournamentEntries.some(
        (e) => e.weekIndex === weekIndex && e.tournamentId === def.id,
      );
      const withinWindow = weekIndex - thisWeekIndex >= deadline;
      const status: TourEntryStatus = registered ? "registered" : withinWindow ? "open" : "closed";
      return {
        weekIndex,
        weekLabel: weekLabelAt(this.state.calendar, weekIndex),
        tournament: def,
        isThisWeek: weekIndex === thisWeekIndex,
        status,
        entrants: projectedField(this.state, def, weekIndex).map(opponentView),
        travelCost: travelCost(homeCountry, def, this.content),
      };
    });
  }

  /**
   * Registers for a future tournament — commits to playing it, but the
   * entry fee isn't charged until that week actually arrives and
   * `enterTournament` is called. Must be at least `entryDeadlineWeeks`
   * ahead of the tournament's own week; no same-week or late entry.
   */
  registerForTournament(weekIndex: number): void {
    const def = tournamentForWeek(this.content, weekIndex);
    if (!def) {
      throw new Error(`Week ${weekIndex} has no tournament to register for`);
    }
    const deadline = BALANCE.tournament.entryDeadlineWeeks;
    if (weekIndex - this.state.calendar.weekIndex < deadline) {
      throw new Error(`Entry deadline has passed for the tournament in week ${weekIndex}`);
    }
    const already = this.state.career.tournamentEntries.some(
      (e) => e.weekIndex === weekIndex && e.tournamentId === def.id,
    );
    if (already) return;
    this.state.career.tournamentEntries.push({ weekIndex, tournamentId: def.id });
    this.log.push({
      week: this.state.calendar.weekIndex,
      type: "tournament.registered",
      subject: this.state.career.playerId,
      data: { name: def.name, forWeek: weekIndex },
    });
  }

  /** Backs out of a future (or this week's, before playing it) registration. */
  withdrawRegistration(weekIndex: number): void {
    const idx = this.state.career.tournamentEntries.findIndex((e) => e.weekIndex === weekIndex);
    if (idx === -1) return;
    this.state.career.tournamentEntries.splice(idx, 1);
    this.log.push({
      week: this.state.calendar.weekIndex,
      type: "tournament.withdrew",
      subject: this.state.career.playerId,
      data: { forWeek: weekIndex },
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
    return match;
  }

  /** The human's current round match, if a tournament is in progress. */
  pendingTournamentMatch(): MatchState | null {
    return this.tournamentSession?.pendingMatch ?? null;
  }

  /**
   * Advances the bracket once the human's match has finished: records the
   * result, carries energy into the next round, or — on elimination or the
   * final win — awards prize money and converts the day's exertion into
   * fatigue, closing out the session.
   */
  resolveTournamentMatch(finishedMatch: MatchState): TournamentAdvanceResult {
    if (!this.tournamentSession) throw new Error("No active tournament to advance");
    const result = advanceTournament(this.state, this.tournamentSession, finishedMatch, this.log);
    if (result.status !== "nextRound") this.tournamentSession = null;
    return result;
  }

  private ensureWeekSnapshot(): HumanSnapshot {
    if (!this.weekSnapshot) {
      const human = humanPlayer(this.state);
      this.weekSnapshot = {
        skills: { ...human.attributes.skills },
        fatigue: human.condition.fatigue,
        money: this.state.career.money,
        form: human.condition.form,
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
  talent: number,
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
    const gain = expectedSessionGain(def.trainingBase, skill, talent, fatigue, age);
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

function opponentView(p: Player): OpponentView {
  const sports = {} as Record<Sport, SportView>;
  for (const sport of SPORTS) {
    const skill = p.attributes.skills[sport];
    sports[sport] = { level: levelForSkill(skill), progress: levelProgress(skill) };
  }
  return {
    id: p.identity.id,
    name: fullName(p),
    nationality: p.identity.nationality,
    rating: Math.round(combinedRating(p)),
    sports,
  };
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
