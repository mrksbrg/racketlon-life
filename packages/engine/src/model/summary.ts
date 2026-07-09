import type { Sport } from "./sport.js";

export interface SportSummary {
  level: number;
  skillDelta: number;
  leveledUp: boolean;
}

/** The weekly digest shown to the player, composed by SummarySystem. */
export interface WeekSummary {
  weekIndex: number;
  weekLabel: string;
  sports: Record<Sport, SportSummary>;
  fatigue: { value: number; delta: number };
  money: { value: number; delta: number };
  form: number;
  /** human-readable highlights derived from the EventLog */
  notes: string[];
}
