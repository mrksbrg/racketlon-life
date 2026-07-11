import { describe, expect, it } from "vitest";
import { LEVEL_MAX, LEVEL_MIN_SKILL, SKILL_MAX, levelForSkill, levelProgress, skillForLevel } from "../src/index.js";

describe("convex level curve", () => {
  it("has 20 strictly-increasing, convex thresholds starting at 0", () => {
    expect(LEVEL_MIN_SKILL).toHaveLength(LEVEL_MAX);
    expect(LEVEL_MIN_SKILL[0]).toBe(0);
    const widths: number[] = [];
    for (let i = 1; i < LEVEL_MIN_SKILL.length; i++) {
      const w = LEVEL_MIN_SKILL[i]! - LEVEL_MIN_SKILL[i - 1]!;
      expect(w).toBeGreaterThan(0); // strictly increasing thresholds
      widths.push(w);
    }
    // convex: each band is at least as wide as the previous one, and the top
    // band is markedly wider than the bottom (the "harder at high level" feel)
    for (let i = 1; i < widths.length; i++) {
      expect(widths[i]!).toBeGreaterThanOrEqual(widths[i - 1]!);
    }
    expect(widths[widths.length - 1]! / widths[0]!).toBeGreaterThan(2.5);
  });

  it("maps skill to the highest level whose threshold it clears, clamped 1–20", () => {
    expect(levelForSkill(-100)).toBe(1);
    expect(levelForSkill(0)).toBe(1);
    expect(levelForSkill(21)).toBe(1); // just below level 2's threshold (22)
    expect(levelForSkill(22)).toBe(2); // exactly on the threshold
    expect(levelForSkill(LEVEL_MIN_SKILL[19]!)).toBe(20); // 950 → level 20
    expect(levelForSkill(SKILL_MAX)).toBe(20);
    expect(levelForSkill(5000)).toBe(20); // clamped
  });

  it("levelForSkill is monotonic non-decreasing across the whole skill range", () => {
    let prev = 0;
    for (let skill = 0; skill <= SKILL_MAX; skill += 5) {
      const level = levelForSkill(skill);
      expect(level).toBeGreaterThanOrEqual(prev);
      prev = level;
    }
  });

  it("reports band progress in [0,1), full (1) at the cap", () => {
    // just inside level 2's band (22..46): progress is a small positive fraction
    const p = levelProgress(23);
    expect(p).toBeGreaterThan(0);
    expect(p).toBeLessThan(1);
    // start of a band → ~0
    expect(levelProgress(LEVEL_MIN_SKILL[9]!)).toBeCloseTo(0, 5); // exactly level 10's threshold
    // level 20 is pinned full
    expect(levelProgress(LEVEL_MIN_SKILL[19]!)).toBe(1);
    expect(levelProgress(SKILL_MAX)).toBe(1);
  });

  it("skillForLevel round-trips: levelForSkill(skillForLevel(L)) === L for every level", () => {
    for (let level = 1; level <= LEVEL_MAX; level++) {
      expect(levelForSkill(skillForLevel(level))).toBe(level);
    }
  });

  it("skillForLevel lands mid-band (strictly inside each level's range)", () => {
    for (let level = 1; level < LEVEL_MAX; level++) {
      const s = skillForLevel(level);
      expect(s).toBeGreaterThan(LEVEL_MIN_SKILL[level - 1]!);
      expect(s).toBeLessThan(LEVEL_MIN_SKILL[level]!);
    }
    // level 20 sits above its (open-ended) threshold
    expect(skillForLevel(20)).toBeGreaterThan(LEVEL_MIN_SKILL[19]!);
  });

  it("clamps out-of-range level inputs", () => {
    expect(skillForLevel(0)).toBe(skillForLevel(1));
    expect(skillForLevel(99)).toBe(skillForLevel(20));
  });
});
