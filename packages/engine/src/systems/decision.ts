import { BALANCE } from "../balance.js";
import { clamp } from "../core/util.js";
import { humanPlayer } from "../core/state.js";
import { SKILL_MAX, SPORTS } from "../model/sport.js";
import type { GameSystem } from "./types.js";

/**
 * Applies decision-event effects the player has already chosen (see
 * `Game.chooseInboxOption`), the week they were queued for. This is the only
 * place a `PendingEffect` actually touches skills/fatigue/money/etc. —
 * InboxSystem only ever offers choices, never mutates stats itself (docs/03's
 * offers-only rule). Runs early in the pipeline, right after PlanningSystem,
 * so this week's own Training/Economy/Fatigue systems build on top of
 * whatever the decision already changed, the same way a real sparring
 * session or physio visit earlier in the week would color the rest of it.
 */
export const DecisionSystem: GameSystem = {
  id: "decision",
  run(ctx) {
    const week = ctx.state.calendar.weekIndex;
    const due = ctx.state.career.pendingEffects.filter((p) => p.weekIndex === week);
    if (due.length === 0) return;
    ctx.state.career.pendingEffects = ctx.state.career.pendingEffects.filter((p) => p.weekIndex !== week);

    const human = humanPlayer(ctx.state);
    for (const { effect } of due) {
      if (effect.money) ctx.state.career.money += effect.money;
      if (effect.fatigue) human.condition.fatigue = clamp(human.condition.fatigue + effect.fatigue, 0, 100);
      if (effect.soreness) human.condition.soreness = clamp(human.condition.soreness + effect.soreness, 0, 100);
      if (effect.confidence) human.condition.confidence = clamp(human.condition.confidence + effect.confidence, -10, 10);
      if (effect.skill) {
        for (const sport of SPORTS) {
          const delta = effect.skill[sport];
          if (delta) human.attributes.skills[sport] = clamp(human.attributes.skills[sport] + delta, 0, SKILL_MAX);
        }
      }
      if (effect.form) {
        for (const sport of SPORTS) {
          const delta = effect.form[sport];
          if (delta) human.condition.formBySport[sport] = clamp(human.condition.formBySport[sport] + delta, 0, BALANCE.form.max);
        }
      }
      ctx.log.emit("decision.resolved", human.identity.id, { note: effect.note });
    }
  },
};
