import { BALANCE } from "../balance.js";
import { ageOn } from "../core/date.js";
import { clamp, round1 } from "../core/util.js";
import type { Player } from "../model/player.js";
import type { Sport } from "../model/sport.js";
import { SKILL_MAX, SPORTS, levelForSkill } from "../model/sport.js";
import { countEntries, expectedSessionGain, formDelta } from "./effects.js";
import type { GameSystem, SystemContext } from "./types.js";

/**
 * Applies the week's training. Session quality depends on the fatigue a
 * player *brought into* the week (FatigueSystem runs after Training), so
 * overtraining last week makes this week's sessions worse — a consequence
 * the player can see coming.
 *
 * Also updates per-sport form (BALANCE.form): a sport actually trained this
 * week gains form, one left untouched (including an injury-blocked sport —
 * you couldn't practice it either way) decays. This is the one place that
 * already has this week's per-sport session counts, so form and skill are
 * updated from the same loop.
 */
export const TrainingSystem: GameSystem = {
  id: "training",
  run(ctx) {
    for (const player of ctx.state.players) {
      const counts = ctx.plans.get(player.identity.id);
      if (!counts) continue;
      const sessionsBySport: Record<Sport, number> = { tt: 0, bd: 0, sq: 0, tn: 0 };
      for (const [type, sessions] of countEntries(counts)) {
        const def = ctx.content.activities[type];
        if (def.sport !== undefined && def.trainingBase !== undefined) {
          if (player.condition.injury?.type === def.sport) {
            ctx.log.emit("injury.blocked", player.identity.id, { sport: def.sport, sessions });
            continue;
          }
          sessionsBySport[def.sport] += sessions;
          trainSport(ctx, player, def.sport, def.trainingBase, sessions);
        } else if (type === "physical") {
          for (const sport of SPORTS) {
            applyGain(ctx, player, sport, BALANCE.training.physicalAllSportGain * sessions);
          }
        }
      }
      updateForm(ctx, player, sessionsBySport);
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
  const potential = player.attributes.potential[sport];
  const { fatigue } = player.condition;
  const age = ageOn(ctx.state.calendar.mondayISO, player.identity.birthDate);
  let gain = 0;
  for (let i = 0; i < sessions; i++) {
    const expected = expectedSessionGain(
      base,
      player.attributes.skills[sport] + gain,
      potential,
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

const FORM_RUSTY_THRESHOLD = 6;

/** Applies this week's per-sport form change and emits a note when a sport
 * crosses into "rusty" or reaches full readiness — mirrors the level-up
 * event's crossing pattern (fires once, on the week it happens). Also
 * advances `condition.neglectWeeks`, the consecutive-weeks-untrained streak
 * the staged decay curve is keyed on (see `formDecayRate`). */
function updateForm(ctx: SystemContext, player: Player, sessionsBySport: Record<Sport, number>): void {
  const f = BALANCE.form;
  for (const sport of SPORTS) {
    const trained = sessionsBySport[sport] > 0;
    player.condition.neglectWeeks[sport] = trained ? 0 : player.condition.neglectWeeks[sport] + 1;

    const before = player.condition.formBySport[sport];
    const after = clamp(
      before + formDelta(sessionsBySport[sport], player.condition.neglectWeeks[sport]),
      0,
      f.max,
    );
    player.condition.formBySport[sport] = after;
    if (after < FORM_RUSTY_THRESHOLD && before >= FORM_RUSTY_THRESHOLD) {
      ctx.log.emit("form.rusty", player.identity.id, { sport });
    } else if (after >= f.max && before < f.max) {
      ctx.log.emit("form.sharp", player.identity.id, { sport });
    }
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
