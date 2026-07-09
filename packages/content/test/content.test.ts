import { ACTIVITY_TYPES } from "@racketlon/engine";
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
});
