import { describe, expect, it } from "vitest";
import { computus, isPublicHoliday, publicHolidays } from "../src/index.js";
import { testContent } from "./fixtures.js";

describe("computus", () => {
  it("finds known Easter Sundays", () => {
    expect(computus(2026)).toBe("2026-04-05");
    expect(computus(2027)).toBe("2027-03-28");
    expect(computus(2025)).toBe("2025-04-20");
  });
});

describe("publicHolidaySet / isPublicHoliday", () => {
  it("resolves a country's fixed holiday for the given year", () => {
    // testContent SE has a single fixed holiday on 06-10
    expect(isPublicHoliday("SE", "2026-06-10", testContent)).toBe(true);
    expect(isPublicHoliday("SE", "2027-06-10", testContent)).toBe(true);
    expect(isPublicHoliday("SE", "2026-06-11", testContent)).toBe(false);
  });

  it("returns no holidays for a country without a schedule", () => {
    expect(publicHolidays("NO", 2026, testContent)).toEqual([]);
    expect(isPublicHoliday("NO", "2026-06-10", testContent)).toBe(false);
  });

  it("sorts the year's holidays by date", () => {
    const list = publicHolidays("SE", 2026, testContent);
    expect(list.map((h) => h.date)).toEqual([...list.map((h) => h.date)].sort());
  });
});
