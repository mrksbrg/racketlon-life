import { describe, expect, it } from "vitest";
import type { CharacterDraft } from "../src/index.js";
import { BALANCE, Game } from "../src/index.js";
import { planWith, testContent } from "./fixtures.js";

describe("economy", () => {
  it("full-time work banks salary toward payday instead of paying immediately", () => {
    const game = Game.newGame({ content: testContent, seed: "e1" });
    const before = game.you.money;
    const summary = game.submitWeek(planWith({ work: 15 }));
    // only living expenses hit the balance this week — salary banks in
    // pendingSalary until the last week of the month (see systems/economy.ts)
    expect(summary.money.delta).toBe(-BALANCE.economy.weeklyExpenses);
    expect(summary.money.value).toBe(before + summary.money.delta);
    // default fallback human's career attribute (0.5) is the multiplier's
    // neutral point (1.0×) — see salaryMultiplier
    expect(game.you.pendingSalary).toBe(15 * 800);
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

  it("pays out banked salary as one lump sum on the last week of the month", () => {
    const game = Game.newGame({ content: testContent, seed: "payday-1" });
    const plan = planWith({ work: 5 });
    // weeks 0/1/2 (Jan 5/12/19, 2026) — nowhere near month-end
    for (let i = 0; i < 3; i++) {
      const before = game.you.money;
      const summary = game.submitWeek(plan);
      expect(summary.money.delta).toBe(-BALANCE.economy.weeklyExpenses);
      expect(game.you.money).toBe(before - BALANCE.economy.weeklyExpenses);
    }
    expect(game.you.pendingSalary).toBe(3 * 5 * 800);

    // week 3 (Jan 26) is the last week of January — the whole pot pays out
    const beforePayday = game.you.money;
    const paydaySummary = game.submitWeek(plan);
    const paid = 4 * 5 * 800; // 3 banked weeks + this week's own salary
    expect(paydaySummary.money.delta).toBe(paid - BALANCE.economy.weeklyExpenses);
    expect(game.you.money).toBe(beforePayday - BALANCE.economy.weeklyExpenses + paid);
    expect(game.you.pendingSalary).toBe(0);
  });

  it("scales salary with the Career attribute", () => {
    const base: CharacterDraft = {
      firstName: "Test",
      lastName: "Player",
      gender: "m",
      nationality: "SE",
      birthDate: "1998-01-01",
      sports: { tt: 1, bd: 1, sq: 1, tn: 1 },
      endurance: 1,
      coreStrength: 1,
      career: 1,
      clutch: 1,
      composure: 1,
      fastHealer: 1,
      traits: [],
    };
    const lowGame = Game.newGame({ content: testContent, character: base, seed: "career-low" });
    const highGame = Game.newGame({ content: testContent, character: { ...base, career: 20 }, seed: "career-high" });

    lowGame.submitWeek(planWith({ work: 1 }));
    highGame.submitWeek(planWith({ work: 1 }));

    // career 1/20 → floor (0.6×); career 20/20 → ceiling (1.4×)
    expect(lowGame.you.pendingSalary).toBeCloseTo(800 * (BALANCE.economy.salaryFloor + (1 / 20) * BALANCE.economy.salarySpan), 5);
    expect(highGame.you.pendingSalary).toBeCloseTo(800 * (BALANCE.economy.salaryFloor + BALANCE.economy.salarySpan), 5);
    expect(highGame.you.pendingSalary).toBeGreaterThan(lowGame.you.pendingSalary);
  });
});
