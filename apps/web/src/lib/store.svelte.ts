import { defaultContent } from "@racketlon/content";
import type {
  ActivityType,
  CareerStatsView,
  CharacterDraft,
  DivisionCode,
  DrawRound,
  Forecast,
  HumanView,
  InboxView,
  InjurySpanView,
  MatchState,
  OpponentMatchCountView,
  OpponentProfileView,
  OtherDivisionDraw,
  PlayerMatchView,
  RankingRowView,
  RecentMatchView,
  RecordsView,
  ReservedSlot,
  SaveGame,
  SeasonTournamentEntry,
  Sport,
  SportView,
  Tactic,
  TourEntry,
  TournamentAdvanceResult,
  TournamentDef,
  TravelBlock,
  TrainedWeekView,
  TrainingForecastEntry,
  TrophyView,
  WeekModifierView,
  WeekSummary,
} from "@racketlon/engine";
import {
  BALANCE,
  DEFAULT_START_MONDAY,
  Game,
  PERIODS,
  SLOTS_PER_WEEK,
  SPORTS,
  aiChooseTactic,
  chooseGummiarmServe,
  emptyPlan,
  resumeMatch,
  setTactic,
  slotIndex,
} from "@racketlon/engine";
import { del, get, set } from "idb-keyval";
import type { StatKey } from "./character";
import { adjust, attrPointsRemaining, randomDraft, randomName, rerollStats, sportPointsRemaining } from "./character";

const SAVE_KEY = "racketlon-life-save";
const HUMAN_PORTRAIT_SEED_KEY = "racketlon-life-human-portrait-seed";

