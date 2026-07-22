import { describe, expect, it } from "vitest";
import type { MatchPlayerRef, MatchState, Tactic } from "../src/index.js";
import { aiChooseTactic, createMatch, playPoint, resumeMatch, setTactic, SPORTS } from "../src/index.js";

function ref(id: string, overrides: Partial<MatchPlayerRef> = {}): MatchPlayerRef {
  return {
    id,
    name: id,
    skills: { tt: 500, bd: 500, sq: 500, tn: 500 },
    formBySport: { tt: 20, bd: 20, sq: 20, tn: 20 },
    fatigue: 20,
    endurance: 0.5,
    composure: 0.5,
    clutch: 0.5,
    age: 25, // below BALANCE.age.injuryRiskFromAge — no age-driven bonus risk
    coreStrength: 0.5,
    ...overrides,
  };
}

/** Plays a full match with side "a" locked to `tacticA` at every break, side
 * "b" AI-driven as usual — the same break/point loop `simulateMatchAuto`
 * uses, just with an explicit tactic override for the side under test. */
function driveMatch(seed: string, tacticA: Tactic, refOverridesA: Partial<MatchPlayerRef> = {}): MatchState {
  const m = createMatch(ref("a", refOverridesA), ref("b"), seed);
  let guard = 0;
  while (m.phase !== "finished" && ++guard < 2000) {
    if (m.phase === "break") {
      setTactic(m, "a", tacticA);
      setTactic(m, "b", aiChooseTactic(m, "b"));
      resumeMatch(m);
    } else {
      playPoint(m);
    }
  }
  return m;
}

describe("match-time injury risk", () => {
  it("a retirement leaves MatchState internally consistent", () => {
    // search a handful of seeds for one where side "a" retires under allOut
    // — squash carries the highest tacticEnergyMult (2.5), so it's the
    // fastest tactic to find a hit with.
    let found: MatchState | null = null;
    for (let i = 0; i < 500 && !found; i++) {
      const m = driveMatch(`retire-consistency-${i}`, "allOut");
      if (m.retiredSide === "a") found = m;
    }
    expect(found).not.toBeNull();
    const m = found!;
    expect(m.phase).toBe("finished");
    expect(m.winner).toBe("b");
    expect(SPORTS).toContain(m.retiredSport);
  });

  it("allOut retires meaningfully more often than conserve (same tactic ratio the energy cost uses)", () => {
    const TRIALS = 300;
    let allOutRetirements = 0;
    let conserveRetirements = 0;
    for (let i = 0; i < TRIALS; i++) {
      if (driveMatch(`allout-risk-${i}`, "allOut").retiredSide === "a") allOutRetirements++;
      if (driveMatch(`conserve-risk-${i}`, "conserve").retiredSide === "a") conserveRetirements++;
    }
    expect(allOutRetirements).toBeGreaterThan(0);
    expect(allOutRetirements).toBeGreaterThan(conserveRetirements);
  }, 20000);

  it("coreStrength meaningfully reduces retirement frequency (durability plays no role in risk)", () => {
    const TRIALS = 300;
    let weakRetirements = 0;
    let strongRetirements = 0;
    for (let i = 0; i < TRIALS; i++) {
      if (driveMatch(`weak-core-${i}`, "allOut", { coreStrength: 0 }).retiredSide === "a") weakRetirements++;
      if (driveMatch(`strong-core-${i}`, "allOut", { coreStrength: 1 }).retiredSide === "a") strongRetirements++;
    }
    expect(weakRetirements).toBeGreaterThan(0);
    expect(weakRetirements).toBeGreaterThan(strongRetirements);
  }, 20000);

  it("is deterministic for a given seed", () => {
    const run = () => driveMatch("match-injury-det", "allOut");
    const a = run();
    const b = run();
    expect(a.retiredSide).toBe(b.retiredSide);
    expect(a.retiredSport).toBe(b.retiredSport);
    expect(a.winner).toBe(b.winner);
  });
});
