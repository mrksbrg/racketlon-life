import { describe, expect, it } from "vitest";
import {
  BALANCE,
  Game,
  activeWeekModifier,
  blockedSportOf,
  humanPlayer,
  monthKeyForWeek,
  startCalendar,
  weekModifierContent,
} from "../src/index.js";
import { planWith, testContent } from "./fixtures.js";

const WORK = planWith({ work: 5 });

// Fixed anchor (2026-01-05) — exactly what Game.newGame's world uses too, so
// `monthKeyForWeek(CAL, w)` gives the real calendar month for week `w`
// regardless of which career/seed is under test.
const CAL = startCalendar();
// Sweden — matches testContent's own "SE" entry and the default fallback
// human's nationality (world/factory.ts), so integration tests below (which
// go through a real `Game`) see exactly this latitude internally too.
const NORTHERN_LAT = 60;
const SOUTHERN_LAT = -35;

/** Scans forward from week 0 for the first week whose rolled modifier
 * matches `id` — the roll is a pure function of (seed, week, calendar,
 * homeLat), so this can run standalone before ever constructing a `Game`. */
function findWeekWithModifier(seed: string, id: string, homeLat = NORTHERN_LAT, maxWeeks = 80): number {
  for (let w = 0; w < maxWeeks; w++) {
    if (activeWeekModifier(seed, w, CAL, homeLat)?.id === id) return w;
  }
  throw new Error(`no "${id}" week found for seed "${seed}" within ${maxWeeks} weeks`);
}

function advance(game: Game, n: number): void {
  for (let i = 0; i < n; i++) game.submitWeek(WORK);
}

describe("activeWeekModifier", () => {
  it("is deterministic for a given seed, week, calendar, and home latitude", () => {
    expect(activeWeekModifier("mod-seed", 5, CAL, NORTHERN_LAT)).toEqual(activeWeekModifier("mod-seed", 5, CAL, NORTHERN_LAT));
  });

  it("different weeks (and seeds) diverge — not every week is null or the same modifier", () => {
    const ids = new Set<string | null>();
    for (let w = 0; w < 40; w++) ids.add(activeWeekModifier("mod-sweep", w, CAL, NORTHERN_LAT)?.id ?? null);
    expect(ids.size).toBeGreaterThan(1);
  });

  it("fires roughly BALANCE.modifiers.chance of weeks, over a long enough run", () => {
    let fired = 0;
    const total = 400;
    for (let w = 0; w < total; w++) {
      if (activeWeekModifier("mod-distribution", w, CAL, NORTHERN_LAT)) fired++;
    }
    const rate = fired / total;
    expect(rate).toBeGreaterThan(BALANCE.modifiers.chance - 0.12);
    expect(rate).toBeLessThan(BALANCE.modifiers.chance + 0.12);
  });
});

describe("hemisphere-aware seasonality", () => {
  it("a Northern Hemisphere heat wave only ever rolls in June/July/August, and does roll at least once", () => {
    let saw = false;
    for (let w = 0; w < 300; w++) {
      const m = activeWeekModifier("mod-hemisphere-north", w, CAL, NORTHERN_LAT);
      if (m?.id !== "heat-wave") continue;
      saw = true;
      const month = Number(monthKeyForWeek(CAL, w).split("-")[1]);
      expect([6, 7, 8]).toContain(month);
    }
    expect(saw).toBe(true);
  });

  it("a Southern Hemisphere heat wave only ever rolls in December/January/February — the opposite months", () => {
    let saw = false;
    for (let w = 0; w < 300; w++) {
      const m = activeWeekModifier("mod-hemisphere-south", w, CAL, SOUTHERN_LAT);
      if (m?.id !== "heat-wave") continue;
      saw = true;
      const month = Number(monthKeyForWeek(CAL, w).split("-")[1]);
      expect([12, 1, 2]).toContain(month);
    }
    expect(saw).toBe(true);
  });

  it("non-seasonal modifiers (e.g. squash-closed) are unaffected by hemisphere", () => {
    const north = findWeekWithModifier("mod-hemisphere-neutral", "squash-closed", NORTHERN_LAT);
    const south = findWeekWithModifier("mod-hemisphere-neutral", "squash-closed", SOUTHERN_LAT);
    expect(north).toBe(south); // same seed, same week, hemisphere shouldn't matter here
  });
});

