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
  it("splits the ranked-only subset as evenly as possible across the full band range", () => {
    // 10 ranked players, descending points, tierDivisions has 4 bands (A/B/C/D)
    // -> no unranked players here, so ranked alone spans every band.
    const players = Array.from({ length: 10 }, (_, i) => ({ id: `p${i}`, firPoints: 1000 - i, skill: 0 }));
    const assignments = divisionAssignments(players, ["A", "B", "C", "D"]);
    // floor(i*4/10): 0,0,0,1,1,2,2,2,3,3
    expect(["p0", "p1", "p2"].map((id) => assignments.get(id))).toEqual(["A", "A", "A"]);
    expect(["p3", "p4"].map((id) => assignments.get(id))).toEqual(["B", "B"]);
    expect(["p5", "p6", "p7"].map((id) => assignments.get(id))).toEqual(["C", "C", "C"]);
    expect(["p8", "p9"].map((id) => assignments.get(id))).toEqual(["D", "D"]);
  });

  it("bands unranked players by skill instead of dumping them all into the lowest band", () => {
    // a strong unranked player (no FIR-counted result yet, but clearly not
    // weak) should reach "A" right alongside a genuinely top-ranked player —
    // the real-world dataset shows unranked players are NOT weaker on
    // average, so treating "no points on file" as "weakest" would let
    // strong players sandbag the bottom bracket.
    const players = [
      { id: "ranked-1", firPoints: 900, skill: 0 },
      { id: "strong-unranked", firPoints: null, skill: 900 },
      { id: "mid-unranked", firPoints: null, skill: 500 },
      { id: "weak-unranked", firPoints: null, skill: 50 },
    ];
    const assignments = divisionAssignments(players, ["A", "B", "C"]);
    expect(assignments.get("ranked-1")).toBe("A");
    expect(assignments.get("strong-unranked")).toBe("A");
    expect(assignments.get("mid-unranked")).toBe("B");
    expect(assignments.get("weak-unranked")).toBe("C");
  });

  it("bands ranked and unranked populations independently, so the lowest band can hold both", () => {
    // mirrors the real dataset's ~50% null rate for men — 5 ranked + 5
    // unranked, each spanning all 4 bands on their own metric. The weakest
    // of each population should now share the bottom band, not have it
    // reserved exclusively for unranked players.
    const players = [
      ...Array.from({ length: 5 }, (_, i) => ({ id: `ranked-${i}`, firPoints: 100 - i, skill: 0 })),
      ...Array.from({ length: 5 }, (_, i) => ({ id: `unranked-${i}`, firPoints: null, skill: 500 - i * 100 })),
    ];
    const assignments = divisionAssignments(players, ["A", "B", "C", "D"]);
    expect(assignments.get("unranked-0")).toBe("A"); // strongest unranked
    expect(assignments.get("ranked-4")).toBe("D"); // weakest ranked
    expect(assignments.get("unranked-4")).toBe("D"); // weakest unranked — shares the bottom band now
  });

  it("breaks ties on points deterministically by id, ascending", () => {
    const players = [
      { id: "z", firPoints: 500, skill: 0 },
      { id: "a", firPoints: 500, skill: 0 },
    ];
    const assignments = divisionAssignments(players, ["A", "B"]);
    const again = divisionAssignments(players, ["A", "B"]);
    expect(assignments).toEqual(again);
  });

  it("breaks ties on skill deterministically by id, ascending", () => {
    const players = [
      { id: "z", firPoints: null, skill: 500 },
      { id: "a", firPoints: null, skill: 500 },
    ];
    const assignments = divisionAssignments(players, ["A", "B"]);
    const again = divisionAssignments(players, ["A", "B"]);
    expect(assignments).toEqual(again);
  });

  it("puts everyone in the single division of a one-division tier", () => {
    const players = [
      { id: "a", firPoints: 500, skill: 0 },
      { id: "b", firPoints: null, skill: 0 },
    ];
    const assignments = divisionAssignments(players, ["A"]);
    expect(assignments.get("a")).toBe("A");
    expect(assignments.get("b")).toBe("A");
  });

  it("throws on an empty tierDivisions list", () => {
    expect(() => divisionAssignments([{ id: "a", firPoints: null, skill: 0 }], [])).toThrow();
  });
});

