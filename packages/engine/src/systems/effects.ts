import { BALANCE } from "../balance.js";
import type { ContentBundle } from "../content.js";
import type { ActivityType } from "../model/activity.js";
import type { ActivityCounts } from "../model/plan.js";
import { trainingAgeMultiplier } from "./age.js";

/**
 * Shared effect math. TrainingSystem/FatigueSystem/EconomySystem apply these
 * with RNG noise; the facade's previewPlan evaluates the same functions in
 * expectation. One source of truth keeps the forecast honest.
 */

export function countEntries(counts: ActivityCounts): Array<[ActivityType, number]> {
  return (Object.entries(counts) as Array<[ActivityType, number | undefined]>).flatMap(
    ([type, n]) => (n !== undefined && n > 0 ? [[type, n] as [ActivityType, number]] : []),
  );
}

/** Expected skill gain for one session, before per-session randomness. `age`
 * defaults to a neutral prime-window value (1.0× multiplier) so callers
 * testing the other dimensions in isolation don't need to care about it. */
export function expectedSessionGain(
  base: number,
  skill: number,
  talent: number,
  fatigue: number,
  age = 25,
): number {
  const b = BALANCE.training;
  const taper = Math.max(b.minTaper, 1 - skill / b.taperEnd);
  const talentMult = b.talentFloor + talent * b.talentSpan;
  const fatigueMult =
    fatigue <= b.fatiguePenaltyFrom
      ? 1
      : 1 -
        (1 - b.fatiguePenaltyAt100) *
          ((fatigue - b.fatiguePenaltyFrom) / (100 - b.fatiguePenaltyFrom));
  return base * taper * talentMult * fatigueMult * trainingAgeMultiplier(age);
}

/** Net fatigue change from the week's activities (rest/social are negative). */
export function fatigueDeltaFromCounts(counts: ActivityCounts, content: ContentBundle): number {
  let delta = 0;
  for (const [type, n] of countEntries(counts)) {
    delta += content.activities[type].fatigue * n;
  }
  return delta;
}

export function moneyDeltaFromCounts(
  counts: ActivityCounts,
  content: ContentBundle,
): { earned: number; spent: number } {
  let earned = 0;
  let spent = 0;
  for (const [type, n] of countEntries(counts)) {
    const perSession = content.activities[type].money;
    if (perSession >= 0) earned += perSession * n;
    else spent += -perSession * n;
  }
  return { earned, spent };
}

/** Weekly injury load: planned activity load plus how tired you already are. */
export function injuryLoad(
  counts: ActivityCounts,
  content: ContentBundle,
  currentFatigue: number,
): number {
  let load = currentFatigue / BALANCE.injuryRisk.fatigueDivisor;
  for (const [type, n] of countEntries(counts)) {
    load += content.activities[type].injuryLoad * n;
  }
  return load;
}

export function injuryRiskBucket(load: number): "low" | "medium" | "high" {
  if (load >= BALANCE.injuryRisk.highAt) return "high";
  if (load >= BALANCE.injuryRisk.mediumAt) return "medium";
  return "low";
}
