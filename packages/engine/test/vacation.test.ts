import { describe, expect, it } from "vitest";
import type { ActivityType, PlayerPlan } from "../src/index.js";
import { Game, SLOTS_PER_WEEK, annualAllowance, vacationDaysUsedBy } from "../src/index.js";
import { testContent } from "./fixtures.js";

function planOf(fill: ActivityType): PlayerPlan {
  return { slots: Array.from({ length: SLOTS_PER_WEEK }, () => fill) };
}

describe("annualAllowance", () => {
  it("uses the country base plus an age bonus, capped", () => {
    expect(annualAllowance("SE", 27, testContent)).toBe(25); // under 30 → no bonus
    expect(annualAllowance("SE", 36, testContent)).toBe(26); // +1 (6 years over 30)
    expect(annualAllowance("SE", 45, testContent)).toBe(28); // +3
    expect(annualAllowance("SE", 99, testContent)).toBe(30); // bonus capped at +5
  });

  it("falls back to the default when a country has no vacationDays", () => {
    expect(annualAllowance("NO", 25, testContent)).toBe(25); // BALANCE.vacation.defaultDays
  });
});

describe("vacationDaysUsedBy", () => {
  const noHolidayMonday = "2026-01-05"; // no SE fixture holiday that week

  it("a full Mon–Fri working week costs nothing", () => {
    expect(vacationDaysUsedBy(planOf("work"), noHolidayMonday, "SE", testContent)).toBe(0);
  });

  it("a fully-off week costs 5 (5 weekdays × 2 slots × 0.5)", () => {
    expect(vacationDaysUsedBy(planOf("rest"), noHolidayMonday, "SE", testContent)).toBe(5);
  });

  it("exempts a public-holiday weekday", () => {
    // 2026-06-10 (Wed) is the SE fixture holiday → that day's 2 slots are free
    expect(vacationDaysUsedBy(planOf("rest"), "2026-06-08", "SE", testContent)).toBe(4);
  });

  it("ignores evenings and weekends", () => {
    // work all Mon–Fri mornings+afternoons, everything else off → 0 cost
    const slots = Array.from({ length: SLOTS_PER_WEEK }, () => "social" as ActivityType);
    for (let day = 0; day < 5; day++) {
      slots[day * 3 + 0] = "work"; // morning
      slots[day * 3 + 1] = "work"; // afternoon
    }
    expect(vacationDaysUsedBy({ slots }, noHolidayMonday, "SE", testContent)).toBe(0);
  });
});

describe("simulateWeek vacation accounting", () => {
  it("draws down the balance and resets on a new calendar year", () => {
    const game = Game.newGame({ content: testContent, seed: "vac" });
    const start = game.you.remainingVacationDays;
    expect(start).toBe(annualAllowance(game.you.nationality, game.you.age, testContent));

    // a fully-off week (week 0, no holiday) spends 5 days
    game.submitWeek(planOf("rest"));
    expect(game.you.remainingVacationDays).toBe(start - 5);
  });

  it("resets to the fresh allowance when the sim crosses into a new year", () => {
    const game = Game.newGame({ content: testContent, seed: "vac-reset" });
    // force a stale year with a depleted balance, then submit one week
    const save = game.serialize();
    save.state.career.vacationYear = 2025;
    save.state.career.vacationDaysRemaining = 3;
    const restored = Game.fromSave(save, testContent);

    restored.submitWeek(planOf("work")); // full work → 0 cost after reset
    expect(restored.you.remainingVacationDays).toBe(
      annualAllowance(restored.you.nationality, restored.you.age, testContent),
    );
  });

  it("can go negative once the yearly allowance is exhausted", () => {
    const game = Game.newGame({ content: testContent, seed: "vac-neg" });
    // 25 days ÷ 5 per fully-off week = 5 weeks to empty, so 7 goes negative
    for (let i = 0; i < 7; i++) game.submitWeek(planOf("rest"));
    expect(game.you.remainingVacationDays).toBeLessThan(0);
    // an over-drawn HR note lands in the inbox
    expect(game.inbox.some((m) => m.subject.includes("vacation days"))).toBe(true);
  });
});
