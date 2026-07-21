import { describe, expect, it } from "vitest";
import {
  BALANCE,
  Game,
  Rng,
  createMatch,
  injuryAgeMultiplier,
  matchAgeModifier,
  pointWinProbability,
  recoveryAgeMultiplier,
  trainingAgeMultiplier,
} from "../src/index.js";
import { planWith, testContent } from "./fixtures.js";

const b = BALANCE.age;

/** Same seed, different birthDate — isolates the age effect from everything else. */
function withBirthDate(seed: string, birthDate: string): Game {
  const game = Game.newGame({ content: testContent, seed });
  const save = game.serialize();
  save.state.players.find((p) => p.identity.id === "you")!.identity.birthDate = birthDate;
  return Game.fromSave(save, testContent);
}

describe("trainingAgeMultiplier", () => {
  it("gives the full youth bonus at or below the bonus age", () => {
    expect(trainingAgeMultiplier(b.youthBonusUntilAge)).toBeCloseTo(1 + b.youthLearningBonus, 5);
    expect(trainingAgeMultiplier(10)).toBeCloseTo(1 + b.youthLearningBonus, 5);
  });

  it("tapers linearly from the youth bonus down to 1.0", () => {
    const mid = (b.youthBonusUntilAge + b.youthTaperEndAge) / 2;
    const atMid = trainingAgeMultiplier(mid);
    expect(atMid).toBeLessThan(1 + b.youthLearningBonus);
    expect(atMid).toBeGreaterThan(1);
  });

  it("is neutral (1.0) through the whole prime window", () => {
    expect(trainingAgeMultiplier(b.youthTaperEndAge)).toBeCloseTo(1, 5);
    expect(trainingAgeMultiplier(b.declineFromAge)).toBeCloseTo(1, 5);
    expect(trainingAgeMultiplier(28)).toBeCloseTo(1, 5);
  });

  it("declines gently past the decline age, never below the floor", () => {
    const justPast = trainingAgeMultiplier(b.declineFromAge + 1);
    expect(justPast).toBeLessThan(1);
    expect(trainingAgeMultiplier(100)).toBeCloseTo(b.learningDeclineFloor, 5);
  });
});

describe("matchAgeModifier", () => {
  it("is zero before the experience window opens", () => {
    expect(matchAgeModifier(b.experienceFromAge)).toBe(0);
    expect(matchAgeModifier(18)).toBe(0);
  });

  it("gives prime-veteran players (experienced, not yet declining) a small bonus", () => {
    const primeAge = (b.experienceFromAge + b.declineFromAge) / 2;
    expect(matchAgeModifier(primeAge)).toBeGreaterThan(0);
  });

  it("goes negative once physical decline outpaces the capped experience bonus", () => {
    expect(matchAgeModifier(60)).toBeLessThan(0);
  });

  it("never drops below decline floor + experience cap", () => {
    const floor = b.declineFloor + b.experienceCap;
    expect(matchAgeModifier(120)).toBeGreaterThanOrEqual(floor);
  });
});

describe("recoveryAgeMultiplier", () => {
  it("is 1.0 up to the recovery decline age", () => {
    expect(recoveryAgeMultiplier(b.recoveryDeclineFromAge)).toBe(1);
    expect(recoveryAgeMultiplier(20)).toBe(1);
  });

  it("declines past that age, floored", () => {
    expect(recoveryAgeMultiplier(b.recoveryDeclineFromAge + 10)).toBeLessThan(1);
    expect(recoveryAgeMultiplier(200)).toBeCloseTo(b.recoveryFloorMult, 5);
  });
});

describe("injuryAgeMultiplier", () => {
  it("is 1.0 up to the injury risk age", () => {
    expect(injuryAgeMultiplier(b.injuryRiskFromAge)).toBe(1);
    expect(injuryAgeMultiplier(20)).toBe(1);
  });

  it("rises past that age, capped", () => {
    expect(injuryAgeMultiplier(b.injuryRiskFromAge + 5)).toBeGreaterThan(1);
    expect(injuryAgeMultiplier(200)).toBeCloseTo(1 + b.injuryRiskCap, 5);
  });
});

