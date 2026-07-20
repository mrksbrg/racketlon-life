import { describe, expect, it } from "vitest";
import type { EventLog, GameState, PendingEffect, SystemContext } from "../src/index.js";
import { DecisionSystem, Game, Rng, WeekLog, emptyPlan, humanPlayer } from "../src/index.js";
import { testContent } from "./fixtures.js";

/**
 * DecisionSystem is exercised directly against a hand-built context, same
 * pattern as progression.test.ts — the actual numeric deltas are clamped
 * (fatigue/soreness 0..100, form 0..20, confidence -10..10), which the full
 * weekly pipeline can silently saturate against after many advanced weeks
 * (FatigueSystem/RecoverySystem both apply on top of whatever DecisionSystem
 * already did). Testing the system in isolation, from a known baseline,
 * sidesteps that entirely.
 */
function makeContext(state: GameState, log: EventLog): SystemContext {
  const human = humanPlayer(state);
  return {
    state,
    content: testContent,
    humanPlan: emptyPlan(),
    plans: new Map(),
    rng: new Rng("decision-test"),
    log: new WeekLog(log, state.calendar.weekIndex),
    snapshot: {
      skills: { ...human.attributes.skills },
      fatigue: human.condition.fatigue,
      money: state.career.money,
      formBySport: { ...human.condition.formBySport },
      trainableAttributes: {
        endurance: human.attributes.endurance,
        coreStrength: human.attributes.coreStrength,
      },
    },
    outputs: {},
    weekModifier: null,
  };
}

function freshState(): GameState {
  const game = Game.newGame({ content: testContent, seed: "decision-fixture" });
  return game.serialize().state;
}

describe("DecisionSystem", () => {
  it("applies a fully-specified pending effect and emits its note", () => {
    const state = freshState();
    const week = state.calendar.weekIndex;
    const human = humanPlayer(state);
    human.condition.fatigue = 40;
    human.condition.soreness = 20;
    human.condition.confidence = 0;
    human.attributes.skills.tt = 300;
    human.condition.formBySport.tt = 10;
    const beforeMoney = state.career.money;

    const effect: PendingEffect = {
      money: -60,
      fatigue: -15,
      soreness: -10,
      confidence: 2,
      skill: { tt: 5 },
      form: { tt: 3 },
      note: "The physio session eased your fatigue and soreness.",
    };
    state.career.pendingEffects = [{ weekIndex: week, effect }];

    const log: EventLog = [];
    DecisionSystem.run(makeContext(state, log));

    expect(state.career.money).toBe(beforeMoney - 60);
    expect(human.condition.fatigue).toBe(25);
    expect(human.condition.soreness).toBe(10);
    expect(human.condition.confidence).toBe(2);
    expect(human.attributes.skills.tt).toBe(305);
    expect(human.condition.formBySport.tt).toBe(13);
    expect(state.career.pendingEffects).toHaveLength(0);
    expect(log).toContainEqual(
      expect.objectContaining({ type: "decision.resolved", subject: human.identity.id, data: { note: effect.note } }),
    );
  });

  it("clamps every affected stat to its bounds rather than overshooting", () => {
    const state = freshState();
    const week = state.calendar.weekIndex;
    const human = humanPlayer(state);
    human.condition.fatigue = 5;
    human.condition.soreness = 3;
    human.condition.confidence = -9;
    human.condition.formBySport.tt = 19;

    const effect: PendingEffect = {
      fatigue: -50, // would go negative
      soreness: -50, // would go negative
      confidence: -5, // would go past -10
      form: { tt: 10 }, // would go past 20 (BALANCE.form.max)
      note: "clamp test",
    };
    state.career.pendingEffects = [{ weekIndex: week, effect }];

    DecisionSystem.run(makeContext(state, []));

    expect(human.condition.fatigue).toBe(0);
    expect(human.condition.soreness).toBe(0);
    expect(human.condition.confidence).toBe(-10);
    expect(human.condition.formBySport.tt).toBe(20);
  });

  it("only applies effects queued for this exact week, leaving other weeks' entries queued", () => {
    const state = freshState();
    const week = state.calendar.weekIndex;
    const beforeMoney = state.career.money;

    const thisWeek: PendingEffect = { money: -10, note: "this week" };
    const nextWeek: PendingEffect = { money: -999, note: "next week" };
    state.career.pendingEffects = [
      { weekIndex: week, effect: thisWeek },
      { weekIndex: week + 1, effect: nextWeek },
    ];

    const log: EventLog = [];
    DecisionSystem.run(makeContext(state, log));

    expect(state.career.money).toBe(beforeMoney - 10);
    expect(state.career.pendingEffects).toEqual([{ weekIndex: week + 1, effect: nextWeek }]);
    expect(log.some((e) => e.data?.note === "next week")).toBe(false);
  });

  it("is a no-op (no log entries) when nothing is queued for this week", () => {
    const state = freshState();
    state.career.pendingEffects = [];
    const log: EventLog = [];

    DecisionSystem.run(makeContext(state, log));

    expect(log).toHaveLength(0);
  });
});
