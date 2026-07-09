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

  it("heavy weeks add fatigue, rest weeks remove it", () => {
    const grind = Game.newGame({ content: testContent, seed: "t2" });
    const heavy = grind.submitWeek(planWith({ trainTT: 8, trainBD: 7 }));
    expect(heavy.fatigue.delta).toBeGreaterThan(0);

    const rested = Game.newGame({ content: testContent, seed: "t2" });
    const easy = rested.submitWeek(planWith({}));
    expect(easy.fatigue.delta).toBeLessThan(0);
    expect(easy.fatigue.value).toBe(0);
  });
});
