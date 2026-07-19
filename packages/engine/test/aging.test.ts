import { describe, expect, it } from "vitest";
import { BALANCE, Game } from "../src/index.js";
import { planWith, testContent } from "./fixtures.js";

const b = BALANCE.aging;
const WORK = planWith({ work: 5 });

/** Same seed, different birthDate — isolates the aging effect from everything else. */
function withBirthDate(seed: string, birthDate: string): Game {
  const game = Game.newGame({ content: testContent, seed });
  const save = game.serialize();
  save.state.players.find((p) => p.identity.id === "you")!.identity.birthDate = birthDate;
  return Game.fromSave(save, testContent);
}

/** Same as withBirthDate, plus a fixed endurance/coreStrength — isolates the
 * fitness-credit effect from everything else. */
function withBirthDateAndFitness(seed: string, birthDate: string, fitness: number): Game {
  const game = Game.newGame({ content: testContent, seed });
  const save = game.serialize();
  const you = save.state.players.find((p) => p.identity.id === "you")!;
  you.identity.birthDate = birthDate;
  you.attributes.endurance = fitness;
  you.attributes.coreStrength = fitness;
  return Game.fromSave(save, testContent);
}

describe("AgingSystem", () => {
  it("does not permanently erode skill before declineFromAge", () => {
    // 26 at game start — well under declineFromAge (32) for the whole run
    const game = withBirthDate("aging-young", "2000-01-15");
    const before = { ...game.you.sports };
    for (let i = 0; i < 20; i++) game.submitWeek(WORK);
    // untrained sports don't gain skill either, so any level drop here would
    // have to be the aging erosion this test is checking is absent
    for (const sport of ["tt", "bd", "sq", "tn"] as const) {
      expect(game.you.sports[sport].level).toBeGreaterThanOrEqual(before[sport].level);
    }
  });

  it("continuously erodes skill week over week past declineFromAge, with no training to offset it", () => {
    // 45 at game start — past declineFromAge, and this test's short window
    // (10 weeks) is nowhere near the 40-45 cliff's near-certain firing point
    const game = withBirthDate("aging-old", "1981-01-15");
    const before = game.serialize().state.players.find((p) => p.identity.id === "you")!.attributes.skills.tt;

    for (let i = 0; i < 10; i++) game.submitWeek(WORK);

    const after = game.serialize().state.players.find((p) => p.identity.id === "you")!.attributes.skills.tt;
    expect(after).toBeLessThan(before);
  });


  it("erodes trainable body attributes past declineFromAge", () => {
    const game = withBirthDate("aging-attrs", "1981-01-15");
    const before = game.serialize().state.players.find((p) => p.identity.id === "you")!.attributes;

    for (let i = 0; i < 10; i++) game.submitWeek(WORK);

    const after = game.serialize().state.players.find((p) => p.identity.id === "you")!.attributes;
    expect(after.endurance).toBeLessThan(before.endurance);
    expect(after.coreStrength).toBeLessThan(before.coreStrength);
  });

  it("fires the 40-45 step-down exactly once, and only within that window", () => {
    // 40 at game start, run the whole five-year window (260 weeks) — the
    // escalating final-year chance makes this ~99.98% certain to fire.
    // Events are filtered to the human specifically — NPCs age too, and
    // could otherwise trigger their own unrelated stepDown events in the
    // same week.
    const game = withBirthDate("aging-step1", "1986-01-15");
    let fired = false;
    for (let i = 0; i < 260; i++) {
      game.submitWeek(WORK);
      if (game.eventsForWeek(i).some((e) => e.type === "aging.stepDown" && e.subject === "you")) {
        expect(fired).toBe(false); // never fires twice for the same window
        fired = true;
      }
    }
    expect(fired).toBe(true);
  });

  it("fires the 60-65 step-down independently of the 40-45 one", () => {
    // 60 at game start
    const game = withBirthDate("aging-step2", "1966-01-15");
    let fired = false;
    for (let i = 0; i < 260; i++) {
      game.submitWeek(WORK);
      if (game.eventsForWeek(i).some((e) => e.type === "aging.stepDown" && e.subject === "you")) fired = true;
    }
    expect(fired).toBe(true);
  });

  it("notes a step-down on the weekly summary when it happens to the human", () => {
    const game = withBirthDate("aging-note", "1986-01-15");
    let noted = false;
    for (let i = 0; i < 260 && !noted; i++) {
      const summary = game.submitWeek(WORK);
      if (summary.notes.some((n) => n.toLowerCase().includes("step down"))) noted = true;
    }
    expect(noted).toBe(true);
  });

  it("balance constants describe two non-overlapping, ordered windows", () => {
    expect(b.step1FromAge).toBeLessThan(b.step1ToAge);
    expect(b.step1ToAge).toBeLessThanOrEqual(b.step2FromAge);
    expect(b.step2FromAge).toBeLessThan(b.step2ToAge);
  });

  describe("fitness credit", () => {
    // Real case this exists for: Magnus Edby, a 64-year-old +60 world
    // champion described as "a physical monster... strong and fit" — his
    // exceptional endurance/coreStrength should measurably slow his decline,
    // not just describe him.
    function rawSkill(game: Game, sport: "tt" | "bd" | "sq" | "tn" = "tt"): number {
      return game.serialize().state.players.find((p) => p.identity.id === "you")!.attributes.skills[sport];
    }

    it("erodes skill slower for an above-average-fitness player than a neutral one", () => {
      const neutral = withBirthDateAndFitness("aging-fit-neutral", "1981-01-15", 0.5);
      const fit = withBirthDateAndFitness("aging-fit-high", "1981-01-15", 1.0);
      const neutralBefore = rawSkill(neutral);
      const fitBefore = rawSkill(fit);

      for (let i = 0; i < 10; i++) {
        neutral.submitWeek(WORK);
        fit.submitWeek(WORK);
      }

      const neutralDrop = neutralBefore - rawSkill(neutral);
      const fitDrop = fitBefore - rawSkill(fit);
      expect(fitDrop).toBeLessThan(neutralDrop);
    });

    it("does not slow decline for an at-or-below-average-fitness player", () => {
      const neutral = withBirthDateAndFitness("aging-fit-baseline-a", "1981-01-15", 0.5);
      const belowAverage = withBirthDateAndFitness("aging-fit-baseline-b", "1981-01-15", 0.2);
      const neutralBefore = rawSkill(neutral);
      const belowBefore = rawSkill(belowAverage);

      for (let i = 0; i < 10; i++) {
        neutral.submitWeek(WORK);
        belowAverage.submitWeek(WORK);
      }

      const neutralDrop = neutralBefore - rawSkill(neutral);
      const belowDrop = belowBefore - rawSkill(belowAverage);
      // both get the plain population-uniform curve — no extra punishment
      expect(belowDrop).toBeCloseTo(neutralDrop, 5);
    });

    it("erodes trainable attributes slower for an above-average-fitness player", () => {
      const neutral = withBirthDateAndFitness("aging-fit-attrs-neutral", "1981-01-15", 0.5);
      const fit = withBirthDateAndFitness("aging-fit-attrs-high", "1981-01-15", 1.0);

      for (let i = 0; i < 10; i++) {
        neutral.submitWeek(WORK);
        fit.submitWeek(WORK);
      }

      const neutralAfter = neutral.serialize().state.players.find((p) => p.identity.id === "you")!.attributes;
      const fitAfter = fit.serialize().state.players.find((p) => p.identity.id === "you")!.attributes;
      // fit started at 1.0 (the ceiling) and neutral at 0.5, so compare the
      // fraction each has decayed from their own starting point instead of
      // raw values.
      expect((1.0 - fitAfter.endurance) / 1.0).toBeLessThan((0.5 - neutralAfter.endurance) / 0.5);
    });
  });
});