describe("divisionAssignments host wildcards", () => {
  it("promotes the strongest near-cutoff domestic ranked player into the top division", () => {
    // 6 ranked players, 3 bands of 2 -> baseline A:[r0,r1] B:[r2,r3] C:[r4,r5].
    // r2 (top of B, closest to the cutoff) is domestic; count:1 should
    // promote exactly that one player, not reach past them.
    const players = Array.from({ length: 6 }, (_, i) => ({
      id: `r${i}`,
      firPoints: 100 - i,
      skill: 0,
      nationality: i === 2 ? "SE" : "DE",
    }));
    const assignments = divisionAssignments(players, ["A", "B", "C"], { hostCountry: "SE", count: 1 });
    expect(assignments.get("r2")).toBe("A");
    expect(assignments.get("r3")).toBe("B"); // untouched — budget was spent on r2
  });

  it("promotes the strongest near-cutoff domestic unranked player by skill", () => {
    const players = Array.from({ length: 6 }, (_, i) => ({
      id: `u${i}`,
      firPoints: null,
      skill: 100 - i,
      nationality: i === 2 ? "SE" : "DE",
    }));
    const assignments = divisionAssignments(players, ["A", "B", "C"], { hostCountry: "SE", count: 1 });
    expect(assignments.get("u2")).toBe("A");
  });

  it("never promotes a non-domestic player, even if they're the closest to the cutoff", () => {
    const players = Array.from({ length: 6 }, (_, i) => ({ id: `r${i}`, firPoints: 100 - i, skill: 0, nationality: "DE" }));
    const assignments = divisionAssignments(players, ["A", "B", "C"], { hostCountry: "SE", count: 2 });
    expect(assignments.get("r2")).toBe("B"); // no domestic candidates at all — no-op
  });

  it("caps promotions at count, picking the strongest domestic candidates first", () => {
    // r2 and r3 are both domestic and both outside A; count:1 should only
    // reach the stronger (closer-to-cutoff) of the two.
    const players = Array.from({ length: 6 }, (_, i) => ({
      id: `r${i}`,
      firPoints: 100 - i,
      skill: 0,
      nationality: i === 2 || i === 3 ? "SE" : "DE",
    }));
    const assignments = divisionAssignments(players, ["A", "B", "C"], { hostCountry: "SE", count: 1 });
    expect(assignments.get("r2")).toBe("A");
    expect(assignments.get("r3")).toBe("B");
  });

  it("leaves assignments untouched when hostWildcards is omitted", () => {
    const players = Array.from({ length: 6 }, (_, i) => ({ id: `r${i}`, firPoints: 100 - i, skill: 0, nationality: "SE" }));
    const withWildcards = divisionAssignments(players, ["A", "B", "C"], { hostCountry: "SE", count: 1 });
    const without = divisionAssignments(players, ["A", "B", "C"]);
    expect(without.get("r2")).toBe("B");
    expect(withWildcards.get("r2")).toBe("A");
  });
});

describe("divisionOf", () => {
  it("throws a clear error for an id with no assignment", () => {
    const assignments = divisionAssignments([{ id: "a", firPoints: null, skill: 0 }], ["A", "B"]);
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
    // the fallback human's skill is deliberately weak (see fixtures.ts),
    // near the bottom of testRoster's 300-900 skill spread, so they still
    // resolve to SAT's lowest division ("B") even under skill-based
    // unranked banding. Division A's field is now a mix of the strongest
    // testRoster NPCs (skill-banded) and the top half of the 10 added
    // ranked NPCs (points-banded) — either population alone is already
    // more than the fieldSize-8 draw's 7 opponents need.
    const tournaments = satEvent("custom-sat", 8);
    const content: ContentBundle = {
      ...testContent,
      tournaments,
      players: [...testContent.players, ...rankedMalePlayers(10)],
    };
    const defA = tournaments["custom-sat-a"]!;

    const game = Game.newGame({ content, seed: "division-field-test" });
    const save = game.serialize();
    const pool = projectedField(save.state, defA, 3, content);

    const human = save.state.players.find((p) => p.identity.id === save.state.career.playerId)!;
    for (const p of pool) {
      expect(p.simTier).toBe(1);
      expect(p.identity.gender).toBe(human.identity.gender);
    }
    expect(pool.length).toBe(defA.fieldSize - 1);
  });

  it("throws a clear error rather than a silent short field when the division's pool is too small", () => {
    // testRoster()'s strongest ~half (skill-banded) reaches division A, but
    // that's still only a handful of players — nowhere near a 64-player draw.
    const tournaments = satEvent("too-big", 64);
    const content: ContentBundle = { ...testContent, tournaments };
    const defA = tournaments["too-big-a"]!;

    const game = Game.newGame({ content, seed: "division-overflow-test" });
    const save = game.serialize();
    expect(() => projectedField(save.state, defA, 3, content)).toThrow(/not enough tier-1/i);
  });
});