describe("weekModifierContent", () => {
  it("returns the exact same content object when there's no modifier — no needless cloning", () => {
    expect(weekModifierContent(testContent, null)).toBe(testContent);
  });

  it("zeroes trainingBase for a sportMultiplier: 0 entry, leaving other activities untouched", () => {
    const modifier = { id: "t", headline: "", body: "", sportMultiplier: { sq: 0 } };
    const content = weekModifierContent(testContent, modifier);
    expect(content.activities.trainSQ.trainingBase).toBe(0);
    expect(content.activities.trainTT).toEqual(testContent.activities.trainTT);
    expect(content.activities.trainBD).toEqual(testContent.activities.trainBD);
  });

  it("scales trainingBase for a fractional sportMultiplier", () => {
    const modifier = { id: "t", headline: "", body: "", sportMultiplier: { bd: 1.5 } };
    const content = weekModifierContent(testContent, modifier);
    expect(content.activities.trainBD.trainingBase).toBe(testContent.activities.trainBD.trainingBase! * 1.5);
  });

  it("adds extra fatigue per session on top of the base value", () => {
    const modifier = { id: "t", headline: "", body: "", extraFatiguePerSession: { tn: 3 } };
    const content = weekModifierContent(testContent, modifier);
    expect(content.activities.trainTN.fatigue).toBe(testContent.activities.trainTN.fatigue + 3);
  });

  it("scales social's money cost for socialMoneyMultiplier", () => {
    const modifier = { id: "t", headline: "", body: "", socialMoneyMultiplier: 0 };
    const content = weekModifierContent(testContent, modifier);
    // toBeCloseTo, not toBe: -100 * 0 is IEEE754 -0, distinct from +0 under
    // Object.is but numerically and behaviorally identical everywhere it's used.
    expect(content.activities.social.money).toBeCloseTo(0, 5);
  });
});

describe("blockedSportOf", () => {
  it("finds the sport with an exact 0 multiplier", () => {
    expect(blockedSportOf({ id: "t", headline: "", body: "", sportMultiplier: { sq: 0 } })).toBe("sq");
  });

  it("is null for a boost, a fatigue tweak, or no modifier at all", () => {
    expect(blockedSportOf({ id: "t", headline: "", body: "", sportMultiplier: { bd: 1.5 } })).toBeNull();
    expect(blockedSportOf({ id: "t", headline: "", body: "", extraFatiguePerSession: { tn: 3 } })).toBeNull();
    expect(blockedSportOf(null)).toBeNull();
  });
});

describe("week modifiers wired into the weekly pipeline", () => {
  it("a squash-closed week zeroes the human's squash training gain and Game.weekModifier reports it", () => {
    const seed = "modifier-squash-closed";
    const week = findWeekWithModifier(seed, "squash-closed");
    const game = Game.newGame({ content: testContent, seed });
    advance(game, week);
    expect(game.weekIndex).toBe(week);

    expect(game.weekModifier()?.blockedSport).toBe("sq");

    const before = humanPlayer(game.serialize().state).attributes.skills.sq;
    game.submitWeek(planWith({ trainSQ: 8, work: 5 }));
    const after = humanPlayer(game.serialize().state).attributes.skills.sq;

    expect(after).toBeCloseTo(before, 5); // exactly zero gain, not just "less"
  });

  it("has no opinion (null) on a week that didn't roll a modifier", () => {
    const seed = "modifier-none-1";
    let week = 0;
    while (activeWeekModifier(seed, week, CAL, NORTHERN_LAT)) week++; // find a guaranteed-quiet week
    const game = Game.newGame({ content: testContent, seed });
    advance(game, week);
    expect(game.weekModifier()).toBeNull();
  });

  it("an open-house week makes socialising free for the human", () => {
    const seed = "modifier-open-house";
    const week = findWeekWithModifier(seed, "open-house");
    const game = Game.newGame({ content: testContent, seed });
    advance(game, week);

    const summary = game.submitWeek(planWith({ social: 3, work: 5 }));
    // only weeklyExpenses hit the balance — the 3 social sessions cost nothing
    expect(summary.money.delta).toBe(-BALANCE.economy.weeklyExpenses);
  });

  it("a Swedish (Northern Hemisphere) career only ever gets a heat wave in June/July/August", () => {
    const seed = "modifier-heatwave-timing";
    // heat-wave is now restricted to ~3 months a year (see hemisphere-aware
    // seasonality above), so it needs a longer search window than the
    // default 80 weeks to reliably show up for an arbitrary seed.
    const week = findWeekWithModifier(seed, "heat-wave", NORTHERN_LAT, 300);
    const month = Number(monthKeyForWeek(CAL, week).split("-")[1]);
    expect([6, 7, 8]).toContain(month);

    const game = Game.newGame({ content: testContent, seed }); // default human is Swedish
    advance(game, week);
    expect(game.weekModifier()?.headline).toBe("Heat wave this week");
  });
});
