import { BALANCE } from "../balance.js";
import { ageOn } from "../core/date.js";
import { round1 } from "../core/util.js";
import type { Player } from "../model/player.js";
import type { Sport } from "../model/sport.js";
import { SKILL_MAX, SPORTS, levelForSkill } from "../model/sport.js";
import { countEntries, expectedSessionGain } from "./effects.js";
import type { GameSystem, SystemContext } from "./types.js";

/**
 * Applies the week's training. Session quality depends on the fatigue a
 * player *brought into* the week (FatigueSystem runs after Training), so
 * overtraining last week makes this week's sessions worse — a consequence
 * the player can see coming.
 */
export const TrainingSystem: GameSystem = {
  id: "training",
  run(ctx) {
    for (const player of ctx.state.players) {
      const counts = ctx.plans.get(player.identity.id);
      if (!counts) continue;
      for (const [type, sessions] of countEntries(counts)) {
        const def = ctx.content.activities[type];
        if (def.sport !== undefined && def.trainingBase !== undefined) {
          if (player.condition.injury?.type === def.sport) {
            ctx.log.emit("injury.blocked", player.identity.id, { sport: def.sport, sessions });
            continue;
          }
          trainSport(ctx, player, def.sport, def.trainingBase, sessions);
        } else if (type === "physical") {
          for (const sport of SPORTS) {
            applyGain(ctx, player, sport, BALANCE.training.physicalAllSportGain * sessions);
          }
        }
      }
    }
  },
};

function trainSport(
  ctx: SystemContext,
  player: Player,
  sport: Sport,
  base: number,
  sessions: number,
): void {
  const { talent } = player.attributes;
  const { fatigue } = player.condition;
  const age = ageOn(ctx.state.calendar.mondayISO, player.identity.birthDate);
  let gain = 0;
  for (let i = 0; i < sessions; i++) {
    const expected = expectedSessionGain(
      base,
      player.attributes.skills[sport] + gain,
      talent,
      fatigue,
      age,
    );
    const noise = 1 + (ctx.rng.next() * 2 - 1) * BALANCE.training.randomness;
    gain += expected * noise;
  }
  const applied = applyGain(ctx, player, sport, gain);
  if (applied > 0.05) {
    ctx.log.emit("training.progress", player.identity.id, {
      sport,
      sessions,
      gain: round1(applied),
    });
  }
}

/** Adds skill, clamps to the cap, emits a level-up event on band crossings. */
function applyGain(ctx: SystemContext, player: Player, sport: Sport, gain: number): number {
  const before = player.attributes.skills[sport];
  const after = Math.min(SKILL_MAX, before + gain);
  player.attributes.skills[sport] = after;
  const levelAfter = levelForSkill(after);
  if (levelAfter > levelForSkill(before)) {
    ctx.log.emit("training.levelUp", player.identity.id, { sport, level: levelAfter });
  }
  return after - before;
}
