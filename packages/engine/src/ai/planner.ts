import type { Rng } from "../core/rng.js";
import type { ActivityType } from "../model/activity.js";
import type { ActivityCounts, CompactPlan } from "../model/plan.js";
import type { Player } from "../model/player.js";
import type { Sport } from "../model/sport.js";
import { SPORTS } from "../model/sport.js";

/**
 * Tier-1 AI planning: a handful of numbers instead of 21 slots. The compact
 * plan resolves to the same ActivityCounts the human plan does, so every
 * downstream system treats humans and AI identically.
 */

const TRAIN_BY_SPORT: Record<Sport, ActivityType> = {
  tt: "trainTT",
  bd: "trainBD",
  sq: "trainSQ",
  tn: "trainTN",
};

export function compactPlanFor(player: Player, rng: Rng): CompactPlan {
  const { fatigue } = player.condition;
  if (fatigue > 65) return { focus: null, intensity: 0, restLevel: 2 };

  // mostly train the weakest sport, with some variety
  const weakest = [...SPORTS].sort(
    (a, b) => player.attributes.skills[a] - player.attributes.skills[b],
  )[0] as Sport;
  const focus = rng.chance(0.7) ? weakest : rng.pick(SPORTS);
  const intensity: CompactPlan["intensity"] =
    player.attributes.professionalism > 0.6 && fatigue < 40 ? 2 : 1;
  const restLevel: CompactPlan["restLevel"] = fatigue > 45 ? 2 : 1;
  return { focus, intensity, restLevel };
}

const FOCUS_SESSIONS = [0, 4, 7] as const;
const REST_SLOTS = [4, 6, 9] as const;

export function countsFromCompact(plan: CompactPlan): ActivityCounts {
  const counts: ActivityCounts = {};
  if (plan.focus !== null && plan.intensity > 0) {
    counts[TRAIN_BY_SPORT[plan.focus]] = FOCUS_SESSIONS[plan.intensity];
    counts.cardio = 1;
  }
  counts.rest = REST_SLOTS[plan.restLevel];
  return counts;
}
