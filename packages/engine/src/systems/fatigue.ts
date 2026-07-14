import { clamp } from "../core/util.js";
import { fatigueDeltaFromCounts } from "./effects.js";
import type { GameSystem } from "./types.js";

/** Accumulates fatigue from the week's activities (rest/social reduce it). */
export const FatigueSystem: GameSystem = {
  id: "fatigue",
  run(ctx) {
    for (const player of ctx.state.players) {
      const counts = ctx.plans.get(player.identity.id);
      if (!counts) continue;
      const delta = fatigueDeltaFromCounts(counts, ctx.content, player.attributes.coreStrength);
      player.condition.fatigue = clamp(player.condition.fatigue + delta, 0, 100);
    }
  },
};
