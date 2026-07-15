import { describe, expect, it } from "vitest";
import type { JoinedPlayer } from "./join.js";
import {
  MAP,
  averageSkill,
  clutchFromScore,
  composureFromScore,
  coreStrengthFromScore,
  enduranceFromScore,
  skillFromRating,
  splitName,
  toBundlePlayer,
} from "./mapRatings.js";

describe("skillFromRating", () => {
  it("clamps at the anchors", () => {
    expect(skillFromRating(MAP.R_MIN - 500)).toBe(0);
    expect(skillFromRating(MAP.R_MAX + 500)).toBe(1000);
  });

  it("is monotonically increasing", () => {
    const ratings = [1100, 1300, 1500, 1700, 1900];
    const skills = ratings.map(skillFromRating);
    for (let i = 1; i < skills.length; i++) expect(skills[i]!).toBeGreaterThan(skills[i - 1]!);
  });

  it("maps the midpoint to skill 500", () => {
    expect(skillFromRating((MAP.R_MIN + MAP.R_MAX) / 2)).toBe(500);
  });
});

describe("splitName", () => {
  it("splits on the last space", () => {
    expect(splitName("Jean Claude Van Damme")).toEqual({ firstName: "Jean Claude Van", lastName: "Damme" });
  });

  it("puts a single-word name entirely in firstName", () => {
    expect(splitName("Cher")).toEqual({ firstName: "Cher", lastName: "" });
  });
});

function joined(overrides: Partial<JoinedPlayer> = {}): JoinedPlayer {
  return {
    playerId: "name:test:GER",
    displayName: "Test Player",
    countryIOC: "GER",
    gender: "m",
    birthYear: 1990,
    firPoints: null,
    endurance: 0,
    coreStrength: 0,
    clutch: 0,
    composure: 0,
    ...overrides,
    perSport: {
      tt: { rating: 1500, rd: 150, games: 10 },
      bd: { rating: 1500, rd: 150, games: 10 },
      sq: { rating: 1500, rd: 150, games: 10 },
      tn: null,
      ...overrides.perSport,
    },
  };
}

describe("toBundlePlayer", () => {
  it("maps a well-formed joined player, including nationality and gender", () => {
    const bp = toBundlePlayer(joined());
    expect(bp).not.toBeNull();
    expect(bp!.nationality).toBe("DE");
    expect(bp!.gender).toBe("m");
    expect(bp!.firstName).toBe("Test");
    expect(bp!.lastName).toBe("Player");
  });

  it("returns null for an unrecognised country code", () => {
    expect(toBundlePlayer(joined({ countryIOC: "ZZZ" }))).toBeNull();
  });

  it("gives a missing sport a low-floor skill rather than throwing", () => {
    const bp = toBundlePlayer(joined())!;
    expect(bp.ratings.tn.skill).toBe(MAP.MISSING_SPORT_SKILL);
  });

  it("carries firPoints through unchanged, including null", () => {
    expect(toBundlePlayer(joined({ firPoints: 8200 }))!.firPoints).toBe(8200);
    expect(toBundlePlayer(joined({ firPoints: null }))!.firPoints).toBeNull();
  });
});

describe("averageSkill", () => {
  it("averages across all four sports", () => {
    const bp = toBundlePlayer(joined())!;
    const expected = (bp.ratings.tt.skill + bp.ratings.bd.skill + bp.ratings.sq.skill + bp.ratings.tn.skill) / 4;
    expect(averageSkill(bp)).toBeCloseTo(expected);
  });
});

describe("enduranceFromScore", () => {
  it("clamps at the anchors", () => {
    expect(enduranceFromScore(MAP.ENDURANCE_MIN - 1)).toBe(0);
    expect(enduranceFromScore(MAP.ENDURANCE_MAX + 1)).toBe(1);
  });

  it("maps a neutral score (0) to the midpoint (0.5)", () => {
    expect(enduranceFromScore(0)).toBeCloseTo(0.5);
  });

  it("is monotonically increasing", () => {
    const scores = [-0.4, -0.1, 0, 0.1, 0.4];
    const mapped = scores.map(enduranceFromScore);
    for (let i = 1; i < mapped.length; i++) expect(mapped[i]!).toBeGreaterThan(mapped[i - 1]!);
  });
});

describe("toBundlePlayer endurance", () => {
  it("carries the mapped endurance score through", () => {
    const bp = toBundlePlayer(joined({ endurance: 0.3 }))!;
    expect(bp.endurance).toBeCloseTo(enduranceFromScore(0.3));
  });
});

describe.each([
  ["coreStrengthFromScore", coreStrengthFromScore, MAP.CORE_STRENGTH_MIN, MAP.CORE_STRENGTH_MAX] as const,
  ["clutchFromScore", clutchFromScore, MAP.CLUTCH_MIN, MAP.CLUTCH_MAX] as const,
  ["composureFromScore", composureFromScore, MAP.COMPOSURE_MIN, MAP.COMPOSURE_MAX] as const,
])("%s", (_name, fn, min, max) => {
  it("clamps at the anchors", () => {
    expect(fn(min - 1)).toBe(0);
    expect(fn(max + 1)).toBe(1);
  });

  it("maps a neutral score (0) to the midpoint (0.5)", () => {
    expect(fn(0)).toBeCloseTo(0.5);
  });

  it("is monotonically increasing", () => {
    const scores = [min, min / 2, 0, max / 2, max];
    const mapped = scores.map(fn);
    for (let i = 1; i < mapped.length; i++) expect(mapped[i]!).toBeGreaterThan(mapped[i - 1]!);
  });
});

describe("toBundlePlayer coreStrength/clutch/composure", () => {
  it("carries the mapped core_strength, clutch, and composure scores through", () => {
    const bp = toBundlePlayer(joined({ coreStrength: 0.2, clutch: -0.1, composure: 0.35 }))!;
    expect(bp.coreStrength).toBeCloseTo(coreStrengthFromScore(0.2));
    expect(bp.clutch).toBeCloseTo(clutchFromScore(-0.1));
    expect(bp.composure).toBeCloseTo(composureFromScore(0.35));
  });
});
