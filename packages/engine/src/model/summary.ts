import type { Sport } from "./sport.js";

export interface SportSummary {
  level: number;
  skillDelta: number;
  leveledUp: boolean;
  /** level-progress (0..1) before and after this week's training — the
   * before value is in the *previous* band when `leveledUp`, so a UI
   * animating the bar can fill the old band before resetting into the new
   * one, instead of jumping backwards. */
  beforeProgress: number;
  progress: number;
  /** 0..20 per-sport form (tournament readiness) before and after this week
   * — see PlayerCondition.formBySport. */
  beforeForm: number;
  form: number;
  formDelta: number;
}

/** The weekly digest shown to the player, composed by SummarySystem. */
export interface WeekSummary {
  weekIndex: number;
  weekLabel: string;
  sports: Record<Sport, SportSummary>;
  fatigue: { value: number; delta: number };
  money: { value: number; delta: number };
  /** human-readable highlights derived from the EventLog */
  notes: string[];
}
