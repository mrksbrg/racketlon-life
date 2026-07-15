import { BALANCE } from "../balance.js";
import { ageOn } from "../core/date.js";
import type { Player } from "../model/player.js";
import { SPORTS } from "../model/sport.js";
import type { GameSystem, SystemContext } from "./types.js";

/**
 * Permanent (not just match-day) skill erosion with age — docs/02's
 * "Aging" section anticipated this as a later milestone (the orchestrator's
 * old "AgingSystem … (M4)" placeholder comment). `systems/age.ts`'s
 * `matchAgeModifier` already models a *transient* match-day physical
 * decline recomputed fresh every match; nothing before this touched the
 * permanent `attributes.skills` value itself.
 *
 * Two effects layered together, both starting at `BALANCE.aging.declineFromAge`:
 *  - a small continuous weekly erosion — the steady "linear" decline felt
 *    between the two cliffs below, deliberately gentle since the step-downs
 *    carry most of the felt decline;
 *  - two one-time "cliff" step-downs, each confined to a five-year window
 *    (40-45, 60-65) — real athletic decline isn't perfectly smooth, it also
 *    comes in noticeable jumps around these ages. Each window rolls a small
 *    weekly chance to fire (escalated in the window's final year), so
 *    different players hit their wall at a different, unpredictable point,
 *    but it's virtually guaranteed to have fired before they age out.
 *
 * Runs for any player still weekly-simulated (skips simTier 2, same as
 * RecoverySystem/InjurySystem) — NPCs age and decline exactly like the
 * human, no special-casing needed.
 */
export const AgingSystem: GameSystem = {
  id: "aging",
  run(ctx) {
    const b = BALANCE.aging;
    for (const player of ctx.state.players) {
      if (player.simTier === 2) continue;
      const age = ageOn(ctx.state.calendar.mondayISO, player.identity.birthDate);
      if (age < b.declineFromAge) continue;

      reduceSkillsByFraction(player, b.weeklyDeclineRate);
      reduceTrainableAttributesByFraction(player, BALANCE.training.attributeAgeDeclineRate);
      maybeStepDown(ctx, player, age, "step1", b.step1FromAge, b.step1ToAge, b.step1WeeklyChance, b.step1DropPct);
      maybeStepDown(ctx, player, age, "step2", b.step2FromAge, b.step2ToAge, b.step2WeeklyChance, b.step2DropPct);
    }
  },
};

function reduceSkillsByFraction(player: Player, fraction: number): void {
  for (const sport of SPORTS) {
    player.attributes.skills[sport] = Math.max(0, player.attributes.skills[sport] * (1 - fraction));
  }
}

function reduceTrainableAttributesByFraction(player: Player, fraction: number): void {
  player.attributes.endurance = Math.max(0, player.attributes.endurance * (1 - fraction));
  player.attributes.coreStrength = Math.max(0, player.attributes.coreStrength * (1 - fraction));
}

/**
 * Rolls this week's chance for one cliff step-down. A no-op once it's
 * already fired for this player, or outside its `[fromAge, toAge)` window.
 * The chance escalates by `finalYearChanceMult` during the window's last
 * year so it's very likely (though never absolutely guaranteed) to fire
 * before the player ages out of the window.
 */
function maybeStepDown(
  ctx: SystemContext,
  player: Player,
  age: number,
  key: "step1" | "step2",
  fromAge: number,
  toAge: number,
  weeklyChance: number,
  dropPct: number,
): void {
  if (age < fromAge || age >= toAge) return;
  if (player.condition.agingSteps[key]) return;

  const inFinalYear = age >= toAge - 1;
  const chance = inFinalYear ? weeklyChance * BALANCE.aging.finalYearChanceMult : weeklyChance;
  if (!ctx.rng.chance(chance)) return;

  reduceSkillsByFraction(player, dropPct);
  player.condition.agingSteps[key] = true;
  ctx.log.emit("aging.stepDown", player.identity.id, { fromAge, toAge });
}
