import { BALANCE } from "../balance.js";
import { ageOn } from "../core/date.js";
import { clamp } from "../core/util.js";
import { recoveryAgeMultiplier } from "./age.js";
import type { GameSystem } from "./types.js";

/**
 * Natural weekly recovery and condition drift. Form decays toward neutral
 * (match results will drive it from M1); deep fatigue drags form down.
 */
export const RecoverySystem: GameSystem = {
  id: "recovery",
  run(ctx) {
    for (const player of ctx.state.players) {
      if (player.simTier === 2) continue;
      const c = player.condition;
      const age = ageOn(ctx.state.calendar.mondayISO, player.identity.birthDate);
      c.fatigue = clamp(c.fatigue - BALANCE.recovery.weeklyBase * recoveryAgeMultiplier(age), 0, 100);
      if (c.form > 0) c.form -= 1;
      else if (c.form < 0) c.form += 1;
      if (c.fatigue > 80) c.form = Math.max(-10, c.form - 1);
      if (player.simTier === 0 && c.fatigue >= BALANCE.recovery.warnAt) {
        ctx.log.emit("condition.warning", player.identity.id, { fatigue: c.fatigue });
      }
    }
  },
};
