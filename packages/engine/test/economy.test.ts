import { describe, expect, it } from "vitest";
import { BALANCE, Game } from "../src/index.js";
import { planWith, testContent } from "./fixtures.js";

describe("economy", () => {
  it("full-time work builds savings", () => {
    const game = Game.newGame({ content: testContent, seed: "e1" });
    const before = game.you.money;
    const summary = game.submitWeek(planWith({ work: 15 }));
    // 15 × 800 income − 2500 living expenses
    expect(summary.money.delta).toBe(15 * 800 - BALANCE.economy.weeklyExpenses);
    expect(summary.money.value).toBe(before + summary.money.delta);
  });

  it("a week without work drains living expenses", () => {
    const game = Game.newGame({ content: testContent, seed: "e2" });
    const summary = game.submitWeek(planWith({}));
    expect(summary.money.delta).toBe(-BALANCE.economy.weeklyExpenses);
  });

  it("training costs court fees", () => {
    const game = Game.newGame({ content: testContent, seed: "e3" });
    const summary = game.submitWeek(planWith({ trainTT: 5 }));
    expect(summary.money.delta).toBe(-BALANCE.economy.weeklyExpenses - 5 * 60);
  });
});
