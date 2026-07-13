import type { Sport } from "./sport.js";

export type ActivityType =
  | "trainTT"
  | "trainBD"
  | "trainSQ"
  | "trainTN"
  | "gym"
  | "cardio"
  | "rest"
  | "work"
  | "social"
  | "travel";

export const ACTIVITY_TYPES: readonly ActivityType[] = [
  "trainTT",
  "trainBD",
  "trainSQ",
  "trainTN",
  "gym",
  "cardio",
  "rest",
  "work",
  "social",
  "travel",
];

/**
 * Base effects of one session of an activity. Values live in content
 * (packages/content/data/activities.json), not in code.
 */
export interface ActivityDef {
  id: ActivityType;
  label: string;
  /** short chip label for the planner grid, e.g. "TT" */
  short: string;
  /** which sport this trains, if any */
  sport?: Sport;
  /** skill points per session before modifiers (sport training) */
  trainingBase?: number;
  /** fatigue per session; negative recovers */
  fatigue: number;
  /** EUR per session; negative is a cost */
  money: number;
  /** contribution to weekly injury risk (rolls start in M1; shown in forecast now) */
  injuryLoad: number;
}

export function isTraining(def: ActivityDef): boolean {
  return def.sport !== undefined && def.trainingBase !== undefined;
}