function newPortraitSeed(): string {
  return `human-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

/** How many upcoming tournament weeks `tourEntries` requests — generous
 * headroom over the current ~16-event season calendar so the Tour screen
 * shows the whole season, not just a rolling few weeks ahead. */
const SEASON_HORIZON = 30;

export type Screen =
  | "loading"
  | "create"
  | "planner"
  | "tour"
  | "rankings"
  | "inbox"
  | "world"
  | "me"
  | "simulating"
  | "summary"
  | "match"
  | "draw"
  | "opponent"
  | "tournamentDetail";

/** Screens reachable from the bottom tab bar (docs/07's nav model — full-screen
 * flows like match/summary/create run over the top, without it). */
export type TabScreen = "planner" | "tour" | "rankings" | "world" | "me";

/** Screens that show the persistent bottom tab bar. */
export const TAB_SCREENS: readonly Screen[] = ["planner", "tour", "rankings", "world", "me"];

/** Rankings screen UI state — see `GameStore.rankingsView` etc. for why this
 * lives on the store instead of as component-local state. */
export type RankingsView = "fir" | "race" | "ratings";
export type RankingsSortKey = "points" | "racePoints" | "rating";
export type RankingsSortDir = "asc" | "desc";
export type RankingsRatingSport = "tt" | "bd" | "sq" | "tn";

/** Me screen's tab — see `GameStore.meSection` for why this lives on the
 * store instead of as component-local state. */
export type MeSection = "characteristics" | "history" | "records" | "trophies";

export type MatchSpeed = 1 | 2 | 3;

/** One line of the "coming up" strip (`ComingUp.svelte`) — a Civ-build-
 * queue-style "something's always about to finish" read on the near future,
 * shown on the Planner and right after Summary. Deliberately narrow: only
 * near-term, already-derivable facts (this plan's pace, a deadline about to
 * shut, this month's payday), never a new prediction the engine doesn't
 * already support. */
export type ComingUpItem =
  | { kind: "training"; sport: Sport; nextLevel: number; weeksToLevelUp: number }
  | { kind: "deadline"; name: string }
  | { kind: "payday"; weeks: 0 | 1 };

/** `TournamentAdvanceResult` minus the "nextRound" variant — what
 * `store.concludedTournament` actually holds, since it's only ever set once
 * a tournament has genuinely ended (see `finishMatch`). */
export type ConcludedTournamentResult = Exclude<TournamentAdvanceResult, { status: "nextRound" }>;

export interface TournamentContext {
  name: string;
  round: number;
  totalRounds: number;
  /** e.g. "Quarterfinal" or "Plate Semifinal" — see DrawSection.roundName */
  roundName: string;
  isMainDraw: boolean;
}

const DAY = { Mon: 0, Tue: 1, Wed: 2, Thu: 3, Fri: 4, Sat: 5, Sun: 6 } as const;
const PERIOD = { Mor: 0, Aft: 1, Eve: 2 } as const;
const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri"] as const;

export const TRAIN_FOR: Record<Sport, ActivityType> = {
  tt: "trainTT",
  bd: "trainBD",
  sq: "trainSQ",
  tn: "trainTN",
};

function blankWeek(): ActivityType[] {
  return Array.from({ length: SLOTS_PER_WEEK }, () => "rest" as ActivityType);
}

function put(slots: ActivityType[], day: keyof typeof DAY, period: keyof typeof PERIOD, activity: ActivityType): void {
  slots[slotIndex(DAY[day], PERIOD[period])] = activity;
}

/** Sports ranked by current level, best first; ties break by sport order so
 * the ranking (and therefore every template built from it) stays stable. */
function rankSports(sports: Record<Sport, SportView>): Sport[] {
  return [...SPORTS].sort((a, b) => sports[b].level - sports[a].level || SPORTS.indexOf(a) - SPORTS.indexOf(b));
}

/**
 * Quick-plan templates: each builds a full 21-slot week from the player's
 * current sport ranking (best → worst), so "train best sport" always means
 * whichever sport currently has the highest level, not a fixed one.
 */
export const TEMPLATES: Record<string, (ranked: Sport[]) => ActivityType[]> = {
  Balanced: (ranked) => {
    const slots = blankWeek();
    for (const day of WEEKDAYS) {
      put(slots, day, "Mor", "work");
      put(slots, day, "Aft", "work");
    }
    put(slots, "Tue", "Eve", TRAIN_FOR[ranked[0]!]);
    put(slots, "Thu", "Eve", TRAIN_FOR[ranked[1]!]);
    put(slots, "Fri", "Eve", "social");
    put(slots, "Sat", "Mor", TRAIN_FOR[ranked[0]!]);
    put(slots, "Sat", "Aft", TRAIN_FOR[ranked[2]!]);
    put(slots, "Sun", "Mor", TRAIN_FOR[ranked[1]!]);
    put(slots, "Sun", "Aft", "social");
    return slots;
  },

  "Focus on work": (ranked) => {
    const slots = blankWeek();
    for (const day of WEEKDAYS) {
      put(slots, day, "Mor", "work");
      put(slots, day, "Aft", "work");
    }
    put(slots, "Tue", "Eve", "work");
    put(slots, "Thu", "Eve", "work");
    put(slots, "Wed", "Eve", TRAIN_FOR[ranked[0]!]);
    put(slots, "Fri", "Eve", "social");
    put(slots, "Sat", "Mor", "gym");
    put(slots, "Sun", "Mor", "social");
    put(slots, "Sun", "Aft", "social");
    return slots;
  },

  Recovery: () => {
    const slots = blankWeek();
    // A deload week: no racket sessions, but keep light PT. Gym/cardio
    // build attributes only, so sport skills cannot move while fatigue and
    // injury risk come down hard. Work the normal Mon-Fri job so a recovery
    // week spends no vacation days — it's the "rest without burning leave"
    // option.
    for (const day of WEEKDAYS) { put(slots, day, "Mor", "work"); put(slots, day, "Aft", "work"); }
    put(slots, "Wed", "Eve", "cardio");
    put(slots, "Fri", "Eve", "social");
    put(slots, "Sat", "Aft", "gym");
    return slots;
  },

  "Training camp": (ranked) => {
    const slots = blankWeek();
    // no job at all — a mix of all four racket sports + gym work,
    // cycling through the player's own ranking so every sport gets court
    // time, across Mon-Fri (minus Wed evening, which is social)
    const cycle: ActivityType[] = [
      TRAIN_FOR[ranked[0]!],
      TRAIN_FOR[ranked[1]!],
      TRAIN_FOR[ranked[2]!],
      TRAIN_FOR[ranked[3]!],
      "gym",
    ];
    const weekdaySlots: Array<[keyof typeof DAY, keyof typeof PERIOD]> = [
      ["Mon", "Mor"], ["Mon", "Aft"], ["Mon", "Eve"],
      ["Tue", "Mor"], ["Tue", "Aft"], ["Tue", "Eve"],
      ["Wed", "Mor"], ["Wed", "Aft"],
      ["Thu", "Mor"], ["Thu", "Aft"], ["Thu", "Eve"],
      ["Fri", "Mor"], ["Fri", "Aft"], ["Fri", "Eve"],
    ];
    weekdaySlots.forEach(([day, period], i) => put(slots, day, period, cycle[i % cycle.length]!));
    put(slots, "Wed", "Eve", "social");
    put(slots, "Sat", "Mor", "social");
    put(slots, "Sat", "Eve", "social");
    return slots;
  },
};

class GameStore {
  screen = $state<Screen>("loading");
  slots = $state<ActivityType[]>(emptyPlan().slots);
  draft = $state<CharacterDraft>(randomDraft());
  /** Presentation-only identity; deliberately kept out of CharacterDraft and engine saves. */
  draftPortraitSeed = $state(newPortraitSeed());
  /** The creation-screen seed promoted to the active career and persisted beside the save. */
  humanPortraitSeed = $state<string | null>(null);
  summary = $state<WeekSummary | null>(null);
  match = $state<MatchState | null>(null);
  matchSpeed = $state<MatchSpeed>(2);
  tournamentContext = $state<TournamentContext | null>(null);
  /** true while the player is studying the draw before their next match has
   * been entered (the "draw-first" tournament flow) — drives whether the Draw
   * screen shows a "Play match ▸" kickoff button or a "‹ Back to match" peek
   * affordance. Set when entering a tournament and between rounds; cleared once
   * the match is actually entered. */
  awaitingKickoff = $state(false);
  /** set once the human's own tournament has fully concluded (won or
   * eliminated) but the Draw screen is still showing the final bracket for
   * browsing — see `finishMatch`/`continueAfterTournament`. Null the rest of
   * the time, including mid-tournament. */
  concludedTournament = $state<ConcludedTournamentResult | null>(null);
  /** id of the player whose profile is open, and the screen to return to —
   * set together by `viewOpponent`, so the profile can be reached from any
   * tab/draw/field-list context and hand back to exactly where it opened. */
  viewingOpponentId = $state<string | null>(null);
  /** week whose draw is open on the `tournamentDetail` screen — set together
   * with a `screenStack` push by `viewTournamentDetail`, same pattern as
   * `viewingOpponentId`. Null the rest of the time. */
  viewingTournamentWeek = $state<number | null>(null);
  /** Which division tab (`OtherDivisionDraw.tournament.id`, or null for the
   * primary/"Your draw" bracket) was last selected on the tournamentDetail
   * screen, per week — so tapping a player's name to open their profile and
   * then backing out lands back on the same division instead of resetting
   * to the primary one (Draw.svelte's own `viewing` state is destroyed when
   * it unmounts for the opponent-profile overlay). Only read/written by
   * Draw.svelte's non-live modes; the live in-progress draw keeps its own
   * component-local selection, since its choreography is session-scoped by
   * design. Never persisted to the save — pure session UI memory. */
  viewingDivisionByWeek: Record<number, string | null> = $state({});
  /** Horizontal scroll offset within a division's bracket sheet, keyed
   * `${week}:${divisionId ?? "primary"}` — the companion to
   * `viewingDivisionByWeek`: scrolling to the final and stepping away (or
   * switching tabs and back) shouldn't snap back to round 1. */
  viewingScrollByDivision: Record<string, number> = $state({});
  /** Overlay navigation history: `openInbox`/`viewOpponent`/
   * `viewTournamentDetail` each push the screen they're opening *from*, and
   * their matching close method pops it back. A single non-stack slot isn't
   * enough once overlays nest (e.g. opening a draw from inside the inbox) —
   * a second push would clobber the first overlay's own return screen,
   * stranding the user unable to back out past it. `goToTab` also pops when
   * used as an inbox shortcut (its one bypass of the dedicated close
   * methods), so every push always has exactly one matching pop. */
  private screenStack = $state<Screen[]>([]);

  /** Game is a non-reactive class; bumped after every simulated week so views refresh. */
  private version = $state(0);
  private game: Game | null = null;

  readonly you: HumanView | null = $derived.by(() => {
    this.version;
    return this.game ? this.game.you : null;
  });

  /** Lifetime + per-year career statistics for the Me screen. */
  readonly careerStats: CareerStatsView | null = $derived.by(() => {
    this.version;
    return this.game ? this.game.careerStats() : null;
  });

  /** Every podium (top-3) finish of the career, newest first — the Me
   * screen's trophy cabinet. */
  readonly trophyCabinet: TrophyView[] = $derived.by(() => {
    this.version;
    return this.game ? this.game.trophyCabinet() : [];
  });

  /** Personal-best records (biggest win/loss, per-sport bests, highest
   * ranked win, gummiarm tally) — the Me screen's Records tab. */
  readonly records: RecordsView | null = $derived.by(() => {
    this.version;
    return this.game ? this.game.records() : null;
  });

  /** Every individual match the human played in one specific week — the Tour
   * season list's "expand a played event" detail. */
  matchesForWeek(weekIndex: number): RecentMatchView[] {
    if (!this.game) return [];
    return this.game.matchesForWeek(weekIndex);
  }

  /** Every individual match the human played in one calendar year, newest
   * first, no cap — the Me screen's year-scoped "Recent matches" list
   * (finer-grained than `careerStats().results`, which is per-tournament
   * placement, not per-opponent). */
  matchesForYear(year: number): RecentMatchView[] {
    if (!this.game) return [];
    return this.game.matchesForYear(year);
  }

  /** Every opponent the human has faced, tallied by matches played, most
   * played first — the Me screen's "Most played opponents" card. */
  mostPlayedOpponents(): OpponentMatchCountView[] {
    if (!this.game) return [];
    return this.game.mostPlayedOpponents();
  }

  /** Every match the human has played against one specific opponent, newest
   * first, no cap — the opponent profile screen's "Head-to-head" card. */
  headToHead(opponentId: string): RecentMatchView[] {
    if (!this.game) return [];
    return this.game.matchesAgainst(opponentId);
  }

  /** Every match a given player (human or NPC) has been in, across every
   * tournament bracket the human's session has touched — the opponent
   * profile screen's "Match history" card. */
  matchesForPlayer(playerId: string): PlayerMatchView[] {
    if (!this.game) return [];
    return this.game.matchesForPlayer(playerId);
  }

  /** Which gender's ladder the Rankings screen shows — defaults to the
   * human's own gender until explicitly switched. */
  private rankingsGenderOverride = $state<"m" | "f" | null>(null);

  readonly rankingsGender: "m" | "f" = $derived.by(() => this.rankingsGenderOverride ?? this.you?.gender ?? "m");

  setRankingsGender(gender: "m" | "f"): void {
    this.rankingsGenderOverride = gender;
  }

  /** Rankings screen UI state (view tab, sort, rating-sport tab, page) —
   * lifted out of Rankings.svelte because that component unmounts whenever
   * the screen changes (see App.svelte's `{#if store.screen === ...}`
   * routing), so anything kept as local component state resets to its
   * default instead of restoring what the player last had selected when
   * they back out of an opponent profile and return to Rankings. */
  rankingsView = $state<RankingsView>("fir");
  rankingsSortKey = $state<RankingsSortKey>("points");
  rankingsSortDir = $state<RankingsSortDir>("desc");
  rankingsRatingSport = $state<RankingsRatingSport>("tt");
  rankingsPage = $state(0);

  /** Me screen's selected tab — lifted out of Me.svelte for the same reason
   * as the Rankings state above: tapping a player's name (e.g. from a
   * Records row) navigates to the "opponent" screen and back, unmounting
   * Me.svelte in between, so component-local state would silently reset to
   * "characteristics" instead of returning to the tab the player was on. */
  meSection = $state<MeSection>("characteristics");

  /** FIR World Ranking (primary sort) + Tour Race + Glicko, for whichever
   * gender `rankingsGender` currently points at — see `Game.rankings`. */
  readonly rankings: RankingRowView[] = $derived.by(() => {
    this.version;
    return this.game ? this.game.rankings(this.rankingsGender) : [];
  });

  /** The open opponent profile, if any — see `viewOpponent`. */
  readonly opponentProfile: OpponentProfileView | null = $derived.by(() => {
    this.version;
    if (!this.game || !this.viewingOpponentId) return null;
    return this.game.opponentProfile(this.viewingOpponentId);
  });

  /** Diegetic message feed, newest first. */
  readonly inbox: InboxView[] = $derived.by(() => {
    this.version;
    return this.game ? this.game.inbox : [];
  });

  /** Unread message count — drives the envelope badge. */
  readonly unreadCount: number = $derived.by(() => {
    this.version;
    return this.game ? this.game.unreadCount : 0;
  });

  /** Informational only — a tournament exists this week regardless of
   * registration. Drives the "you missed the deadline" note on the planner. */
  readonly tournamentThisWeek: TournamentDef | null = $derived.by(() => {
    this.version;
    if (!this.game) return null;
    return this.game.tournamentThisWeek();
  });

  /** This week's tournament, only if registered for it in advance — the
   * actionable one. There's no same-week fallback: miss the entry deadline
   * and this stays null even though `tournamentThisWeek` still shows it. */
  readonly registeredTournamentThisWeek: TournamentDef | null = $derived.by(() => {
    this.version;
    if (!this.game) return null;
    return this.game.registeredTournamentThisWeek();
  });

  /** The whole season's calendar, not just a rolling few weeks — the Tour
   * screen renders these as collapsed cards, so showing the full season is
   * cheap. SEASON_HORIZON is generous headroom over the ~16-event calendar
   * (packages/content/data/tournaments.json), not a tight count to keep in
   * sync as events are added. */
  readonly tourEntries: TourEntry[] = $derived.by(() => {
    this.version;
    return this.game ? this.game.tournamentSchedule(SEASON_HORIZON) : [];
  });

  /** Whether the current balance covers this week's tournament trip (entry
   * fee + flights/hotel), if there is one — drives the disabled state on
   * "Play tournament"/"Play now". True (nothing to block) when there's no
   * tournament this week. */
  readonly canAffordTournamentThisWeek: boolean = $derived.by(() => {
    const entry = this.tourEntries.find((e) => e.isThisWeek);
    if (!entry || !this.you) return true;
    return this.you.money >= entry.tournament.entryFee + entry.travelCost.total;
  });

  /** Every tournament of the current in-game year, oldest first — the Tour
   * screen's full-year list. Unlike `tourEntries` (upcoming-only) or the
   * ephemeral live draw, this stays reachable for a played event long after
   * the week it happened, since "played" status comes from the durable
   * event log (`Game.careerStats`), not the tournament session. */
  readonly seasonTournaments: SeasonTournamentEntry[] = $derived.by(() => {
    this.version;
    return this.game ? this.game.seasonTournaments(this.game.year) : [];
  });

  /** The human's current injury as a real date span, for the season
   * calendar — null whenever uninjured. */
  readonly injurySpan: InjurySpanView | null = $derived.by(() => {
    this.version;
    return this.game ? this.game.currentInjurySpan() : null;
  });

  /** Every week (so far) the human trained, resolved to a real date — the
   * season calendar's training history. */
  readonly trainedWeeks: TrainedWeekView[] = $derived.by(() => {
    this.version;
    return this.game ? this.game.trainedWeekDates() : [];
  });

  /** The human's national public holidays for the current calendar year —
   * the season calendar marks these red. */
  readonly holidays: { date: string; name: string }[] = $derived.by(() => {
    this.version;
    return this.game ? this.game.humanPublicHolidays(this.game.year) : [];
  });

  /** Vacation days the currently-drafted week would spend — live "this week
   * uses X days" feedback before the week is simulated. Uses the resolved
   * plan (travel/tournament overrides applied), matching what Simulate
   * actually submits — a disabled travel/tournament slot's hidden draft
   * activity underneath must not be read as "work". */
  readonly vacationCostThisWeek: number = $derived.by(() => {
    this.version;
    return this.game ? this.game.vacationCostThisWeek({ slots: this.availableSlots() }) : 0;
  });

  readonly weekLabel: string = $derived.by(() => {
    this.version;
    return this.game ? this.game.weekLabel : "";
  });

  readonly year: number = $derived.by(() => {
    this.version;
    return this.game ? this.game.year : 0;
  });


  readonly travelBlocksThisWeek: TravelBlock[] = $derived.by(() => {
    this.version;
    return this.game ? this.game.travelBlocksThisWeek() : [];
  });

  readonly tournamentBlocksThisWeek: TravelBlock[] = $derived.by(() => {
    this.version;
    return this.game ? this.game.tournamentBlocksThisWeek() : [];
  });

  /** Slots already committed via a decision-event choice (e.g. a sparring
   * invite's proposed evening) — forced into the drafted plan and shown as
   * non-editable, same treatment as travel/tournament blocks above. */
  readonly reservedSlotsThisWeek: ReservedSlot[] = $derived.by(() => {
    this.version;
    return this.game ? this.game.reservedSlotsThisWeek() : [];
  });

  /** This week's rolled modifier (fun-plan P3), if any — the Planner
   * banner and, when it blocks a sport, the picker's disabled reason. */
  readonly weekModifier: WeekModifierView | null = $derived.by(() => {
    this.version;
    return this.game ? this.game.weekModifier() : null;
  });

  readonly weekIndex: number = $derived.by(() => {
    this.version;
    return this.game ? this.game.weekIndex : 0;
  });

  /** the 7 real ISO dates (Mon–Sun) of the week currently being planned —
   * mirrors SeasonCalendar's own `DEFAULT_START_MONDAY + weekIndex*7` math,
   * since weeks always advance by exactly 7 days. */
  readonly weekDates: string[] = $derived.by(() => {
    const monday = new Date(`${DEFAULT_START_MONDAY}T00:00:00Z`).getTime() + this.weekIndex * 7 * 86_400_000;
    return Array.from({ length: 7 }, (_, i) => new Date(monday + i * 86_400_000).toISOString().slice(0, 10));
  });

  readonly forecast: Forecast | null = $derived.by(() => {
    this.version;
    if (!this.game) return null;
    return this.game.previewPlan({ slots: this.availableSlots() });
  });

  /** "At this pace" level-up ETA per sport for the currently drafted plan —
   * see `Game.trainingForecast`. Reads the same draft `this.slots` the
   * forecast bar does, so on the Summary screen (where the draft still
   * holds whatever was just submitted — see `nextWeek`) this reads as "if
   * you keep doing this," not a stale pre-week guess. */
  readonly trainingForecast: TrainingForecastEntry[] = $derived.by(() => {
    this.version;
    if (!this.game) return [];
    return this.game.trainingForecast({ slots: this.availableSlots() });
  });

  /** Weeks until this month's salary lands — see `Game.weeksUntilPayday`. */
  readonly weeksUntilPayday: number = $derived.by(() => {
    this.version;
    return this.game ? this.game.weeksUntilPayday() : 0;
  });

  /** Registered-but-not-yet tournament entries one week from their entry
   * deadline closing for good — the last realistic nudge before an "open"
   * `tourEntries` row flips to "closed" (`entryDeadlineWeeks`, no same-week
   * fallback — see `tournamentSchedule`). */
  readonly closingSoonEntries: TourEntry[] = $derived.by(() =>
    this.tourEntries.filter(
      (e) => e.status === "open" && e.weekIndex - this.weekIndex === BALANCE.tournament.entryDeadlineWeeks,
    ),
  );

  /** The Planner/Summary "coming up" strip: the soonest couple of training
   * ETAs plus any near-term deadline/payday nudges — deliberately capped so
   * it stays a glance, not a report (see `ComingUp.svelte`). */
  readonly comingUp: ComingUpItem[] = $derived.by(() => {
    const items: ComingUpItem[] = this.trainingForecast
      .slice(0, 2)
      .map((f) => ({ kind: "training", sport: f.sport, nextLevel: f.nextLevel, weeksToLevelUp: f.weeksToLevelUp }) as const);
    for (const entry of this.closingSoonEntries) items.push({ kind: "deadline", name: entry.tournament.name });
    if (this.weeksUntilPayday <= 1) items.push({ kind: "payday", weeks: this.weeksUntilPayday as 0 | 1 });
    return items;
  });

  /** Points still to spend in the creation screen — sports and traits are
   * independent pools (see character.ts), so each gates separately. */
  readonly sportPointsLeft: number = $derived(sportPointsRemaining(this.draft));
  readonly attrPointsLeft: number = $derived(attrPointsRemaining(this.draft));

  /** Within budget on both pools and a name entered — everything Start needs.
   * We allow leftover points (`>= 0`, not exact `=== 0`): the progressive
   * sport costs mean the last point or two can't always land on exactly zero,
   * and requiring an exact spend would softlock the flow. The label still
   * nudges the player to spend what's left. */
  readonly canStartCareer: boolean = $derived(
    this.sportPointsLeft >= 0 &&
      this.attrPointsLeft >= 0 &&
      this.draft.firstName.trim().length > 0 &&
      this.draft.lastName.trim().length > 0,
  );

  async init(): Promise<void> {
    let save: SaveGame | undefined;
    let savedPortraitSeed: string | undefined;
    try {
      save = await get<SaveGame>(SAVE_KEY);
    } catch {
      save = undefined;
    }
    if (!save) {
      // no career yet — build one on the character-creation screen
      this.draft = randomDraft();
      this.draftPortraitSeed = newPortraitSeed();
      this.humanPortraitSeed = null;
      this.screen = "create";
      return;
    }
    try {
      savedPortraitSeed = await get<string>(HUMAN_PORTRAIT_SEED_KEY);
    } catch {
      savedPortraitSeed = undefined;
    }
    try {
      this.game = Game.fromSave(save, defaultContent);
    } catch {
      // corrupt or incompatible save — start fresh rather than brick the app
      this.draft = randomDraft();
      this.draftPortraitSeed = newPortraitSeed();
      this.humanPortraitSeed = null;
      this.screen = "create";
      return;
    }
    this.humanPortraitSeed = savedPortraitSeed ?? `human-career-${save.state.seed}`;
    this.version++;
    this.screen = "planner";
  }

  // --- character creation ---

  rerollCharacter(): void {
    this.draft = randomDraft();
    this.draftPortraitSeed = newPortraitSeed();
  }

  rerollName(): void {
    const { first, last } = randomName(this.draft.nationality, this.draft.gender);
    this.draft.firstName = first;
    this.draft.lastName = last;
  }

  setFirstName(name: string): void {
    this.draft.firstName = name;
  }

  setLastName(name: string): void {
    this.draft.lastName = name;
  }

  setGender(gender: "m" | "f"): void {
    this.draft.gender = gender;
    this.rerollName();
  }

  setNationality(nationality: string): void {
    this.draft.nationality = nationality;
    this.rerollName();
  }

  adjustStat(key: StatKey, delta: 1 | -1): void {
    adjust(this.draft, key, delta);
  }

  rerollStatsOnly(): void {
    rerollStats(this.draft);
  }

  /** Commit the draft and drop into the planner for week 1. A brand-new
   * player lands on the "Balanced" template rather than an all-rest week —
   * a wall of empty slots (and the vacation/income hit that comes with it)
   * is a rough first impression, not a real choice the player made. */
  startCareer(): void {
    if (!this.canStartCareer) return;
    const character = $state.snapshot(this.draft) as CharacterDraft;
    this.game = Game.newGame({ content: defaultContent, character });
    this.humanPortraitSeed = this.draftPortraitSeed;
    void set(HUMAN_PORTRAIT_SEED_KEY, this.humanPortraitSeed).catch(() => {});
    this.slots = this.correctedTemplateSlots("Balanced") ?? emptyPlan().slots;
    this.summary = null;
    this.match = null;
    this.tournamentContext = null;
    this.version++;
    this.screen = "planner";
  }

  /** Bottom tab bar navigation — valid on tabs and from lightweight modal-like flows such as inbox.
   * Leaving the inbox this way (instead of `closeInbox`) still has to pop
   * `screenStack` — it's the one shortcut that bypasses a dedicated close
   * method, so it has to keep the push/pop balance itself. */
  goToTab(screen: TabScreen): void {
    if (!TAB_SCREENS.includes(this.screen) && this.screen !== "inbox") return;
    if (this.screen === "inbox") this.screenStack.pop();
    this.screen = screen;
  }

  /** Opens the global inbox as a separate flow so the bottom nav can stay focused. */
  openInbox(): void {
    this.screenStack.push(this.screen);
    this.screen = "inbox";
  }

  /** Returns from the inbox to the screen that opened it. */
  closeInbox(): void {
    this.screen = this.screenStack.pop() ?? "planner";
  }

  /** Opens a public profile for another player — reachable from a draw, a
   * tournament field, a match in progress, or anywhere else a name is shown.
   * Tapping your own name while already on a tab screen jumps straight to
   * the full Me tab (the richer view of the same person, and tab-to-tab
   * navigation is always safe there). But mid-match or mid-draw, "Me" would
   * strand that in-progress flow with no way back — so there it opens the
   * same lightweight overlay as any other player and hands back to
   * `screenStack`'s top on close, exactly like an opponent's would. */
  viewOpponent(id: string): void {
    if (id === this.you?.id && TAB_SCREENS.includes(this.screen)) {
      this.screen = "me";
      return;
    }
    this.screenStack.push(this.screen);
    this.viewingOpponentId = id;
    this.screen = "opponent";
  }

  /** Returns from the opponent profile to wherever it was opened from. */
  closeOpponent(): void {
    this.viewingOpponentId = null;
    this.screen = this.screenStack.pop() ?? "planner";
  }

  /** Marks one inbox message read and persists (read state lives in the save). */
  async markRead(id: string): Promise<void> {
    if (!this.game) return;
    this.game.markInboxRead(id);
    this.version++;
    await set(SAVE_KEY, this.game.serialize()).catch(() => {});
  }

  async markAllRead(): Promise<void> {
    if (!this.game) return;
    this.game.markAllInboxRead();
    this.version++;
    await set(SAVE_KEY, this.game.serialize()).catch(() => {});
  }

  /** Answers a decision-event message — see `Game.chooseInboxOption`. */
  async chooseInboxOption(messageId: string, choiceId: string): Promise<void> {
    if (!this.game) return;
    this.game.chooseInboxOption(messageId, choiceId);
    this.version++;
    await set(SAVE_KEY, this.game.serialize()).catch(() => {});
  }

  /** The plan actually submitted on Simulate: the draft with holiday/leave
   * corrections and travel/tournament/reserved overrides baked in (see
   * `simulateWeek`) — the vacation-cost hint must use this, not the raw
   * draft, since a travel/tournament slot's underlying (invisible, disabled)
   * draft activity is never what actually happens, and a carried-over "rest"
   * slot from before the leave balance ran out must still resolve to `work`
   * (see `correctActivity`) rather than silently keep burning leave. Reserved
   * slots (a decision-event commitment, e.g. a sparring session) are forced
   * in before travel/tournament so those still win on the rare clash — you
   * genuinely can't be at a tournament and a hitting session at once. */
  availableSlots(): ActivityType[] {
    const slots = this.slots.map((activity, i) => this.correctActivity(activity, i));
    for (const reserved of this.reservedSlotsThisWeek) {
      slots[reserved.slotIndex] = reserved.activity;
    }
    for (const block of this.travelBlocksThisWeek) {
      for (const index of block.slotIndices) slots[index] = "travel";
    }
    for (const block of this.tournamentBlocksThisWeek) {
      for (const index of block.slotIndices) slots[index] = "rest";
    }
    return slots;
  }

  /** true when `index`'s day falls on a public holiday — work can't be
   * scheduled there, in the picker or via a template. */
  isHolidaySlot(index: number): boolean {
    const date = this.weekDates[Math.floor(index / PERIODS.length)];
    return !!date && this.holidays.some((h) => h.date === date);
  }

  /** true when `index` is a weekday Morning/Afternoon slot and this year's
   * paid leave is used up (`remainingVacationDays <= 0`) — nothing but work
   * can be scheduled there until the balance resets. A public holiday always
   * wins over this (it's free time off, not leave, and doesn't draw down the
   * balance either — see systems/vacation.ts), so it's checked first. */
  isForcedWorkSlot(index: number): boolean {
    const day = Math.floor(index / PERIODS.length);
    const period = index % PERIODS.length;
    if (day > 4 || period > 1) return false; // weekends & evenings are always free
    if (this.isHolidaySlot(index)) return false;
    return (this.you?.remainingVacationDays ?? 0) <= 0;
  }

  /** Applies the holiday (no work) and out-of-leave (must work) corrections
   * to a single slot — shared by the grid display (`effectiveSlot`),
   * submission (`availableSlots`), and template adoption
   * (`correctedTemplateSlots`), so a carried-over draft activity that no
   * longer fits the current calendar/balance is never taken at face value. */
  private correctActivity(activity: ActivityType, index: number): ActivityType {
    if (activity === "work" && this.isHolidaySlot(index)) return "rest";
    if (activity !== "work" && this.isForcedWorkSlot(index)) return "work";
    return activity;
  }

  /** What `index` will actually resolve to once corrections are applied —
   * what the grid should show, even before the underlying draft slot is
   * edited (e.g. a "rest" slot carried over from before leave ran out). */
  effectiveSlot(index: number): ActivityType {
    return this.correctActivity(this.slots[index] ?? "rest", index);
  }

  setSlot(index: number, activity: ActivityType): void {
    if (activity === "work" && this.isHolidaySlot(index)) return;
    if (activity !== "work" && this.isForcedWorkSlot(index)) return;
    this.slots[index] = activity;
  }

  /** A template's built week with the holiday (no work) and out-of-leave
   * (must work) corrections already applied — the plan that would actually
   * be adopted by `applyTemplate`. Null when there's nothing to build yet. */
  private correctedTemplateSlots(name: keyof typeof TEMPLATES): ActivityType[] | null {
    const build = TEMPLATES[name];
    if (!build || !this.you) return null;
    const built = build(rankSports(this.you.sports));
    return built.map((activity, i) => this.correctActivity(activity, i));
  }

  /** A fully income-free week (e.g. Training camp) is a discretionary trip
   * away from paid work — like a tournament trip, it's blocked once the
   * current balance can't cover it. A week with any work in it always earns
   * toward the next payday, so it's never blocked by cash on hand. */
  private canAffordSlots(slots: ActivityType[]): boolean {
    if (!this.game || !this.you) return true;
    if (slots.includes("work")) return true;
    const cashDelta = this.game.previewPlan({ slots }).money;
    return this.you.money + cashDelta >= 0;
  }

  /** Whether `name`'s template (after holiday/leave corrections) can be
   * applied right now — drives the disabled state on its Planner button. */
  canAffordTemplate(name: keyof typeof TEMPLATES): boolean {
    const corrected = this.correctedTemplateSlots(name);
    return corrected ? this.canAffordSlots(corrected) : true;
  }

  applyTemplate(name: keyof typeof TEMPLATES): void {
    const corrected = this.correctedTemplateSlots(name);
    if (!corrected || !this.canAffordSlots(corrected)) return;
    this.slots = corrected;
  }

  async simulateWeek(): Promise<void> {
    if (!this.game || this.screen !== "planner") return;
    this.screen = "simulating";
    this.summary = this.game.submitWeek({ slots: this.availableSlots() });
    this.version++;
    await set(SAVE_KEY, this.game.serialize()).catch(() => {});
    await new Promise((resolve) => setTimeout(resolve, 650));
    this.screen = "summary";
  }

  /** Back to planning; last week's plan stays as the starting point. */
  nextWeek(): void {
    this.summary = null;
    this.screen = "planner";
  }

  /** Registers for a future tournament — at least entryDeadlineWeeks ahead;
   * the engine throws otherwise. Defaults to the human's own class; pass
   * `division` to play up into a tougher one instead (see
   * `TourEntry.eligibleDivisions`). Also how to switch an existing
   * registration to a different eligible class. Persists immediately since
   * this is a real commitment, not ephemeral UI state. */
  async registerForTournament(weekIndex: number, division?: DivisionCode): Promise<void> {
    if (!this.game) return;
    this.game.registerForTournament(weekIndex, division);
    this.version++;
    await set(SAVE_KEY, this.game.serialize()).catch(() => {});
  }

  /** Backs out of a registration — whether it's still weeks away or, if
   * called for the current week before playing it, equivalent to skipping. */
  async withdrawRegistration(weekIndex: number): Promise<void> {
    if (!this.game) return;
    this.game.withdrawRegistration(weekIndex);
    this.version++;
    await set(SAVE_KEY, this.game.serialize()).catch(() => {});
  }

  /** Round-name/main-vs-plate context for the human's current match — falls
   * back to a plain "Round N" if the engine has no section info yet (e.g.
   * mid-transition), so the UI always has something sane to show. */
  private sectionInfo(round: number): { roundName: string; isMainDraw: boolean } {
    const section = this.game?.currentDrawSection();
    return section ? { roundName: section.roundName, isMainDraw: section.isMainDraw } : { roundName: `Round ${round}`, isMainDraw: true };
  }

  /** Enters this week's tournament — only valid once registered for it, and
   * only when the trip is affordable (the Planner/Tour button is disabled
   * otherwise — see `canAffordTournamentThisWeek`). The engine throws if the
   * balance can't cover the entry fee + travel; caught defensively here so a
   * stale click never crashes the app. Opens the full-screen draw first (the
   * "study the draw" moment); the player kicks off their match from there
   * via `playPendingMatch`. */
  enterTournament(): void {
    if (!this.game) return;
    const def = this.game.registeredTournamentThisWeek();
    if (!def) return;
    let match: MatchState;
    try {
      match = this.game.prepareAndEnterTournament({ slots: this.availableSlots() });
    } catch {
      return;
    }
    this.match = match;
    this.tournamentContext = {
      name: def.name,
      round: 1,
      totalRounds: Math.log2(def.fieldSize),
      ...this.sectionInfo(1),
    };
    this.awaitingKickoff = true;
    this.version++;
    this.screen = "draw";
  }

  /** Kicks off the human's pending match from the draw screen. */
  playPendingMatch(): void {
    if (!this.match) return;
    this.awaitingKickoff = false;
    this.screen = "match";
  }

  /** The bracket/draw for the tournament in progress, oldest round first —
   * empty when there's no active tournament. */
  get drawRounds(): DrawRound[] {
    return this.game?.tournamentDraw() ?? [];
  }

  /** Every other division of this week's event, fully AI-simulated
   * alongside the human's own draw — lets the Draw screen offer "watch
   * class A too" while the human plays their own class. */
  get otherDivisionDraws(): OtherDivisionDraw[] {
    return this.game?.otherDivisionDraws() ?? [];
  }

  /** Opens the full draw/bracket view over the current match. */
  viewDraw(): void {
    if (this.match) this.screen = "draw";
  }

  /** Returns from the draw view back to the match in progress. */
  closeDraw(): void {
    if (this.match) this.screen = "match";
  }

  /** Draw data for whichever week `viewingTournamentWeek` points at — null
   * when nothing's open. "completed" once a persisted bracket exists for
   * that week (`Game.completedDraw`); otherwise a round-1-only "preview"
   * (`Game.previewTournamentDraw`), since nothing later is knowable yet. The
   * live case never reaches this screen at all — see `viewTournamentDetail`. */
  readonly tournamentDetail: {
    mode: "preview" | "completed";
    title: string;
    rounds: DrawRound[];
    otherDivisionDraws: OtherDivisionDraw[];
    /** the "primary" bracket's own def — completed mode only. Lets
     * `Draw.svelte` tell whether this is genuinely the human's own division
     * or just whichever one `simulateUnplayedWorldTournaments` happened to
     * pick as primary for a week the human never played at all. */
    tournament: TournamentDef | null;
  } | null = $derived.by(() => {
    this.version;
    if (!this.game || this.viewingTournamentWeek === null) return null;
    const week = this.viewingTournamentWeek;
    const completed = this.game.completedDraw(week);
    if (completed) {
      return {
        mode: "completed",
        title: completed.tournament.name,
        rounds: completed.rounds,
        otherDivisionDraws: completed.otherDivisions,
        tournament: completed.tournament,
      };
    }
    const entry = this.seasonTournaments.find((e) => e.weekIndex === week);
    return {
      mode: "preview",
      title: entry?.tournament.name ?? "Draw",
      rounds: this.game.previewTournamentDraw(week) ?? [],
      otherDivisionDraws: this.game.previewOtherDivisionDraws(week),
      tournament: this.game.previewTournamentDef(week),
    };
  });

  /** Opens the full draw/bracket view for an arbitrary tournament week — the
   * live in-progress one reuses the existing "draw" screen (no separate
   * rendering needed, see `tournamentDetail`'s doc comment); anything else
   * opens the read-only `tournamentDetail` screen instead, following the
   * same `screenStack`-push pattern as `viewOpponent` (so it nests correctly
   * even when opened from inside another overlay, like the inbox). Every
   * scheduled tournament week — played or skipped — now gets a real
   * `completedDraw` once it's been submitted (see `Game.submitWeek`'s
   * headless world-tournament simulation), so this only still no-ops for a
   * "skipped" week from a save made before that existed, or a future week
   * that hasn't happened yet — there's genuinely no bracket to show either
   * way. */
  viewTournamentDetail(weekIndex: number): void {
    if (!this.game) return;
    if (this.tournamentContext && this.weekIndex === weekIndex) {
      this.screen = "draw";
      return;
    }
    if (!this.game.completedDraw(weekIndex)) {
      const entry = this.seasonTournaments.find((e) => e.weekIndex === weekIndex);
      if (entry?.status === "skipped") return;
    }
    this.screenStack.push(this.screen);
    this.viewingTournamentWeek = weekIndex;
    this.screen = "tournamentDetail";
  }

  /** Returns from the tournament-detail screen to wherever it was opened from. */
  closeTournamentDetail(): void {
    this.viewingTournamentWeek = null;
    this.screen = this.screenStack.pop() ?? "planner";
  }

  /** The human is always side "a" in a tournament match. */
  chooseTactic(tactic: Tactic): void {
    if (this.match) setTactic(this.match, "a", tactic);
  }

  continueMatch(): void {
    if (!this.match || this.match.phase !== "break") return;
    setTactic(this.match, "b", aiChooseTactic(this.match, "b"));
    resumeMatch(this.match);
  }

  /**
   * The human's serve/receive call at the gummiarm coin toss (they're always
   * side "a"). Only meaningful when the human actually won the toss; when the
   * AI won it, the engine's own heuristic (`resolveGummiarmServe`) has already
   * set the server, and this is a no-op for a losing toss anyway.
   */
  chooseGummiarmServe(serve: boolean): void {
    if (this.match) chooseGummiarmServe(this.match, serve);
  }

  exitMatch(): void {
    this.match = null;
    this.tournamentContext = null;
    this.awaitingKickoff = false;
    this.concludedTournament = null;
    this.screen = "planner";
  }

  /**
   * Called when the player dismisses a finished match's result panel —
   * advances the tournament bracket: onward to the next round, or — on
   * elimination or the final win — lands on the now-fully-revealed final
   * draw (own bracket + siblings) so the human can browse it, the same
   * "study the draw" beat as every round, but for the whole finished event.
   * `continueAfterTournament` is what actually folds the result into the
   * week and moves on.
   */
  async finishMatch(): Promise<void> {
    if (!this.game || !this.match || !this.tournamentContext) {
      this.exitMatch();
      return;
    }
    const outcome = this.game.resolveTournamentMatch(this.match);
    if (outcome.status === "nextRound") {
      this.match = outcome.match;
      const round = outcome.round + 1;
      this.tournamentContext = { ...this.tournamentContext, round, ...this.sectionInfo(round) };
      // Back to the draw to study the updated bracket and the next-round
      // pairing before kicking off — the draw-first loop, every round.
      this.awaitingKickoff = true;
      this.screen = "draw";
      return;
    }
    this.match = null;
    this.awaitingKickoff = false;
    this.concludedTournament = outcome;
    this.screen = "draw";
  }

  /** Called from the Draw screen once the human is done browsing the
   * concluded tournament's final bracket — releases the engine's session
   * (see `Game.clearConcludedTournament`) and folds the result into the
   * week, same as `finishMatch` used to do immediately. */
  async continueAfterTournament(): Promise<void> {
    if (!this.game) return;
    this.game.clearConcludedTournament();
    this.tournamentContext = null;
    this.concludedTournament = null;
    // simulateWeek() only runs from "planner" (guards against double-fires
    // from its own button) — pass through it before handing off to it
    this.screen = "planner";
    await this.simulateWeek();
  }

  /** Discard the current career and return to character creation. */
  async newGame(): Promise<void> {
    await Promise.all([del(SAVE_KEY), del(HUMAN_PORTRAIT_SEED_KEY)]).catch(() => {});
    this.game = null;
    this.slots = emptyPlan().slots;
    this.summary = null;
    this.match = null;
    this.tournamentContext = null;
    this.awaitingKickoff = false;
    this.concludedTournament = null;
    this.draft = randomDraft();
    this.draftPortraitSeed = newPortraitSeed();
    this.humanPortraitSeed = null;
    this.version++;
    this.screen = "create";
  }
}

export const store = new GameStore();
