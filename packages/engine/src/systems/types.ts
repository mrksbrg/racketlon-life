import type { ContentBundle } from "../content.js";
import type { WeekLog } from "../core/events.js";
import type { Rng } from "../core/rng.js";
import type { GameState } from "../core/state.js";
import type { ActivityCounts, PlayerPlan } from "../model/plan.js";
import type { Skills } from "../model/player.js";
import type { Sport } from "../model/sport.js";
import type { WeekSummary } from "../model/summary.js";

/** Snapshot of the human player before systems run; SummarySystem diffs against it. */
export interface HumanSnapshot {
  skills: Skills;
  fatigue: number;
  money: number;
  formBySport: Record<Sport, number>;
}

export interface WeekOutputs {
  summary?: WeekSummary;
}

export interface SystemContext {
  state: GameState;
  content: ContentBundle;
  /** the human player's submitted 21-slot plan */
  humanPlan: PlayerPlan;
  /** resolved activity counts per player id — PlanningSystem fills this */
  plans: Map<string, ActivityCounts>;
  /** RNG stream private to this system for this week */
  rng: Rng;
  log: WeekLog;
  snapshot: HumanSnapshot;
  outputs: WeekOutputs;
}

/**
 * A simulation phase. Core systems may mutate GameState and emit events.
 * Story/achievement-style systems must only read state + log and create
 * offers for later weeks — they never silently change skills or money.
 */
export interface GameSystem {
  id: string;
  run(ctx: SystemContext): void;
}
