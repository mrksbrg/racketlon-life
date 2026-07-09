import { describe, expect, it } from "vitest";
import { glicko2Update } from "../src/systems/glicko.js";

describe("glicko2Update", () => {
  // The official worked example from Glickman's "Example of the Glicko-2
  // system" paper — canonical numbers every Glicko-2 implementation is
  // checked against.
  it("matches Glickman's worked example", () => {
    const player = { rating: 1500, rd: 200, volatility: 0.06 };
    const results = [
      { rating: 1400, rd: 30, score: 1 as const },
      { rating: 1550, rd: 100, score: 0 as const },
      { rating: 1700, rd: 300, score: 0 as const },
    ];
    const after = glicko2Update(player, results, 0.5);
    expect(after.rating).toBeCloseTo(1464.06, 1);
    expect(after.rd).toBeCloseTo(151.52, 1);
    expect(after.volatility).toBeCloseTo(0.05999, 4);
  });

  it("widens RD but leaves rating and volatility alone with no games", () => {
    const player = { rating: 1500, rd: 200, volatility: 0.06 };
    const after = glicko2Update(player, [], 0.5);
    expect(after.rating).toBe(1500);
    expect(after.rd).toBeGreaterThan(200);
    expect(after.volatility).toBe(0.06);
  });

  it("raises rating on an unbroken run of wins", () => {
    const player = { rating: 1500, rd: 60, volatility: 0.06 };
    const results = [
      { rating: 1500, rd: 60, score: 1 as const },
      { rating: 1500, rd: 60, score: 1 as const },
    ];
    const after = glicko2Update(player, results, 0.5);
    expect(after.rating).toBeGreaterThan(1500);
    // playing games narrows uncertainty vs. sitting idle
    expect(after.rd).toBeLessThan(60);
  });
});
