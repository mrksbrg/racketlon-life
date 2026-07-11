import { ACTIVITY_TYPES, BALANCE, divisionAssignments } from "@racketlon/engine";
import { describe, expect, it } from "vitest";
import { defaultContent } from "../src/index.js";

describe("default content bundle", () => {
  it("covers every activity type with a matching id", () => {
    for (const type of ACTIVITY_TYPES) {
      const def = defaultContent.activities[type];
      expect(def, `missing activity ${type}`).toBeDefined();
      expect(def.id).toBe(type);
    }
  });

  it("gives every sport-training activity a trainingBase", () => {
    for (const def of Object.values(defaultContent.activities)) {
      if (def.sport) expect(def.trainingBase).toBeGreaterThan(0);
    }
  });

  it("has at least one name pool", () => {
    expect(Object.keys(defaultContent.names).length).toBeGreaterThan(0);
  });

  it("gives every tournament's host country a countries.json entry", () => {
    // a missing entry wouldn't fail loudly — travelCost() falls back to zero
    // rather than throwing — so this is the guard against a silent $0 trip
    for (const t of Object.values(defaultContent.tournaments)) {
      expect(defaultContent.countries[t.country], `missing country ${t.country} (${t.name})`).toBeDefined();
    }
  });

  it("has at least one trait per tone, and every excludes id points at a real trait", () => {
    const traits = Object.values(defaultContent.traits);
    for (const tone of ["positive", "negative", "neutral"] as const) {
      expect(traits.some((t) => t.tone === tone), `no ${tone} traits`).toBe(true);
    }
    for (const t of traits) {
      for (const id of t.excludes ?? []) {
        expect(defaultContent.traits[id], `${t.id} excludes unknown trait ${id}`).toBeDefined();
      }
    }
  });

  it("keeps excludes symmetric (if A excludes B, B excludes A)", () => {
    for (const t of Object.values(defaultContent.traits)) {
      for (const id of t.excludes ?? []) {
        const other = defaultContent.traits[id]!;
        expect(other.excludes ?? [], `${id} should exclude ${t.id} back`).toContain(t.id);
      }
    }
  });

  it("has at least 63 real players per gender (a deep enough pool for any single draw)", () => {
    // NB: no single bracket is actually 64 players anymore (tournaments are
    // split into A/B/C/D divisions, each fieldSize <= 16) — this is a general
    // roster-depth sanity check now, not tied to one specific draw size.
    const men = defaultContent.players.filter((p) => p.gender === "m");
    const women = defaultContent.players.filter((p) => p.gender === "f");
    expect(men.length).toBeGreaterThanOrEqual(63);
    expect(women.length).toBeGreaterThanOrEqual(63);
  });

  it("gives every real player a valid ISO-2 nationality", () => {
    for (const p of defaultContent.players) {
      expect(p.nationality, `${p.playerId} nationality`).toMatch(/^[A-Z]{2}$/);
    }
  });

  it("has no duplicate real-player ids", () => {
    const ids = defaultContent.players.map((p) => p.playerId);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("never charges above its tier's FIR entry-fee ceiling", () => {
    for (const t of Object.values(defaultContent.tournaments)) {
      const ceiling = BALANCE.entryFeeCeiling[t.tier];
      expect(ceiling, `no BALANCE.entryFeeCeiling entry for tier "${t.tier}"`).toBeDefined();
      expect(t.entryFee, `${t.id}: entryFee ${t.entryFee} exceeds the ${t.tier} ceiling (${ceiling})`).toBeLessThanOrEqual(
        ceiling!,
      );
    }
  });

  it("gives every tournament tier a ranking-matrix entry with all its divisions covered", () => {
    for (const t of Object.values(defaultContent.tournaments)) {
      const byClass = defaultContent.rankingMatrix[t.tier];
      expect(byClass, `no rankingMatrix entry for tier "${t.tier}"`).toBeDefined();
      const positions = byClass?.[t.division];
      expect(positions, `${t.id}: no rankingMatrix["${t.tier}"]["${t.division}"]`).toBeDefined();
      expect(positions!.length).toBeGreaterThan(0);
    }
  });

  describe("tournament divisions", () => {
    const tournaments = Object.values(defaultContent.tournaments);
    const byEvent = new Map<string, typeof tournaments>();
    for (const t of tournaments) {
      const group = byEvent.get(t.eventId);
      if (group) group.push(t);
      else byEvent.set(t.eventId, [t]);
    }

    it("gives every row a division valid for its tier", () => {
      for (const t of tournaments) {
        const tierDivisions = BALANCE.division.byTier[t.tier];
        expect(tierDivisions, `no BALANCE.division.byTier entry for tier "${t.tier}"`).toBeDefined();
        expect(tierDivisions, `${t.id}: division "${t.division}" not in tier "${t.tier}"`).toContain(t.division);
      }
    });

    it("publishes every division for a tier — no more, no fewer — per event", () => {
      for (const [eventId, rows] of byEvent) {
        const tier = rows[0]!.tier;
        const expected = [...BALANCE.division.byTier[tier]!].sort();
        const actual = rows.map((r) => r.division).sort();
        expect(actual, `${eventId} (${tier})`).toEqual(expected);
      }
    });

    it("keeps shared fields identical across one event's division rows", () => {
      for (const [eventId, rows] of byEvent) {
        for (const field of ["name", "city", "country", "lat", "lon", "date", "nights", "tier"] as const) {
          const values = new Set(rows.map((r) => r[field]));
          expect(values.size, `${eventId}: "${field}" differs across divisions`).toBe(1);
        }
      }
    });

    it("keeps every division's fieldSize under its real same-gender population", () => {
      // the safety net for the real risk found during design: a division's
      // bracket can't be bigger than the actual number of same-gender,
      // same-division players the imported roster contains
      for (const gender of ["m", "f"] as const) {
        const pool = defaultContent.players
          .filter((p) => p.gender === gender)
          .map((p) => ({ id: p.playerId, firPoints: p.firPoints }));

        const byTier = new Map<string, typeof tournaments>();
        for (const t of tournaments) {
          const group = byTier.get(t.tier);
          if (group) group.push(t);
          else byTier.set(t.tier, [t]);
        }

        for (const [tier, rows] of byTier) {
          const tierDivisions = BALANCE.division.byTier[tier]!;
          const assignments = divisionAssignments(pool, tierDivisions);
          const populationByDivision = new Map<string, number>();
          for (const division of assignments.values()) {
            populationByDivision.set(division, (populationByDivision.get(division) ?? 0) + 1);
          }
          for (const t of rows) {
            const population = populationByDivision.get(t.division) ?? 0;
            expect(
              population,
              `${t.id} (${gender}): fieldSize ${t.fieldSize} needs ${t.fieldSize - 1} opponents, only ${population} ${gender} players in division ${t.division}`,
            ).toBeGreaterThanOrEqual(t.fieldSize - 1);
          }
        }
      }
    });
  });
});
