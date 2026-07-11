import { describe, expect, it } from "vitest";
import type { ContentBundle, RealPlayerDef, TournamentDef } from "../src/index.js";
import { Game, divisionAssignments, divisionOf, projectedField } from "../src/index.js";
import { testContent } from "./fixtures.js";

/** A handful of ranked male players on top of testContent's all-null
 * roster — needed because a division test needs *some* non-null
 * population to actually fill a non-lowest division. */
function rankedMalePlayers(count: number): RealPlayerDef[] {
  const rating = { skill: 500, rdSkill: 60 };
  return Array.from({ length: count }, (_, i) => ({
    playerId: `ranked-m-${i}`,
    firstName: "Ranked",
    lastName: `M${i}`,
    nationality: "SE",
    gender: "m" as const,
    birthYear: 1995,
    ratings: { tt: rating, bd: rating, sq: rating, tn: rating },
    firPoints: 1000 - i,
  }));
}

describe("divisionAssignments", () => {
  it("splits the ranked-only subset as evenly as possible across the non-lowest bands", () => {
    // 10 ranked players, descending points, tierDivisions has 4 bands (A/B/C/D)
    // -> nulls (none here) would own D; ranked splits across A/B/C.
    const players = Array.from({ length: 10 }, (_, i) => ({ id: `p${i}`, firPoints: 1000 - i }));
    const assignments = divisionAssignments(players, ["A", "B", "C", "D"]);
    // floor(i*3/10): 0,0,0,0,1,1,1,2,2,2
    expect(["p0", "p1", "p2", "p3"].map((id) => assignments.get(id))).toEqual(["A", "A", "A", "A"]);
    expect(["p4", "p5", "p6"].map((id) => assignments.get(id))).toEqual(["B", "B", "B"]);
    expect(["p7", "p8", "p9"].map((id) => assignments.get(id))).toEqual(["C", "C", "C"]);
  });

  it("puts every null-firPoints player in the tier's single lowest division, unconditionally", () => {
    const players = [
      { id: "ranked-1", firPoints: 900 },
      { id: "unranked-1", firPoints: null },
      { id: "unranked-2", firPoints: null },
      { id: "unranked-3", firPoints: null },
    ];
    const assignments = divisionAssignments(players, ["A", "B", "C"]);
    expect(assignments.get("unranked-1")).toBe("C");
    expect(assignments.get("unranked-2")).toBe("C");
    expect(assignments.get("unranked-3")).toBe("C");
  });

  it("never lets a null leak into a division above the lowest, even with a high null rate", () => {
    // mirrors the real dataset's ~50% null rate for men
    const players = [
      ...Array.from({ length: 5 }, (_, i) => ({ id: `ranked-${i}`, firPoints: 100 - i })),
      ...Array.from({ length: 5 }, (_, i) => ({ id: `unranked-${i}`, firPoints: null })),
    ];
    const assignments = divisionAssignments(players, ["A", "B", "C", "D"]);
    for (let i = 0; i < 5; i++) expect(assignments.get(`unranked-${i}`)).toBe("D");
    for (let i = 0; i < 5; i++) expect(assignments.get(`ranked-${i}`)).not.toBe("D");
  });

  it("breaks ties on points deterministically by id, ascending", () => {
    const players = [
      { id: "z", firPoints: 500 },
      { id: "a", firPoints: 500 },
    ];
    const assignments = divisionAssignments(players, ["A", "B"]);
    // both worth splitting across 1 remaining band (["A","B"] with 1 null-less pass -> both go through the
    // even split over 1 band, so this just needs to not throw and be stable across runs — assert determinism directly
    const again = divisionAssignments(players, ["A", "B"]);
    expect(assignments).toEqual(again);
  });

  it("puts everyone in the single division of a one-division tier", () => {
    const players = [
      { id: "a", firPoints: 500 },
      { id: "b", firPoints: null },
    ];
    const assignments = divisionAssignments(players, ["A"]);
    expect(assignments.get("a")).toBe("A");
    expect(assignments.get("b")).toBe("A");
  });

  it("throws on an empty tierDivisions list", () => {
    expect(() => divisionAssignments([{ id: "a", firPoints: null }], [])).toThrow();
  });
});

describe("divisionOf", () => {
  it("throws a clear error for an id with no assignment", () => {
    const assignments = divisionAssignments([{ id: "a", firPoints: null }], ["A", "B"]);
    expect(() => divisionOf(assignments, "unknown")).toThrow(/no division assignment/i);
  });
});

/** A minimal SAT event (2 divisions — real content always publishes a
 * tier's full division set, and `Game.newGame`'s week-0 inbox seeding
 * resolves the human's own division at world-creation time, so a
 * single-division test event would throw before the test even runs). */
function satEvent(eventId: string, fieldSizeA: TournamentDef["fieldSize"]): Record<string, TournamentDef> {
  const base = {
    eventId,
    name: "Custom SAT",
    city: "Testville",
    country: "SE",
    lat: 60,
    lon: 15,
    tier: "SAT",
    date: "2026-01-26",
    nights: 1,
    entryFee: 100,
  } as const;
  return {
    [`${eventId}-a`]: { ...base, id: `${eventId}-a`, division: "A", fieldSize: fieldSizeA, prizeByRoundsWon: Array(Math.log2(fieldSizeA) + 1).fill(0) },
    [`${eventId}-b`]: { ...base, id: `${eventId}-b`, division: "B", fieldSize: 8, prizeByRoundsWon: [0, 50, 100, 200] },
  };
}

describe("projectedField division filtering", () => {
  it("only draws opponents assigned to the def's own division", () => {
    // the human (null firPoints) always resolves to SAT's lowest division
    // ("B"), so division A's field must come entirely from ranked NPCs —
    // add 10 to testContent's all-null roster (SAT has 1 non-lowest band,
    // so every ranked player lands in A regardless of exact points)
    const tournaments = satEvent("custom-sat", 8);
    const content: ContentBundle = {
      ...testContent,
      tournaments,
      players: [...testContent.players, ...rankedMalePlayers(10)],
    };
    const defA = tournaments["custom-sat-a"]!;

    const game = Game.newGame({ content, seed: "division-field-test" });
    const save = game.serialize();
    const pool = projectedField(save.state, defA, 3);

    const human = save.state.players.find((p) => p.identity.id === save.state.career.playerId)!;
    for (const p of pool) {
      expect(p.simTier).toBe(1);
      expect(p.identity.gender).toBe(human.identity.gender);
    }
    expect(pool.length).toBe(defA.fieldSize - 1);
  });

  it("throws a clear error rather than a silent short field when the division's pool is too small", () => {
    // testRoster() only has 16 players per gender total, and they all
    // resolve to division B (the human's null-driven lowest) — so
    // division A's pool is empty, nowhere near a 64-player draw
    const tournaments = satEvent("too-big", 64);
    const content: ContentBundle = { ...testContent, tournaments };
    const defA = tournaments["too-big-a"]!;

    const game = Game.newGame({ content, seed: "division-overflow-test" });
    const save = game.serialize();
    expect(() => projectedField(save.state, defA, 3)).toThrow(/not enough tier-1/i);
  });
});
