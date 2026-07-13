import { compactPlanFor, countsFromCompact } from "../ai/planner.js";
import { BALANCE } from "../balance.js";
import type { ActivityType } from "../model/activity.js";
import { countsFromSlots, PERIODS } from "../model/plan.js";
import type { PlayerPlan } from "../model/plan.js";
import type { GameSystem } from "./types.js";

/**
 * Resolves every simulated player's week into ActivityCounts:
 * tier 0 from the UI's 21-slot plan, tier 1 from a compact AI plan.
 * Tier 2 (background population) gets no weekly plan by design.
 */
export const PlanningSystem: GameSystem = {
  id: "planning",
  run(ctx) {
    for (const player of ctx.state.players) {
      if (player.simTier === 0) {
        ctx.plans.set(
          player.identity.id,
          countsFromSlots(
            applySorenessPhysicalBlock(
              ctx.humanPlan,
              player.condition.soreness,
              player.condition.sorenessStartedWeek,
              ctx.state.calendar.weekIndex,
            ),
          ),
        );
      } else if (player.simTier === 1) {
        const compact = compactPlanFor(player, ctx.rng);
        ctx.plans.set(player.identity.id, countsFromCompact(compact));
      }
    }
  },
};

const PHYSICAL_ACTIVITY_TYPES: ReadonlySet<ActivityType> = new Set([
  "trainTT",
  "trainBD",
  "trainSQ",
  "trainTN",
  "gym",
  "cardio",
]);

/** High soreness only blocks physical training; work, social plans, and rest still happen. */
function applySorenessPhysicalBlock(
  plan: PlayerPlan,
  soreness: number,
  sorenessStartedWeek: number | null,
  currentWeek: number,
): PlayerPlan {
  if (
    soreness < BALANCE.tournament.sorenessTrainingBlockAt ||
    sorenessStartedWeek === null ||
    sorenessStartedWeek >= currentWeek
  ) {
    return plan;
  }

  const slots = [...plan.slots];
  const firstThreeWeekdaysSlots = 3 * PERIODS.length;
  for (let i = 0; i < Math.min(firstThreeWeekdaysSlots, slots.length); i++) {
    if (PHYSICAL_ACTIVITY_TYPES.has(slots[i]!)) slots[i] = "rest";
  }
  return { slots };
}
