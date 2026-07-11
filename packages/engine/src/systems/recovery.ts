import { BALANCE } from "../balance.js";
import { ageOn } from "../core/date.js";
import { clamp } from "../core/util.js";
import { SPORTS } from "../model/sport.js";
import { recoveryAgeMultiplier } from "./age.js";
import type { GameSystem } from "./types.js";

/**
 * Natural weekly recovery and condition drift. Per-sport form itself is
 * driven by training neglect (see systems/training.ts) — this system only
 * adds the deep-fatigue penalty on top, uniformly across all four sports,
 * since fatigue is a whole-body condition rather than a per-sport one.
 */
export const RecoverySystem: GameSystem = {
  id: "recovery",
  run(ctx) {
    for (const player of ctx.state.players) {
      if (player.simTier === 2) continue;
      const c = player.condition;
      const age = ageOn(ctx.state.calendar.mondayISO, player.identity.birthDate);
      c.fatigue = clamp(c.fatigue - BALANCE.recovery.weeklyBase * recoveryAgeMultiplier(age), 0, 100);
      if (c.fatigue > BALANCE.form.highFatigueThreshold) {
        for (const sport of SPORTS) {
          c.formBySport[sport] = Math.max(0, c.formBySport[sport] - BALANCE.form.highFatiguePenalty);
        }
      }
      if (player.simTier === 0 && c.fatigue >= BALANCE.recovery.warnAt) {
        ctx.log.emit("condition.warning", player.identity.id, { fatigue: c.fatigue });
      }
    }
  },
};
