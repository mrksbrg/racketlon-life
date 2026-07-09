import type { ActivityType } from "./activity.js";
import type { Sport } from "./sport.js";

export const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] as const;
export const PERIODS = ["Morning", "Afternoon", "Evening"] as const;
export const SLOTS_PER_WEEK = DAYS.length * PERIODS.length; // 21

/**
 * The human player's week: 21 slots (7 days × morning/afternoon/evening),
 * each holding one activity.
 */
export interface PlayerPlan {
  slots: ActivityType[]; // length SLOTS_PER_WEEK
}

export function slotIndex(day: number, period: number): number {
  return day * PERIODS.length + period;
}

export function emptyPlan(): PlayerPlan {
  return { slots: Array.from({ length: SLOTS_PER_WEEK }, () => "rest" as ActivityType) };
}

/**
 * Compact plan for tier-1 AI players — the whole point of the LOD design:
 * AI weeks are a handful of numbers, not 21 slots.
 */
export interface CompactPlan {
  focus: Sport | null;
  intensity: 0 | 1 | 2; // easy / normal / hard
  restLevel: 0 | 1 | 2;
}

/**
 * Both human slot plans and AI compact plans resolve to activity counts;
 * every system consumes counts, so the two tiers share all downstream code.
 */
export type ActivityCounts = Partial<Record<ActivityType, number>>;

export function countsFromSlots(plan: PlayerPlan): ActivityCounts {
  const counts: ActivityCounts = {};
  for (const slot of plan.slots) {
    counts[slot] = (counts[slot] ?? 0) + 1;
  }
  return counts;
}
