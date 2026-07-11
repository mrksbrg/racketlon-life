import { describe, expect, it } from "vitest";
import type { RankingMatrix } from "../src/index.js";
import { firPointsTotal, rankingPointsFor } from "../src/index.js";

const MATRIX: RankingMatrix = {
  SAT: { A: [100, 60, 40, 20], B: [50, 30, 20, 10] },
  IWT: { A: [200, 120, 80, 40] },
  CHA: { A: [80, 48, 32, 16] },
  "World Championships": { A: [1000, 600, 400, 200] },
  SWT: { A: [500, 300, 200, 100] },
};

describe("rankingPointsFor", () => {
  it("looks up points by tier, class, and exact finishing position", () => {
    expect(rankingPointsFor("SAT", "A", 1, 8, MATRIX)).toBe(100);
    expect(rankingPointsFor("SAT", "A", 4, 8, MATRIX)).toBe(20);
    expect(rankingPointsFor("SAT", "B", 2, 8, MATRIX)).toBe(30);
  });

  it("clamps a finishing position beyond the table to its last (49+) row", () => {
    expect(rankingPointsFor("SAT", "A", 4, 8, MATRIX)).toBe(rankingPointsFor("SAT", "A", 99, 8, MATRIX));
  });

  it("awards zero points when fewer than 3 players took part (FIR Ranking Regs 4.2)", () => {
    expect(rankingPointsFor("SAT", "A", 1, 2, MATRIX)).toBe(0);
    expect(rankingPointsFor("SAT", "A", 1, 1, MATRIX)).toBe(0);
    expect(rankingPointsFor("SAT", "A", 1, 3, MATRIX)).toBeGreaterThan(0);
  });

  it("throws for a tier or class missing from the matrix (content-authoring gap)", () => {
    expect(() => rankingPointsFor("Nonexistent", "A", 1, 8, MATRIX)).toThrow(/no ranking matrix/i);
    expect(() => rankingPointsFor("SAT", "Z", 1, 8, MATRIX)).toThrow(/no ranking matrix/i);
  });
});

describe("firPointsTotal", () => {
  it("sums everything when there's nothing to cap", () => {
    const ledger = [
      { weekIndex: 0, tournamentId: "a", tier: "SAT", points: 40 },
      { weekIndex: 1, tournamentId: "b", tier: "CHA", points: 80 },
    ];
    expect(firPointsTotal(ledger, 10)).toBe(120);
  });

  it("drops results outside the 24-month rolling window", () => {
    const ledger = [
      { weekIndex: 0, tournamentId: "old", tier: "IWT", points: 500 },
      { weekIndex: 100, tournamentId: "recent", tier: "IWT", points: 40 },
    ];
    // currentWeek 105: "old" (105 weeks back) is outside the window, "recent" (5 back) is in
    expect(firPointsTotal(ledger, 105)).toBe(40);
  });

  it("credits the best 2 CHA/SAT results in their own bucket, but a 3rd can still count in the general best-8 bucket", () => {
    // Ranking Regs 3: "...eight (8) best tournaments of WC/SWT/IWT/CHA/SAT
    // (but not including the two best Challengers/Satellites as above)" — a
    // CHA/SAT result outside the top 2 is NOT excluded from the general pool,
    // just from double-counting in the CHA/SAT-only bucket.
    const ledger = [
      { weekIndex: 0, tournamentId: "sat1", tier: "SAT", points: 10 },
      { weekIndex: 1, tournamentId: "sat2", tier: "SAT", points: 20 },
      { weekIndex: 2, tournamentId: "cha1", tier: "CHA", points: 30 },
    ];
    // CHA/SAT bucket: best 2 of {10,20,30} = 30+20 = 50; the leftover (sat1,
    // 10) still competes for the general best-8 bucket and wins a slot there
    expect(firPointsTotal(ledger, 10)).toBe(60);
  });

  it("never double-counts a CHA/SAT result across both buckets", () => {
    const ledger = [{ weekIndex: 0, tournamentId: "sat1", tier: "SAT", points: 10 }];
    // sat1 is one of the "best 2" CHA/SAT (trivially, it's the only one) —
    // it must not also be picked again in the general best-8 loop
    expect(firPointsTotal(ledger, 10)).toBe(10);
  });

  it("caps at 1 World Championships and 3 SWT results", () => {
    const ledger = [
      { weekIndex: 0, tournamentId: "wc1", tier: "World Championships", points: 100 },
      { weekIndex: 1, tournamentId: "wc2", tier: "World Championships", points: 90 },
      { weekIndex: 2, tournamentId: "swt1", tier: "SWT", points: 50 },
      { weekIndex: 3, tournamentId: "swt2", tier: "SWT", points: 40 },
      { weekIndex: 4, tournamentId: "swt3", tier: "SWT", points: 30 },
      { weekIndex: 5, tournamentId: "swt4", tier: "SWT", points: 20 },
    ];
    // best WC only (100, wc2 dropped) + best 3 SWT (50+40+30, swt4 dropped) = 220
    expect(firPointsTotal(ledger, 10)).toBe(220);
  });

  it("is zero for an empty ledger", () => {
    expect(firPointsTotal([], 10)).toBe(0);
  });
});
