import { describe, expect, it } from "vitest";
import { BALANCE, distanceKm, travelCost, travelDays } from "../src/index.js";
import { testContent } from "./fixtures.js";

describe("distanceKm", () => {
  it("is zero for the same point", () => {
    expect(distanceKm(60, 15, 60, 15)).toBe(0);
  });

  it("is symmetric", () => {
    expect(distanceKm(60, 15, 40, 5)).toBeCloseTo(distanceKm(40, 5, 60, 15), 6);
  });

  it("matches a known great-circle distance (SE ⇄ NO test fixtures, ~550km)", () => {
    const km = distanceKm(60, 15, 60, 5);
    expect(km).toBeGreaterThan(500);
    expect(km).toBeLessThan(600);
  });
});

describe("travelCost", () => {
  const home = testContent.countries.SE!;
  const def = testContent.tournaments["intl-open-1-m"]!;

  it("is zero for a domestic tournament (same country as home)", () => {
    const domesticDef = testContent.tournaments["monthly-open-1-m"]!;
    const cost = travelCost("SE", domesticDef, testContent);
    expect(cost).toEqual({ flight: 0, stay: 0, total: 0 });
  });

  it("computes flight + stay for a foreign tournament, matching the balance formula exactly", () => {
    const cost = travelCost("SE", def, testContent);
    const host = testContent.countries.NO!;
    const km = distanceKm(home.lat, home.lon, def.lat, def.lon);
    const expectedFlight = Math.round(BALANCE.travel.baseFare + BALANCE.travel.perKm * km);
    const expectedStay = Math.round(BALANCE.travel.dailyCostBase * def.nights * host.costIndex);
    expect(cost.flight).toBe(expectedFlight);
    expect(cost.stay).toBe(expectedStay);
    expect(cost.total).toBe(expectedFlight + expectedStay);
  });

  it("a more expensive host country (higher costIndex) costs more to stay in, distance held equal", () => {
    const cheap = travelCost("SE", def, testContent);
    const expensiveContent = {
      ...testContent,
      countries: { ...testContent.countries, NO: { ...testContent.countries.NO!, costIndex: 3 } },
    };
    const expensive = travelCost("SE", def, expensiveContent);
    expect(expensive.stay).toBeGreaterThan(cheap.stay);
    expect(expensive.flight).toBe(cheap.flight); // distance unchanged
  });

  it("falls back to zero rather than throwing when a country is missing from content", () => {
    const contentMissingHost = {
      ...testContent,
      countries: { SE: testContent.countries.SE! },
    };
    expect(travelCost("SE", def, contentMissingHost)).toEqual({ flight: 0, stay: 0, total: 0 });
  });
});


describe("travelDays", () => {
  it("blocks no days for a nearby drive, one day for regional travel, and two days for intercontinental travel", () => {
    const domesticDef = testContent.tournaments["monthly-open-1-m"]!;
    const regionalDef = testContent.tournaments["intl-open-1-m"]!;
    const longHaulContent = {
      ...testContent,
      countries: {
        ...testContent.countries,
        AT: { name: "Austria", lat: 47.5, lon: 14.5, costIndex: 1 },
        NZ: { name: "New Zealand", lat: -41.3, lon: 174.8, costIndex: 1.2 },
      },
      tournaments: {
        ...testContent.tournaments,
        "nz-open": { ...regionalDef, id: "nz-open", eventId: "nz-open", country: "NZ", lat: -36.8, lon: 174.8 },
      },
    };

    expect(travelDays("SE", domesticDef, testContent)).toBe(0);
    expect(travelDays("SE", regionalDef, testContent)).toBe(1);
    expect(travelDays("AT", longHaulContent.tournaments["nz-open"]!, longHaulContent)).toBe(2);
  });
});
