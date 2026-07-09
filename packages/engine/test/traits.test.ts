import { describe, expect, it } from "vitest";
import { Rng } from "../src/core/rng.js";
import { rollTraits } from "../src/world/factory.js";
import { testContent } from "./fixtures.js";

describe("rollTraits", () => {
  it("never picks two traits that mutually exclude each other, across many seeds", () => {
    for (let i = 0; i < 200; i++) {
      const rng = new Rng(`trait-seed-${i}`);
      const traits = rollTraits(rng, testContent);
      expect(traits.length).toBeGreaterThanOrEqual(3);
      expect(traits.length).toBeLessThanOrEqual(4);
      expect(new Set(traits).size).toBe(traits.length); // no duplicates
      for (const id of traits) {
        const excludes = testContent.traits[id]?.excludes ?? [];
        for (const other of traits) {
          if (other === id) continue;
          expect(excludes, `${id} should not co-occur with ${other}`).not.toContain(other);
        }
      }
    }
  });

  it("is deterministic for a given seed", () => {
    const a = rollTraits(new Rng("same-seed"), testContent);
    const b = rollTraits(new Rng("same-seed"), testContent);
    expect(a).toEqual(b);
  });
});