describe("age wired into the actual systems (not just the pure curve functions)", () => {
  it("an older player's match effective strength is lower at identical skill", () => {
    const skills = { tt: 500, bd: 500, sq: 500, tn: 500 };
    const formBySport = { tt: 20, bd: 20, sq: 20, tn: 20 };
    const young = { id: "a", name: "a", skills, formBySport, fatigue: 0, endurance: 0.5, composure: 0.5, clutch: 0.5, age: 26, durability: 0.5, coreStrength: 0.5 };
    const old = { id: "a", name: "a", skills, formBySport, fatigue: 0, endurance: 0.5, composure: 0.5, clutch: 0.5, age: 70, durability: 0.5, coreStrength: 0.5 };
    const opponent = { id: "b", name: "b", skills, formBySport, fatigue: 0, endurance: 0.5, composure: 0.5, clutch: 0.5, age: 26, durability: 0.5, coreStrength: 0.5 };

    // "normal" tactic has zero chaos, so this is fully deterministic
    const mYoung = createMatch(young, opponent, "age-match-young");
    const mOld = createMatch(old, opponent, "age-match-old");
    const rng = new Rng("probe");
    const pYoung = pointWinProbability(mYoung, rng);
    const pOld = pointWinProbability(mOld, rng);

    expect(pYoung).toBeCloseTo(0.5, 5); // identical inputs except age -> even odds
    expect(pOld).toBeLessThan(pYoung);
  });

  it("an older player recovers fatigue more slowly under an identical plan", () => {
    const plan = planWith({ work: 15, rest: 6 });
    const young = withBirthDate("age-int-recovery", "2000-01-01"); // ~26 at game start
    const old = withBirthDate("age-int-recovery", "1955-01-01"); // ~71 at game start

    const youngSummary = young.submitWeek(plan);
    const oldSummary = old.submitWeek(plan);

    expect(oldSummary.fatigue.value).toBeGreaterThan(youngSummary.fatigue.value);
  });

  it("an older player trains slower under an identical plan", () => {
    const plan = planWith({ trainTT: 5, work: 16 });
    const young = withBirthDate("age-int-training", "2000-01-01");
    const old = withBirthDate("age-int-training", "1955-01-01");

    const youngSummary = young.submitWeek(plan);
    const oldSummary = old.submitWeek(plan);

    expect(oldSummary.sports.tt.skillDelta).toBeLessThan(youngSummary.sports.tt.skillDelta);
  });

  it("an older player is more likely to get injured under identical reckless training", () => {
    // Both runs share the same world seed, so InjurySystem's RNG draw for
    // "you" is the exact same random number in both — only the age-scaled
    // chance threshold differs. That makes this deterministic rather than
    // statistical: old_chance >= young_chance always, so young-injured must
    // imply old-injured too, and never the reverse. We just need one seed
    // where old crosses the (higher) threshold and young doesn't, to prove
    // the effect is real rather than a no-op.
    const heavyPlan = planWith({ trainTT: 14 });
    let foundDiscriminatingSeed = false;
    for (let i = 0; i < 60; i++) {
      const seed = `age-int-injury-${i}`;
      const youngInjured = withBirthDate(seed, "2000-01-01")
        .submitWeek(heavyPlan)
        .notes.some((n) => n.includes("injury"));
      const oldInjured = withBirthDate(seed, "1955-01-01")
        .submitWeek(heavyPlan)
        .notes.some((n) => n.includes("injury"));

      expect(youngInjured && !oldInjured).toBe(false); // never possible
      if (oldInjured && !youngInjured) foundDiscriminatingSeed = true;
    }
    expect(foundDiscriminatingSeed).toBe(true);
  });
});
