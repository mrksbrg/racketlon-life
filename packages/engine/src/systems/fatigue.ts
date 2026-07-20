import { clamp } from "../core/util.js";
import { fatigueDeltaFromCounts } from "./effects.js";
import { weekModifierContent } from "./modifiers.js";
import type { GameSystem } from "./types.js";

/** Accumulates fatigue from the week's activities (rest/social reduce it). */
export const FatigueSystem: GameSystem = {
  id: "fatigue",
  run(ctx) {
    // human-only flavor, same reasoning as TrainingSystem's own content swap.
    const humanContent = weekModifierContent(ctx.content, ctx.weekModifier);
    for (const player of ctx.state.players) {
      const counts = ctx.plans.get(player.identity.id);
      if (!counts) continue;
      const content = player.identity.id === ctx.state.career.playerId ? humanContent : ctx.content;
      const delta = fatigueDeltaFromCounts(counts, content, player.attributes.coreStrength);
      player.condition.fatigue = clamp(player.condition.fatigue + delta, 0, 100);
    }
  },
};
