import { BALANCE } from "../balance.js";
import { ageOn } from "../core/date.js";
import { clamp } from "../core/util.js";
import type { Rng } from "../core/rng.js";
import type { ActivityCounts } from "../model/plan.js";
import type { Sport } from "../model/sport.js";
import { SPORTS } from "../model/sport.js";
import { injuryAgeMultiplier } from "./age.js";
import { injuryLoad } from "./effects.js";
import type { GameSystem } from "./types.js";

const SPORT_ACTIVITY: Record<Sport, "trainTT" | "trainBD" | "trainSQ" | "trainTN"> = {
  tt: "trainTT",
  bd: "trainBD",
  sq: "trainSQ",
  tn: "trainTN",
};

/**
 * Weekly injury roll: current load (fatigue + this week's planned activity
 * load, via the same `injuryLoad()` the forecast already uses) times a
 * durability-scaled chance. Only one injury at a time — while carrying one,
 * a player heals instead of rolling for a new one. Durability ("Läkekött")
 * pulls double duty: it cuts the chance of getting hurt AND shortens how
 * long the injury lasts once it happens.
 */
export const InjurySystem: GameSystem = {
  id: "injury",
  run(ctx) {
    for (const player of ctx.state.players) {
      if (player.simTier === 2) continue;
      const injury = player.condition.injury;

      if (injury) {
        const b = BALANCE.injuryRisk;
        const healRate = 1 + Math.round(player.attributes.durability * b.durabilityHealBonus);
        injury.weeksRemaining = Math.max(0, injury.weeksRemaining - healRate);
        if (injury.weeksRemaining === 0) {
          player.condition.injury = null;
          ctx.log.emit("injury.recovered", player.identity.id, { type: injury.type });
        }
        continue;
      }

      const counts = ctx.plans.get(player.identity.id);
      if (!counts) continue;
      const load = injuryLoad(counts, ctx.content, player.condition.fatigue);
      const b = BALANCE.injuryRisk;
      const age = ageOn(ctx.state.calendar.mondayISO, player.identity.birthDate);
      const chance = clamp(
        load * b.chancePerLoad * (1 - player.attributes.durability * b.durabilityProtection) * injuryAgeMultiplier(age),
        0,
        b.maxWeeklyChance,
      );
      if (!ctx.rng.chance(chance)) continue;

      const type = dominantSport(counts) ?? "overuse";
      const severity = rollSeverity(ctx.rng, load);
      const weeksRemaining = rollDuration(ctx.rng, severity);
      player.condition.injury = { type, severity, weeksRemaining };
      ctx.log.emit("injury.occurred", player.identity.id, { type, severity, weeksRemaining });
    }
  },
};

/** Which sport, if any, contributed the most training sessions this week —
 * the one the injury gets attributed to and blocks while it heals. */
function dominantSport(counts: ActivityCounts): Sport | null {
  let best: Sport | null = null;
  let bestSessions = 0;
  for (const sport of SPORTS) {
    const sessions = counts[SPORT_ACTIVITY[sport]] ?? 0;
    if (sessions > bestSessions) {
      bestSessions = sessions;
      best = sport;
    }
  }
  return best;
}

function rollSeverity(rng: Rng, load: number): 1 | 2 | 3 {
  const b = BALANCE.injuryRisk;
  if (load >= b.highAt) return rng.chance(0.5) ? 3 : 2;
  if (load >= b.mediumAt) return rng.chance(0.5) ? 2 : 1;
  return 1;
}

function rollDuration(rng: Rng, severity: 1 | 2 | 3): number {
  if (severity === 1) return 1 + rng.int(2); // 1-2 weeks
  if (severity === 2) return 3 + rng.int(2); // 3-4 weeks
  return 5 + rng.int(3); // 5-7 weeks
}
