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
  OpponentProfileView,
  OtherDivisionDraw,
  RankingRowView,
  RecentMatchView,
  SaveGame,
  Sport,
  SportView,
  Tactic,
  TourEntry,
  TournamentDef,
  TravelBlock,
  TrainedWeekView,
  TrophyView,
  WeekSummary,
} from "@racketlon/engine";
import {
  Game,
  SLOTS_PER_WEEK,
  SPORTS,
  aiChooseTactic,
  emptyPlan,
  resumeMatch,
  setTactic,
  slotIndex,
} from "@racketlon/engine";
import { del, get, set } from "idb-keyval";
import type { StatKey } from "./character";
import { adjust, attrPointsRemaining, randomDraft, randomName, rerollStats, sportPointsRemaining } from "./character";

const SAVE_KEY = "racketlon-life-save";

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
  | "opponent";

/** Screens reachable from the bottom tab bar (docs/07's nav model — full-screen
 * flows like match/summary/create run over the top, without it). */
export type TabScreen = "planner" | "tour" | "rankings" | "world" | "me";

/** Screens that show the persistent bottom tab bar. */
export const TAB_SCREENS: readonly Screen[] = ["planner", "tour", "rankings", "world", "me"];

export type MatchSpeed = 1 | 2 | 3;

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

