import { compactPlanFor, countsFromCompact } from "../ai/planner.js";
import { countsFromSlots } from "../model/plan.js";
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
        ctx.plans.set(player.identity.id, countsFromSlots(ctx.humanPlan));
      } else if (player.simTier === 1) {
        const compact = compactPlanFor(player, ctx.rng);
        ctx.plans.set(player.identity.id, countsFromCompact(compact));
      }
    }
  },
};
