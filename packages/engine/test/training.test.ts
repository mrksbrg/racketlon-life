import { describe, expect, it } from "vitest";
import { Game, expectedSessionGain } from "../src/index.js";
import { planWith, testContent } from "./fixtures.js";

describe("training", () => {
  it("raises the trained sport and leaves untrained racket sports alone", () => {
    const game = Game.newGame({ content: testContent, seed: "t1" });
    const summary = game.submitWeek(planWith({ trainTT: 5, work: 5 }));
    expect(summary.sports.tt.skillDelta).toBeGreaterThan(0);
    expect(summary.sports.bd.skillDelta).toBe(0);
    expect(summary.sports.sq.skillDelta).toBe(0);
    expect(summary.sports.tn.skillDelta).toBe(0);
  });

  it("has diminishing returns as skill grows", () => {
    const low = expectedSessionGain(6, 200, 0.5, 20);
    const high = expectedSessionGain(6, 800, 0.5, 20);
    expect(high).toBeLessThan(low);
    expect(high).toBeGreaterThan(0);
  });

  it("trains worse when exhausted", () => {
    const fresh = expectedSessionGain(6, 400, 0.5, 30);
    const tired = expectedSessionGain(6, 400, 0.5, 95);
    expect(tired).toBeLessThan(fresh);
  });


  it("gym and cardio improve attributes without increasing sport skills", () => {
    const game = Game.newGame({ content: testContent, seed: "pt-no-skill" });
    const before = game.serialize().state.players.find((p) => p.identity.id === "you")!.attributes;
    const summary = game.submitWeek(planWith({ gym: 3, cardio: 3 }));
    const after = game.serialize().state.players.find((p) => p.identity.id === "you")!.attributes;
    expect(summary.sports.tt.skillDelta).toBe(0);
    expect(summary.sports.bd.skillDelta).toBe(0);
    expect(summary.sports.sq.skillDelta).toBe(0);
    expect(summary.sports.tn.skillDelta).toBe(0);
    expect(after.coreStrength).toBeGreaterThan(before.coreStrength);
    expect(after.stamina).toBeGreaterThan(before.stamina);
    expect(summary.notes).toContain("Gym work built your core strength.");
    expect(summary.notes).toContain("Cardio built your stamina.");
  });



  it("squash and badminton maintain stamina at twice a week, then bonus at higher volume", () => {
    const twiceSquash = Game.newGame({ content: testContent, seed: "sport-stamina" });
    const heavySquash = Game.newGame({ content: testContent, seed: "sport-stamina" });
    const heavyBadminton = Game.newGame({ content: testContent, seed: "sport-stamina" });
    const rest = Game.newGame({ content: testContent, seed: "sport-stamina" });
    const before = twiceSquash.serialize().state.players.find((p) => p.identity.id === "you")!.attributes.stamina;

    twiceSquash.submitWeek(planWith({ trainSQ: 2 }));
    heavySquash.submitWeek(planWith({ trainSQ: 4 }));
    heavyBadminton.submitWeek(planWith({ trainBD: 4 }));
    rest.submitWeek(planWith({ work: 5 }));

    const maintained = twiceSquash.serialize().state.players.find((p) => p.identity.id === "you")!.attributes.stamina;
    const sqStamina = heavySquash.serialize().state.players.find((p) => p.identity.id === "you")!.attributes.stamina;
    const bdStamina = heavyBadminton.serialize().state.players.find((p) => p.identity.id === "you")!.attributes.stamina;
    const restStamina = rest.serialize().state.players.find((p) => p.identity.id === "you")!.attributes.stamina;
    expect(maintained).toBeCloseTo(before, 10);
    expect(sqStamina).toBeGreaterThan(maintained);
    expect(sqStamina).toBeGreaterThan(bdStamina);
    expect(bdStamina).toBeGreaterThan(restStamina);
  });

  it("untrained stamina drifts weekly, while core strength waits for the monthly decay tick", () => {
    const game = Game.newGame({ content: testContent, seed: "pt-decay" });
    const before = game.serialize().state.players.find((p) => p.identity.id === "you")!.attributes;
    game.submitWeek(planWith({ work: 5 }));
    const afterOne = game.serialize().state.players.find((p) => p.identity.id === "you")!.attributes;
    expect(afterOne.stamina).toBeLessThan(before.stamina);
    expect(afterOne.coreStrength).toBeCloseTo(before.coreStrength, 10);

    for (let i = 0; i < 3; i++) game.submitWeek(planWith({ work: 5 }));
    const afterFour = game.serialize().state.players.find((p) => p.identity.id === "you")!.attributes;
    expect(afterFour.coreStrength).toBeLessThan(before.coreStrength);
  });

  it("heavy weeks add fatigue, rest weeks remove it", () => {
    const grind = Game.newGame({ content: testContent, seed: "t2" });
    const heavy = grind.submitWeek(planWith({ trainTT: 8, trainBD: 7 }));
    expect(heavy.fatigue.delta).toBeGreaterThan(0);

    const rested = Game.newGame({ content: testContent, seed: "t2" });
    const easy = rested.submitWeek(planWith({}));
    expect(easy.fatigue.delta).toBeLessThan(0);
    expect(easy.fatigue.value).toBe(0);
  });

  it("a full rest week can wipe maximum fatigue", () => {
    const game = Game.newGame({ content: testContent, seed: "recovery-wipes-fatigue" });
    const save = game.serialize();
    save.state.players.find((p) => p.identity.id === "you")!.condition.fatigue = 100;

    const recovered = Game.fromSave(save, testContent).submitWeek(planWith({}));

    expect(recovered.fatigue.delta).toBe(-100);
    expect(recovered.fatigue.value).toBe(0);
  });
});

describe("trainedWeekDates (season calendar history)", () => {
  it("records a week's trained sports, resolved to a real date", () => {
    const game = Game.newGame({ content: testContent, seed: "tw-1" });
    game.submitWeek(planWith({ trainTT: 5, trainBD: 2, work: 5 }));
    const weeks = game.trainedWeekDates();
    expect(weeks).toHaveLength(1);
    expect(weeks[0]!.sports.sort()).toEqual(["bd", "tt"]);
    expect(weeks[0]!.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("skips a week with no training at all — always-recorded, not threshold-gated", () => {
    const game = Game.newGame({ content: testContent, seed: "tw-2" });
    game.submitWeek(planWith({ work: 5 })); // no training slots
    expect(game.trainedWeekDates()).toHaveLength(0);
  });

  it("is empty before any week has been played", () => {
    const game = Game.newGame({ content: testContent, seed: "tw-3" });
    expect(game.trainedWeekDates()).toHaveLength(0);
  });
});