const TRAIN_FOR: Record<Sport, ActivityType> = {
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
    // injury risk come down hard.
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
  summary = $state<WeekSummary | null>(null);
  match = $state<MatchState | null>(null);
  matchSpeed = $state<MatchSpeed>(2);
  tournamentContext = $state<TournamentContext | null>(null);
  /** id of the player whose profile is open, and the screen to return to —
   * set together by `viewOpponent`, so the profile can be reached from any
   * tab/draw/field-list context and hand back to exactly where it opened. */
  viewingOpponentId = $state<string | null>(null);
  private previousScreen = $state<Screen>("planner");

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

  /** The human's individual match history, newest first — the Me screen's
   * "recent matches" list (finer-grained than `careerStats().results`,
   * which is per-tournament placement, not per-opponent). */
  readonly recentMatches: RecentMatchView[] = $derived.by(() => {
    this.version;
    return this.game ? this.game.recentMatches() : [];
  });

  /** Which gender's ladder the Rankings screen shows — defaults to the
   * human's own gender until explicitly switched. */
  private rankingsGenderOverride = $state<"m" | "f" | null>(null);

  readonly rankingsGender: "m" | "f" = $derived.by(() => this.rankingsGenderOverride ?? this.you?.gender ?? "m");

  setRankingsGender(gender: "m" | "f"): void {
    this.rankingsGenderOverride = gender;
  }

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

  readonly weekLabel: string = $derived.by(() => {
    this.version;
    return this.game ? this.game.weekLabel : "";
  });


  readonly travelBlocksThisWeek: TravelBlock[] = $derived.by(() => {
    this.version;
    return this.game ? this.game.travelBlocksThisWeek() : [];
  });

  readonly tournamentBlocksThisWeek: TravelBlock[] = $derived.by(() => {
    this.version;
    return this.game ? this.game.tournamentBlocksThisWeek() : [];
  });

  readonly weekIndex: number = $derived.by(() => {
    this.version;
    return this.game ? this.game.weekIndex : 0;
  });

  readonly forecast: Forecast | null = $derived.by(() => {
    this.version;
    if (!this.game) return null;
    return this.game.previewPlan({ slots: this.availableSlots() });
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
    try {
      save = await get<SaveGame>(SAVE_KEY);
    } catch {
      save = undefined;
    }
    if (!save) {
      // no career yet — build one on the character-creation screen
      this.draft = randomDraft();
      this.screen = "create";
      return;
    }
    try {
      this.game = Game.fromSave(save, defaultContent);
    } catch {
      // corrupt or incompatible save — start fresh rather than brick the app
      this.draft = randomDraft();
      this.screen = "create";
      return;
    }
    this.version++;
    this.screen = "planner";
  }

  // --- character creation ---

  rerollCharacter(): void {
    this.draft = randomDraft();
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

  /** Commit the draft and drop into the planner for week 1. */
  startCareer(): void {
    if (!this.canStartCareer) return;
    const character = $state.snapshot(this.draft) as CharacterDraft;
    this.game = Game.newGame({ content: defaultContent, character });
    this.slots = emptyPlan().slots;
    this.summary = null;
    this.match = null;
    this.tournamentContext = null;
    this.version++;
    this.screen = "planner";
  }

  /** Bottom tab bar navigation — valid on tabs and from lightweight modal-like flows such as inbox. */
  goToTab(screen: TabScreen): void {
    if (!TAB_SCREENS.includes(this.screen) && this.screen !== "inbox") return;
    this.screen = screen;
  }

  /** Opens the global inbox as a separate flow so the bottom nav can stay focused. */
  openInbox(): void {
    this.previousScreen = this.screen;
    this.screen = "inbox";
  }

  /** Returns from the inbox to the screen that opened it. */
  closeInbox(): void {
    this.screen = this.previousScreen;
  }

  /** Opens a public profile for another player — reachable from a draw, a
   * tournament field, a match in progress, or anywhere else a name is shown.
   * Tapping your own name while already on a tab screen jumps straight to
   * the full Me tab (the richer view of the same person, and tab-to-tab
   * navigation is always safe there). But mid-match or mid-draw, "Me" would
   * strand that in-progress flow with no way back — so there it opens the
   * same lightweight overlay as any other player and hands back to
   * `previousScreen` on close, exactly like an opponent's would. */
  viewOpponent(id: string): void {
    if (id === this.you?.id && TAB_SCREENS.includes(this.screen)) {
      this.screen = "me";
      return;
    }
    this.previousScreen = this.screen;
    this.viewingOpponentId = id;
    this.screen = "opponent";
  }

  /** Returns from the opponent profile to wherever it was opened from. */
  closeOpponent(): void {
    this.viewingOpponentId = null;
    this.screen = this.previousScreen;
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

  private availableSlots(): ActivityType[] {
    const slots = [...this.slots];
    for (const block of this.travelBlocksThisWeek) {
      for (const index of block.slotIndices) slots[index] = "travel";
    }
    for (const block of this.tournamentBlocksThisWeek) {
      for (const index of block.slotIndices) slots[index] = "rest";
    }
    return slots;
  }

  setSlot(index: number, activity: ActivityType): void {
    this.slots[index] = activity;
  }

  applyTemplate(name: keyof typeof TEMPLATES): void {
    const build = TEMPLATES[name];
    if (!build || !this.you) return;
    this.slots = build(rankSports(this.you.sports));
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

  /** Plays out this week's tournament — only valid once registered for it. */
  enterTournament(): void {
    if (!this.game) return;
    const def = this.game.registeredTournamentThisWeek();
    if (!def) return;
    this.match = this.game.prepareAndEnterTournament({ slots: this.availableSlots() });
    this.tournamentContext = {
      name: def.name,
      round: 1,
      totalRounds: Math.log2(def.fieldSize),
      ...this.sectionInfo(1),
    };
    this.version++;
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

  /** The human is always side "a" in a tournament match. */
  chooseTactic(tactic: Tactic): void {
    if (this.match) setTactic(this.match, "a", tactic);
  }

  continueMatch(): void {
    if (!this.match || this.match.phase !== "break") return;
    setTactic(this.match, "b", aiChooseTactic(this.match, "b"));
    resumeMatch(this.match);
  }

  exitMatch(): void {
    this.match = null;
    this.tournamentContext = null;
    this.screen = "planner";
  }

  /**
   * Called when the player dismisses a finished match's result panel —
   * advances the tournament bracket: onward to the next round, or — on
   * elimination or the final win — folds the result into this week's
   * simulation and shows the weekly summary.
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
      return;
    }
    this.tournamentContext = null;
    this.match = null;
    // simulateWeek() only runs from "planner" (guards against double-fires
    // from its own button) — pass through it before handing off to it
    this.screen = "planner";
    await this.simulateWeek();
  }

  /** Discard the current career and return to character creation. */
  async newGame(): Promise<void> {
    await del(SAVE_KEY).catch(() => {});
    this.game = null;
    this.slots = emptyPlan().slots;
    this.summary = null;
    this.match = null;
    this.tournamentContext = null;
    this.draft = randomDraft();
    this.version++;
    this.screen = "create";
  }
}

export const store = new GameStore();
